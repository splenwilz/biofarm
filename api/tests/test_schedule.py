"""The in-process import schedule: the import runs inside the web service
because Render cron jobs cannot reach the service's disk (where the SQLite
database lives)."""

import asyncio
import logging

import pytest

from app.config import Settings
from app.main import create_app
from app.mirror.schedule import run_periodically


async def test_runs_after_the_initial_delay_then_every_interval_and_survives_failures():
    calls: list[float] = []
    loop = asyncio.get_running_loop()

    async def run():
        calls.append(loop.time())
        if len(calls) == 2:
            raise RuntimeError("Pipedrive down")

    stop = asyncio.Event()
    task = asyncio.create_task(run_periodically(run, every=0.05, initial_delay=0.02, stop=stop))
    await asyncio.sleep(0.2)
    stop.set()
    await asyncio.wait_for(task, 1)
    assert len(calls) >= 3  # the failure in run 2 did not end the loop
    assert calls[1] - calls[0] >= 0.04


async def test_a_slow_run_is_not_overlapped_by_the_next_tick():
    running = 0
    overlaps = 0

    async def run():
        nonlocal running, overlaps
        running += 1
        overlaps = max(overlaps, running)
        await asyncio.sleep(0.08)
        running -= 1

    stop = asyncio.Event()
    task = asyncio.create_task(run_periodically(run, every=0.01, initial_delay=0, stop=stop))
    await asyncio.sleep(0.25)
    stop.set()
    await asyncio.wait_for(task, 1)
    assert overlaps == 1


async def test_the_app_schedules_the_import_only_when_configured(tmp_path):
    base = dict(_env_file=None, database_url=f"sqlite+aiosqlite:///{tmp_path}/t.db", environment="test", auto_create_tables=True,
                pipedrive_company_domain="biofarm", pipedrive_api_token="t")
    app = create_app(Settings(**base))
    async with app.router.lifespan_context(app):
        assert app.state.import_task is None
    app = create_app(Settings(**base, mirror_import_minutes=15))
    async with app.router.lifespan_context(app):
        task = app.state.import_task
        assert task is not None and not task.done()
    assert task.done()  # cancelled on shutdown, no import attempted within the test
    # an interval without the Pipedrive credentials is a misconfiguration worth one warning at boot, not silence
    import logging

    warned: list[str] = []
    original = logging.getLogger("app.mirror").warning
    logging.getLogger("app.mirror").warning = lambda msg, *args: warned.append(msg % args)  # type: ignore[method-assign]
    try:
        app = create_app(Settings(**{**base, "pipedrive_api_token": ""}, mirror_import_minutes=15))
        async with app.router.lifespan_context(app):
            assert app.state.import_task is None
    finally:
        logging.getLogger("app.mirror").warning = original  # type: ignore[method-assign]
    assert warned and "BIOFARM_MIRROR_IMPORT_MINUTES" in warned[0] and "BIOFARM_PIPEDRIVE_API_TOKEN" in warned[0]


def test_the_schedule_setting_is_off_by_default_and_needs_pipedrive():
    s = Settings(_env_file=None)
    assert s.mirror_import_minutes == 0
    with pytest.raises(ValueError):
        Settings(_env_file=None, mirror_import_minutes=-5)


async def test_starting_the_schedule_closes_runs_left_running_by_the_previous_process(tmp_path):
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.db import Base, make_engine
    from app.mirror.models import ImportRun

    url = f"sqlite+aiosqlite:///{tmp_path}/t.db"
    engine = make_engine(url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine)() as s:
        s.add(ImportRun(started_at=datetime.now(UTC) - timedelta(minutes=2), mode="incremental", status="running"))
        await s.commit()
    await engine.dispose()
    app = create_app(Settings(_env_file=None, database_url=url, environment="test", auto_create_tables=False, pipedrive_company_domain="biofarm", pipedrive_api_token="t", mirror_import_minutes=15))
    async with app.router.lifespan_context(app), app.state.sessionmaker() as s:
        row = (await s.execute(select(ImportRun))).scalars().one()
        assert row.status == "failed"


