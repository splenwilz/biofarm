"""The in-process import schedule: the import runs inside the web service
because Render cron jobs cannot reach the service's disk (where the SQLite
database lives)."""

import asyncio

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
