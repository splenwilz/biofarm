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
    # the leads table matches the model, column for column (a forgotten migration fails here, not in production)
    from app import models  # noqa: F401
    from app.db import Base
    columns = {row[1] for row in db.execute("PRAGMA table_info(leads)")}
    assert columns == set(Base.metadata.tables["leads"].columns.keys())


def test_migrated_schema_has_the_pipedrive_mirror_tables(tmp_path, monkeypatch):
    """The mirror tables come from the migration, with the same columns the models declare."""
    from app import models  # noqa: F401
    from app.db import Base
    from app.mirror import models as mirror_models  # noqa: F401

    db_path = tmp_path / "mig.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    command.upgrade(Config(str(ALEMBIC_INI)), "head")

    db = sqlite3.connect(db_path)
    migrated = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    expected = {"pd_pipelines", "pd_stages", "pd_deal_fields", "pd_deals", "pd_persons", "pd_deal_stage_history", "pd_deal_changes", "pd_import_runs",
                "pd_users", "pd_activities", "pd_leads", "pd_marketing_status_changes", "pd_campaign_stats"}
    assert expected <= migrated
    for table in expected:
        columns = {row[1] for row in db.execute(f"PRAGMA table_info({table})")}
        assert columns == set(Base.metadata.tables[table].columns.keys()), table

    command.downgrade(Config(str(ALEMBIC_INI)), "1bbbed35dc39")  # back to the leads-only schema, whatever sits above the mirror revisions
    remaining = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert not (expected & remaining)
