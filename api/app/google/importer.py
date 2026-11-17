"""Pull a trailing window of days from each configured Google API and replace
those days in the daily tables.

Why a window: Ads conversions, GA4 figures and Search Console data all get
revised for a while after the day (Search Console lands 2 to 3 days late),
so every run re-reads the last `window_days` ending yesterday and swaps them
in. The first run, with empty tables, reads `backfill_days` instead. Each
source is independent: one failing is logged into the run row as "partial"
and the others still land; all failing is "failed" and raised, so the
scheduler logs it. One run at a time: a run row still "running" and younger
than STALE_RUN refuses a second run (the script and the in-process timer
would otherwise delete and insert the same window over each other).
"""

import logging
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any, Protocol

import httpx
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.db import Base
from app.google.ads import AdsDailyRow, GoogleAdsClient
from app.google.auth import GoogleToken
from app.google.ga4 import Ga4ChannelRow, Ga4Client, Ga4KeyEventRow, Ga4SourceRow
from app.google.models import AdsCampaignDay, Ga4ChannelDay, Ga4KeyEventDay, Ga4SourceDay, GoogleImportRun, GscDay
from app.google.search_console import GscDailyRow, SearchConsoleClient

logger = logging.getLogger("app.google")

# A run row still "running" after this long belongs to a process that died
# mid-run (a deploy replaced it); it no longer blocks the next run.
STALE_RUN = timedelta(hours=1)


class GoogleImportInProgress(Exception):
    """Another import is running (its run row is still "running" and younger
    than STALE_RUN); two at once would interleave their deletes and inserts."""


class AdsSource(Protocol):
    async def campaign_daily(self, start: date, end: date) -> Sequence[AdsDailyRow]: ...


class Ga4Source(Protocol):
    async def sessions_by_channel(self, start: date, end: date) -> Sequence[Ga4ChannelRow]: ...
    async def sessions_by_source(self, start: date, end: date) -> Sequence[Ga4SourceRow]: ...
    async def key_events_by_name(self, start: date, end: date) -> Sequence[Ga4KeyEventRow]: ...


class GscSource(Protocol):
    async def daily(self, start: date, end: date) -> Sequence[GscDailyRow]: ...


@dataclass
class GoogleSources:
    ads: AdsSource | None
    ga4: Ga4Source | None
    gsc: GscSource | None


@dataclass
class GoogleImportResult:
    status: str
    # The earliest start among the sources (a source with an empty table is
    # backfilled further than the others) and the shared end, yesterday.
    window_start: date
    window_end: date
    counts: dict[str, int | None] = field(default_factory=dict)
    # Data-quality notes from the APIs (GA4 thresholding, "(other)" row loss, sampling): the numbers landed but are not the whole truth.
    notes: list[str] = field(default_factory=list)
    error: str | None = None


# (name in counts, table it fills, how to pull it, model row from API row)
_ADS = ("google_ads", AdsCampaignDay)
_GA4_CHANNELS = ("ga4_channels", Ga4ChannelDay)
_GA4_SOURCES = ("ga4_sources", Ga4SourceDay)
_GA4_EVENTS = ("ga4_key_events", Ga4KeyEventDay)
_GSC = ("search_console", GscDay)


def _reports(sources: GoogleSources) -> list[tuple[str, type[Base], Callable[[date, date], Awaitable[Sequence[Any]]]]]:
    reports: list[tuple[str, type[Base], Callable[[date, date], Awaitable[Sequence[Any]]]]] = []
    if sources.ads is not None:
        reports.append((*_ADS, sources.ads.campaign_daily))
    if sources.ga4 is not None:
        reports.append((*_GA4_CHANNELS, sources.ga4.sessions_by_channel))
        reports.append((*_GA4_SOURCES, sources.ga4.sessions_by_source))
        reports.append((*_GA4_EVENTS, sources.ga4.key_events_by_name))
    if sources.gsc is not None:
        reports.append((*_GSC, sources.gsc.daily))
    return reports


async def _has_rows(session: AsyncSession, table: type[Base]) -> bool:
    return bool((await session.execute(select(func.count()).select_from(table))).scalar_one())


async def _running_run(session: AsyncSession, *, now: datetime) -> GoogleImportRun | None:
    stmt = select(GoogleImportRun).where(GoogleImportRun.status == "running", GoogleImportRun.started_at > now - STALE_RUN).order_by(GoogleImportRun.started_at.desc()).limit(1)
    return (await session.execute(stmt)).scalar_one_or_none()


async def close_google_runs_left_running(session: AsyncSession, *, now: datetime | None = None) -> int:
    """Mark every row still "running" as failed. For a fresh process at start:
    one web service runs the timer, so a running row found at boot belongs to
    a process that is gone."""
    now = now or datetime.now(UTC)
    rows = (await session.execute(select(GoogleImportRun).where(GoogleImportRun.status == "running"))).scalars().all()
    for run in rows:
        run.status, run.finished_at, run.error = "failed", now, "left running by a process that stopped"
    await session.commit()
    return len(rows)


def _quality_notes(pull: Callable[..., Awaitable[object]]) -> list[str]:
    """Notes a client gathered while answering (GA4 says when a report was
    thresholded, lost rows to "(other)" or was sampled); drained per report."""
    pop = getattr(getattr(pull, "__self__", None), "pop_quality_notes", None)
    return list(pop()) if callable(pop) else []


