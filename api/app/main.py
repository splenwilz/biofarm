from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from limits import parse
from limits.aio.storage import MemoryStorage
from limits.aio.strategies import MovingWindowRateLimiter
from sqlalchemy import event
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import Settings
from app.db import Base
from app.routes.leads import router as leads_router


MAX_BODY_BYTES = 64 * 1024


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    if settings.environment == "production" and settings.database_url.startswith("sqlite"):
        # SQLite in production is supported only as an absolute file path (the
        # persistent disk). The relative dev default (unset DATABASE_URL),
        # any other relative path, and :memory: would silently lose leads on
        # every restart/deploy — fail the boot instead.
        db_path = make_url(settings.database_url).database or ""
        if not db_path.startswith("/"):
            raise RuntimeError(
                "DATABASE_URL must be an absolute sqlite path (persistent disk)"
                " or a Postgres URL in production"
            )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = create_async_engine(settings.database_url)
        if engine.dialect.name == "sqlite":
            # Production SQLite (persistent disk): WAL lets a reader and writer
            # coexist, and busy_timeout makes a second writer wait instead of
            # failing instantly with 'database is locked' when a request commit
            # overlaps a background-task commit.
            @event.listens_for(engine.sync_engine, "connect")
            def _set_sqlite_pragmas(dbapi_conn, _record):
                cursor = dbapi_conn.cursor()
                cursor.execute("PRAGMA journal_mode=WAL")
                cursor.execute("PRAGMA busy_timeout=5000")
                cursor.close()

        app.state.engine = engine
        app.state.sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
        if settings.auto_create_tables:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
        try:
            yield
        finally:
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

    @app.get("/healthz")
    async def healthz() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
