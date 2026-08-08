from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from limits import parse
from limits.aio.storage import MemoryStorage
from limits.aio.strategies import MovingWindowRateLimiter
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import Settings
from app.db import Base
from app.routes.leads import router as leads_router


MAX_BODY_BYTES = 64 * 1024


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    if settings.environment == "production" and settings.database_url.startswith("sqlite"):
        # A missing/misnamed DATABASE_URL must fail the deploy, not silently
        # write leads to the instance's ephemeral disk.
        raise RuntimeError(
            "DATABASE_URL is not set: refusing to run production on SQLite"
        )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = create_async_engine(settings.database_url)
        app.state.engine = engine
        app.state.sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
        if settings.auto_create_tables:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
        yield
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
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > MAX_BODY_BYTES:
            return JSONResponse({"detail": "Payload too large"}, status_code=413)
        return await call_next(request)

    app.include_router(leads_router)

    @app.get("/healthz")
    async def healthz() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
