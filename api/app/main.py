import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from limits import parse
from limits.aio.storage import MemoryStorage
from limits.aio.strategies import MovingWindowRateLimiter
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.config import Settings
from app.db import Base, make_engine
from app.mirror.schedule import import_once, run_periodically, start_clean
from app.routes.dashboard import router as dashboard_router
from app.routes.leads import router as leads_router

MAX_BODY_BYTES = 64 * 1024


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    if settings.environment == "production" and settings.database_url.startswith("sqlite"):
        # SQLite in production is supported only as an absolute file path (the
        # persistent disk). The relative dev default (unset DATABASE_URL),
        # any other relative path, and :memory: would silently lose leads on
        # every restart/deploy - fail the boot instead.
        db_path = make_url(settings.database_url).database or ""
        if not db_path.startswith("/"):
            raise RuntimeError(
                "DATABASE_URL must be an absolute sqlite path (persistent disk)"
                " or a Postgres URL in production"
            )

    if settings.pipedrive_enabled and settings.pipedrive_website_channel is None:
        logging.getLogger("app").warning(
            "BIOFARM_PIPEDRIVE_WEBSITE_CHANNEL is not set: website leads (and the deals they become) reach "
            "Pipedrive with no Source channel, so the dashboard cannot attribute them. Set it to the "
            "'Website' option id of the Source channel deal field (1037 on the Biofarm account)."
        )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = make_engine(settings.database_url)  # SQLite pragmas (WAL, busy_timeout) live in make_engine
        app.state.engine = engine
        app.state.sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
        if settings.auto_create_tables:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
        # The Pipedrive mirror import runs in this process on a timer when
        # configured (see Settings.mirror_import_minutes). First run after a
        # minute so a deploy settles before the API budget is spent.
        app.state.import_task = None
        if settings.mirror_import_minutes > 0 and settings.pipedrive_enabled:
            await start_clean(app.state.sessionmaker)
            app.state.import_task = asyncio.create_task(
                run_periodically(import_once(app.state.sessionmaker, settings), every=settings.mirror_import_minutes * 60),
                name="pipedrive-mirror-import",
            )
        try:
            yield
        finally:
            task = app.state.import_task
            if task is not None:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    logging.getLogger("app.mirror").debug("import schedule stopped")
            await engine.dispose()

    app = FastAPI(
        title="Biofarm Lead API",
        version="0.1.0",
        lifespan=lifespan,
        # No public docs for a lead-capture endpoint
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.settings = settings
    app.state.rate_limiter = MovingWindowRateLimiter(MemoryStorage())
    app.state.rate_limit_item = parse(settings.rate_limit)

    # The dashboard payload is about a megabyte of JSON per page view.
    app.add_middleware(GZipMiddleware, minimum_size=500)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        # GET so the form blocks' warm-up ping to /healthz doesn't log a CORS error
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["content-type"],
        max_age=3600,
    )

    @app.middleware("http")
    async def cap_body_size(request, call_next):
        # uvicorn/FastAPI don't limit body size; lead payloads are tiny.
        # h11 enforces Content-Length framing, so requiring the header (411)
        # also closes the chunked-encoding bypass without wrapping the stream.
        if request.method == "POST":
            length = request.headers.get("content-length")
            if length is None or not length.isdigit():
                return JSONResponse(
                    {"detail": "Content-Length required"}, status_code=411
                )
            if int(length) > MAX_BODY_BYTES:
                return JSONResponse({"detail": "Payload too large"}, status_code=413)
        return await call_next(request)

    app.include_router(leads_router)
    app.include_router(dashboard_router)

    @app.get("/healthz")
    async def healthz() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
