"""Run the import on a timer inside the web process.

Render cron jobs cannot reach a service's persistent disk, and that disk is
where the production SQLite database lives, so the schedule lives here. One
run at a time (a lock in this process plus the run row in the database for
other processes); a failed run is logged and the next tick tries again.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.mirror.importer import ImportInProgress, close_runs_left_running, run_import
from app.mirror.reader import PipedriveReader

logger = logging.getLogger("app.mirror")


async def run_periodically(run: Callable[[], Awaitable[object]], *, every: float, initial_delay: float = 60.0, stop: asyncio.Event | None = None) -> None:
    """Call `run` after `initial_delay` seconds and then every `every` seconds
    until `stop` is set or the task is cancelled. A run that raises is logged;
    a run still going when the next tick comes simply delays that tick."""
    stop = stop or asyncio.Event()

    async def wait(seconds: float) -> bool:
        try:
            await asyncio.wait_for(stop.wait(), timeout=seconds)
            return True
        except TimeoutError:
            return False

    if await wait(initial_delay):
        return
    while not stop.is_set():  # runs are sequential by construction: the next tick waits for this one
        try:
            await run()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("scheduled import failed; next attempt in %.0f s", every)
        if await wait(every):
            return


async def start_clean(sessions: async_sessionmaker[AsyncSession]) -> int:
    """At process start: a run row still "running" was left by the process a
    deploy replaced; close it so this process's first run is not refused."""
    async with sessions() as session:
        closed = await close_runs_left_running(session)
    if closed:
        logger.warning("closed %d import run(s) left running by the previous process", closed)
    return closed


def import_once(sessions: async_sessionmaker[AsyncSession], settings: Settings) -> Callable[[], Awaitable[object]]:
    """The scheduled unit of work: one incremental import with a fresh reader."""

    async def run() -> object:
        domain, token = settings.pipedrive_company_domain, settings.pipedrive_api_token.get_secret_value()
        async with PipedriveReader(company_domain=domain, api_token=token) as reader:
            try:
                return await run_import(sessions, reader)
            except ImportInProgress as exc:
                logger.warning("scheduled import skipped: %s", exc)
                return None

    return run
