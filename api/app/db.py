from sqlalchemy import event
from datetime import UTC, datetime

from sqlalchemy import DateTime
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.types import TypeDecorator
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


def make_engine(database_url: str) -> AsyncEngine:
    """The engine every process uses, web app and import alike. On SQLite
    (the production persistent disk) WAL lets a reader and a writer coexist,
    and busy_timeout makes a second writer wait instead of failing at once
    with 'database is locked' when an import commit overlaps a form POST."""
    engine = create_async_engine(database_url)
    if engine.dialect.name == "sqlite":

        @event.listens_for(engine.sync_engine, "connect")
        def _set_sqlite_pragmas(dbapi_conn, _record):
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=5000")
            cursor.close()

    return engine


class UtcDateTime(TypeDecorator[datetime]):
    """A timezone-aware UTC datetime on every backend. Postgres stores
    timestamptz; SQLite stores naive text, so values come back naive there
    and are re-labelled UTC on the way out."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("datetimes must be timezone-aware")
        return value.astimezone(UTC)

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