async def test_the_app_schedules_the_google_import_only_when_configured(tmp_path):
    base = dict(_env_file=None, database_url=f"sqlite+aiosqlite:///{tmp_path}/g.db", environment="test", auto_create_tables=True)
    app = create_app(Settings(**base))
    async with app.router.lifespan_context(app):
        assert app.state.google_import_task is None
    creds = dict(google_client_id="c", google_client_secret="s", google_refresh_token="r", ga4_property_id="1")
    app = create_app(Settings(**base, **creds))  # credentials but no interval: off
    async with app.router.lifespan_context(app):
        assert app.state.google_import_task is None
    # an interval without the credentials is a misconfiguration worth one warning at boot, not silence
    import logging

    warned: list[str] = []
    original = logging.getLogger("app.google").warning
    logging.getLogger("app.google").warning = lambda msg, *args: warned.append(msg % args)  # type: ignore[method-assign]
    try:
        app = create_app(Settings(**base, google_import_minutes=1440))
        async with app.router.lifespan_context(app):
            assert app.state.google_import_task is None
    finally:
        logging.getLogger("app.google").warning = original  # type: ignore[method-assign]
    assert warned and "BIOFARM_GOOGLE_IMPORT_MINUTES" in warned[0] and "GOOGLE_CLIENT_ID" in warned[0]
    app = create_app(Settings(**base, **creds, google_import_minutes=1440))
    async with app.router.lifespan_context(app):
        task = app.state.google_import_task
        assert task is not None and not task.done() and task.get_name() == "google-import"
    assert task.done()  # cancelled on shutdown


async def test_a_google_run_left_running_is_closed_when_the_app_boots(tmp_path):
    from datetime import UTC, date, datetime

    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.db import Base, make_engine
    from app.google.models import GoogleImportRun

    url = f"sqlite+aiosqlite:///{tmp_path}/gb.db"
    engine = make_engine(url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as s:
        s.add(GoogleImportRun(started_at=datetime.now(UTC), status="running", window_start=date(2026, 11, 1), window_end=date(2026, 11, 10)))
        await s.commit()
    await engine.dispose()
    creds = dict(google_client_id="c", google_client_secret="s", google_refresh_token="r", ga4_property_id="1")
    app = create_app(Settings(_env_file=None, database_url=url, environment="test", auto_create_tables=False, **creds, google_import_minutes=1440))
    async with app.router.lifespan_context(app):
        async with app.state.sessionmaker() as s:
            run = (await s.execute(select(GoogleImportRun))).scalar_one()
        assert run.status == "failed" and run.finished_at is not None


async def test_a_missing_google_table_at_boot_is_logged_and_the_api_still_starts(tmp_path, caplog):
    """A reporting table must never stop lead capture: the boot clean-up logs
    and the schedule still starts (its first run then fails on its own)."""
    from sqlalchemy import text

    from app.db import Base, make_engine

    url = f"sqlite+aiosqlite:///{tmp_path}/nogoogle.db"
    engine = make_engine(url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("DROP TABLE google_import_runs"))
    await engine.dispose()
    creds = dict(google_client_id="c", google_client_secret="s", google_refresh_token="r", ga4_property_id="1")
    app = create_app(Settings(_env_file=None, database_url=url, environment="test", auto_create_tables=False, **creds, google_import_minutes=1440))
    # alembic's fileConfig in the migration tests disables every logger that already exists; re-enable this one so caplog sees it
    logging.getLogger("app.google").disabled = False
    with caplog.at_level(logging.ERROR, logger="app.google"):
        async with app.router.lifespan_context(app):
            assert app.state.google_import_task is not None and not app.state.google_import_task.done()
    assert "could not tidy google import runs" in caplog.text and "migrated" in caplog.text