async def run_google_import(sessions: async_sessionmaker[AsyncSession], sources: GoogleSources, *, window_days: int, backfill_days: int, today: date | None = None) -> GoogleImportResult:
    reports = _reports(sources)
    if not reports:
        raise ValueError("no Google source configured")
    today = today or datetime.now(UTC).date()
    end = today - timedelta(days=1)  # today is partial everywhere
    now = datetime.now(UTC)
    async with sessions() as session:
        running = await _running_run(session, now=now)
        if running is not None:
            raise GoogleImportInProgress(f"google import run {running.id} started {running.started_at:%Y-%m-%d %H:%M} UTC is still running")
        # Each source decides for itself: an empty table is backfilled, a filled one re-reads the window.
        starts = {name: end - timedelta(days=(window_days if await _has_rows(session, table) else backfill_days) - 1) for name, table, _ in reports}
        run = GoogleImportRun(started_at=now, status="running", window_start=min(starts.values()), window_end=end)
        session.add(run)
        await session.commit()
        run_id = run.id

    result = GoogleImportResult(status="running", window_start=min(starts.values()), window_end=end)
    errors: list[str] = []
    for name, table, pull in reports:
        start = starts[name]
        try:
            rows = await pull(start, end)
            result.notes.extend(f"{name}: {note}" for note in _quality_notes(pull))
            async with sessions() as session:
                fetched_at = datetime.now(UTC)
                await session.execute(delete(table).where(table.date >= start, table.date <= end))  # type: ignore[attr-defined]
                session.add_all(table(**vars(row), fetched_at=fetched_at) for row in rows)
                await session.commit()
            result.counts[name] = len(rows)
            logger.info("google import: %s wrote %d rows for %s to %s", name, len(rows), start, end)
        except Exception as exc:
            result.counts[name] = None
            errors.append(f"{name}: {exc}")
            logger.exception("google import: %s failed", name)
            last_error = exc
    for note in result.notes:
        logger.warning("google import: %s", note)

    failed = [n for n, c in result.counts.items() if c is None]
    result.status = "ok" if not failed else ("failed" if len(failed) == len(reports) else "partial")
    result.error = "; ".join(errors) or None
    async with sessions() as session:
        run = await session.get(GoogleImportRun, run_id)
        if run is not None:
            counts: dict[str, Any] = dict(result.counts)
            if result.notes:
                counts["notes"] = list(result.notes)
            run.status, run.finished_at, run.counts, run.error = result.status, datetime.now(UTC), counts, result.error
            await session.commit()
    if result.status == "failed":
        raise last_error
    return result


async def last_google_import_finished(session: AsyncSession, *, statuses: tuple[str, ...] = ("ok", "partial")) -> datetime | None:
    """When the last run with one of `statuses` ended. The dashboard payload's
    cache key uses ok and partial (a partial run still changed the tables);
    the payload's googleSyncedAt uses ok only (see last_google_import_ok)."""
    stmt = (select(GoogleImportRun.finished_at)
            .where(GoogleImportRun.status.in_(statuses), GoogleImportRun.finished_at.is_not(None))
            .order_by(GoogleImportRun.finished_at.desc()).limit(1))
    return (await session.execute(stmt)).scalar_one_or_none()


async def last_google_import_ok(session: AsyncSession) -> datetime | None:
    """When every configured source last landed together. A source failing
    day after day while the others succeed leaves this behind, so the
    dashboard's staleness alert fires instead of staying quiet."""
    return await last_google_import_finished(session, statuses=("ok",))


def build_sources(http: httpx.AsyncClient, token: GoogleToken, settings: Settings) -> GoogleSources:
    return GoogleSources(
        ads=GoogleAdsClient(http, token, customer_id=settings.google_ads_customer_id) if settings.google_ads_customer_id else None,
        ga4=Ga4Client(http, token, property_id=settings.ga4_property_id) if settings.ga4_property_id else None,
        gsc=SearchConsoleClient(http, token, site_url=settings.search_console_site_url, brand_pattern=settings.google_brand_query_pattern) if settings.search_console_site_url else None,
    )


def google_import_once(sessions: async_sessionmaker[AsyncSession], settings: Settings) -> Callable[[], Awaitable[object]]:
    """The scheduled unit of work: one import with a fresh HTTP client and token."""

    async def run() -> object:
        async with httpx.AsyncClient() as http:
            token = GoogleToken(http, client_id=settings.google_client_id or "", client_secret=settings.google_client_secret.get_secret_value() if settings.google_client_secret else "",
                                refresh_token=settings.google_refresh_token.get_secret_value() if settings.google_refresh_token else "")
            try:
                return await run_google_import(sessions, build_sources(http, token, settings), window_days=settings.google_import_window_days, backfill_days=settings.google_backfill_days)
            except GoogleImportInProgress as exc:
                logger.warning("scheduled google import skipped: %s", exc)
                return None

    return run


async def google_start_clean(sessions: async_sessionmaker[AsyncSession]) -> int:
    """At process start: close a run row the previous process left "running".
    Never fails the boot: a reporting table that is missing or unreachable must
    not take lead capture offline, so the problem is logged and the first
    scheduled run reports it again."""
    try:
        async with sessions() as session:
            closed = await close_google_runs_left_running(session)
    except Exception:
        logger.exception("could not tidy google import runs at start (is the database migrated?); the schedule still starts")
        return 0
    if closed:
        logger.warning("closed %d google import run(s) left running by the previous process", closed)
    return closed
