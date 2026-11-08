"""The one engine factory: production SQLite gets WAL and a busy timeout on
every connection, whichever process opens it (web app or import)."""

from sqlalchemy import text

from app.db import make_engine


async def test_sqlite_engine_sets_wal_and_busy_timeout(tmp_path):
    engine = make_engine(f"sqlite+aiosqlite:///{tmp_path}/x.db")
    try:
        async with engine.connect() as conn:
            assert (await conn.execute(text("PRAGMA journal_mode"))).scalar() == "wal"
            assert (await conn.execute(text("PRAGMA busy_timeout"))).scalar() == 5000
    finally:
        await engine.dispose()
