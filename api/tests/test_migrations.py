import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config

ALEMBIC_INI = Path(__file__).parents[1] / "alembic.ini"


def test_migrated_sqlite_schema_accepts_inserts(tmp_path, monkeypatch):
    """Production runs the alembic schema, not create_all - this catches
    Postgres-only DDL frozen into migrations (e.g. DEFAULT now())."""
    db_path = tmp_path / "mig.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    command.upgrade(Config(str(ALEMBIC_INI)), "head")

    db = sqlite3.connect(db_path)
    db.execute(
        "INSERT INTO leads (id, form, name, email, fields, newsletter_opt_in,"
        " spam_flagged, spam_reasons, sync_status) VALUES"
        " ('t1', 'contact', 'T', 't@e.com', '[]', 0, 0, '[]', 'pending')"
    )
    db.commit()
    created_at = db.execute("SELECT created_at FROM leads WHERE id='t1'").fetchone()[0]
    assert created_at  # server default evaluated by SQLite
