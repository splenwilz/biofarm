from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
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
