"""The daily Google import: pull a trailing window from each configured API,
replace that window in the daily tables, record a run row."""

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db import Base, make_engine
from app.google.ads import AdsDailyRow
from app.google.ga4 import Ga4ChannelRow, Ga4KeyEventRow, Ga4SourceRow
from app.google.http import GoogleApiError
from app.google.importer import STALE_RUN, GoogleImportInProgress, GoogleSources, close_google_runs_left_running, last_google_import_finished, run_google_import
from app.google.models import AdsCampaignDay, Ga4ChannelDay, Ga4KeyEventDay, Ga4SourceDay, GoogleImportRun, GscDay
from app.google.search_console import GscDailyRow

TODAY = date(2026, 11, 11)


class FakeAds:
    def __init__(self, rows=None, error: Exception | None = None):
        self.rows, self.error, self.calls = rows or [], error, []

    async def campaign_daily(self, start, end):
        self.calls.append((start, end))
        if self.error:
            raise self.error
        return [r for r in self.rows if start <= r.date <= end]


class FakeGa4:
    def __init__(self, channels=None, sources=None, events=None):
        self.channels, self.sources, self.events, self.calls = channels or [], sources or [], events or [], []

    async def sessions_by_channel(self, start, end):
        self.calls.append(("channels", start, end))
        return [r for r in self.channels if start <= r.date <= end]

    async def sessions_by_source(self, start, end):
        self.calls.append(("sources", start, end))
        return [r for r in self.sources if start <= r.date <= end]

    async def key_events_by_name(self, start, end):
        self.calls.append(("events", start, end))
        return [r for r in self.events if start <= r.date <= end]


class FakeGsc:
    def __init__(self, rows=None):
        self.rows, self.calls = rows or [], []

    async def daily(self, start, end):
        self.calls.append((start, end))
        return [r for r in self.rows if start <= r.date <= end]


def ads_row(d: date, campaign_id=1, cost=1_000_000, name="Brand"):
    return AdsDailyRow(date=d, campaign_id=campaign_id, campaign_name=name, cost_micros=cost, clicks=1, impressions=10, conversions=0.0, conversions_value=0.0)


@pytest.fixture
async def sessions(tmp_path):
    engine = make_engine(f"sqlite+aiosqlite:///{tmp_path}/g.db")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


async def count(sessions, model) -> int:
    async with sessions() as s:
        return (await s.execute(select(func.count()).select_from(model))).scalar_one()


async def test_first_run_backfills_then_later_runs_pull_the_trailing_window_ending_yesterday(sessions):
    days = [TODAY - timedelta(days=n) for n in range(1, 500)]
    ads = FakeAds([ads_row(d) for d in days])
    sources = GoogleSources(ads=ads, ga4=None, gsc=None)
    first = await run_google_import(sessions, sources, window_days=35, backfill_days=480, today=TODAY)
    assert ads.calls == [(TODAY - timedelta(days=480), TODAY - timedelta(days=1))]
    assert first.status == "ok" and first.counts == {"google_ads": 480}
    assert first.window_start == TODAY - timedelta(days=480) and first.window_end == TODAY - timedelta(days=1)
    assert await count(sessions, AdsCampaignDay) == 480

    second = await run_google_import(sessions, sources, window_days=35, backfill_days=480, today=TODAY)
    assert ads.calls[-1] == (TODAY - timedelta(days=35), TODAY - timedelta(days=1))
    assert second.counts == {"google_ads": 35}
    assert await count(sessions, AdsCampaignDay) == 480  # the window was replaced, not appended
    async with sessions() as s:
        runs = (await s.execute(select(GoogleImportRun).order_by(GoogleImportRun.id))).scalars().all()
        last = await last_google_import_finished(s)
    assert [r.status for r in runs] == ["ok", "ok"] and all(r.finished_at is not None for r in runs)
    assert last == runs[-1].finished_at


async def test_re_pulling_a_window_replaces_revised_figures_and_drops_rows_google_no_longer_returns(sessions):
    d1, d2 = TODAY - timedelta(days=2), TODAY - timedelta(days=1)
    ads = FakeAds([ads_row(d1, cost=100), ads_row(d2, cost=200), ads_row(d2, campaign_id=2, cost=50, name="Removed later")])
    await run_google_import(sessions, GoogleSources(ads=ads, ga4=None, gsc=None), window_days=2, backfill_days=2, today=TODAY)
    ads.rows = [ads_row(d1, cost=100), ads_row(d2, cost=250)]  # conversions and cost get revised; campaign 2 removed
    await run_google_import(sessions, GoogleSources(ads=ads, ga4=None, gsc=None), window_days=2, backfill_days=2, today=TODAY)
    async with sessions() as s:
        rows = (await s.execute(select(AdsCampaignDay).order_by(AdsCampaignDay.date, AdsCampaignDay.campaign_id))).scalars().all()
    assert [(r.date, r.campaign_id, r.cost_micros) for r in rows] == [(d1, 1, 100), (d2, 1, 250)]


async def test_all_five_tables_are_filled_from_the_three_sources(sessions):
    d = TODAY - timedelta(days=1)
    ga4 = FakeGa4(channels=[Ga4ChannelRow(d, "Paid Search", 30)], sources=[Ga4SourceRow(d, "chatgpt.com", 2)], events=[Ga4KeyEventRow(d, "Contact Form", 3, 3)])
    gsc = FakeGsc([GscDailyRow(d, "total", 10, 100), GscDailyRow(d, "brand", 4, 20), GscDailyRow(d, "nonbrand", 6, 80)])
    result = await run_google_import(sessions, GoogleSources(ads=FakeAds([ads_row(d)]), ga4=ga4, gsc=gsc), window_days=7, backfill_days=7, today=TODAY)
    assert result.status == "ok"
    assert result.counts == {"google_ads": 1, "ga4_channels": 1, "ga4_sources": 1, "ga4_key_events": 1, "search_console": 3}
    for model, n in ((AdsCampaignDay, 1), (Ga4ChannelDay, 1), (Ga4SourceDay, 1), (Ga4KeyEventDay, 1), (GscDay, 3)):
        assert await count(sessions, model) == n, model.__tablename__
    assert [c[0] for c in ga4.calls] == ["channels", "sources", "events"]


async def test_one_source_failing_keeps_the_others_and_marks_the_run_partial(sessions):
    d = TODAY - timedelta(days=1)
    ads = FakeAds(error=GoogleApiError(429, "Quota exceeded", source="google_ads"))
    result = await run_google_import(sessions, GoogleSources(ads=ads, ga4=FakeGa4(channels=[Ga4ChannelRow(d, "Direct", 1)]), gsc=None), window_days=7, backfill_days=7, today=TODAY)
    assert result.status == "partial"
    assert result.counts == {"google_ads": None, "ga4_channels": 1, "ga4_sources": 0, "ga4_key_events": 0}
    assert "google_ads" in (result.error or "") and "429" in result.error
    assert await count(sessions, Ga4ChannelDay) == 1 and await count(sessions, AdsCampaignDay) == 0


async def test_every_source_failing_marks_the_run_failed_and_raises(sessions):
    ads = FakeAds(error=RuntimeError("boom"))
    with pytest.raises(RuntimeError):
        await run_google_import(sessions, GoogleSources(ads=ads, ga4=None, gsc=None), window_days=7, backfill_days=7, today=TODAY)
    async with sessions() as s:
        run = (await s.execute(select(GoogleImportRun))).scalar_one()
        last = await last_google_import_finished(s)
    assert run.status == "failed" and run.finished_at is not None and "boom" in run.error
    assert last is None  # a failed run does not move the dashboard's cache key


async def test_a_failed_source_keeps_its_existing_rows(sessions):
    d = TODAY - timedelta(days=1)
    ok = FakeAds([ads_row(d)])
    await run_google_import(sessions, GoogleSources(ads=ok, ga4=None, gsc=None), window_days=7, backfill_days=7, today=TODAY)
    broken = FakeAds(error=GoogleApiError(500, "backend error", source="google_ads"))
    with pytest.raises(GoogleApiError):
        await run_google_import(sessions, GoogleSources(ads=broken, ga4=None, gsc=None), window_days=7, backfill_days=7, today=TODAY)
    assert await count(sessions, AdsCampaignDay) == 1


async def test_rows_carry_the_fetch_time(sessions):
    d = TODAY - timedelta(days=1)
    before = datetime.now(UTC)
    await run_google_import(sessions, GoogleSources(ads=FakeAds([ads_row(d)]), ga4=None, gsc=None), window_days=7, backfill_days=7, today=TODAY)
    async with sessions() as s:
        row = (await s.execute(select(AdsCampaignDay))).scalar_one()
    assert row.fetched_at >= before.replace(microsecond=0)


async def test_a_source_added_later_is_backfilled_on_its_own_while_the_others_keep_the_window(sessions):
    days = [TODAY - timedelta(days=n) for n in range(1, 500)]
    ads = FakeAds([ads_row(d) for d in days])
    await run_google_import(sessions, GoogleSources(ads=ads, ga4=None, gsc=None), window_days=35, backfill_days=480, today=TODAY)
    ga4 = FakeGa4(channels=[Ga4ChannelRow(d, "Direct", 1) for d in days])
    result = await run_google_import(sessions, GoogleSources(ads=ads, ga4=ga4, gsc=None), window_days=35, backfill_days=480, today=TODAY)
    assert ads.calls[-1] == (TODAY - timedelta(days=35), TODAY - timedelta(days=1))
    assert ga4.calls[0] == ("channels", TODAY - timedelta(days=480), TODAY - timedelta(days=1))
    assert result.window_start == TODAY - timedelta(days=480)  # the run row shows the widest window
    assert result.counts == {"google_ads": 35, "ga4_channels": 480, "ga4_sources": 0, "ga4_key_events": 0}


async def test_a_second_import_is_refused_while_one_is_running_and_a_stale_one_is_not(sessions):
    d = TODAY - timedelta(days=1)
    async with sessions() as s:
        s.add(GoogleImportRun(started_at=datetime.now(UTC) - timedelta(minutes=5), status="running", window_start=d, window_end=d))
        await s.commit()
    with pytest.raises(GoogleImportInProgress, match="still running"):
        await run_google_import(sessions, GoogleSources(ads=FakeAds([ads_row(d)]), ga4=None, gsc=None), window_days=7, backfill_days=7, today=TODAY)
    assert await count(sessions, AdsCampaignDay) == 0
    async with sessions() as s:
        stale = (await s.execute(select(GoogleImportRun))).scalar_one()
        stale.started_at = datetime.now(UTC) - STALE_RUN - timedelta(minutes=1)
        await s.commit()
    result = await run_google_import(sessions, GoogleSources(ads=FakeAds([ads_row(d)]), ga4=None, gsc=None), window_days=7, backfill_days=7, today=TODAY)
    assert result.status == "ok"


async def test_runs_left_running_by_a_dead_process_are_closed_at_boot(sessions):
    d = TODAY - timedelta(days=1)
    async with sessions() as s:
        s.add(GoogleImportRun(started_at=datetime.now(UTC) - timedelta(minutes=5), status="running", window_start=d, window_end=d))
        s.add(GoogleImportRun(started_at=datetime.now(UTC) - timedelta(days=1), status="ok", finished_at=datetime.now(UTC) - timedelta(days=1), window_start=d, window_end=d))
        await s.commit()
    async with sessions() as s:
        assert await close_google_runs_left_running(s) == 1
        rows = (await s.execute(select(GoogleImportRun).order_by(GoogleImportRun.id))).scalars().all()
    assert [r.status for r in rows] == ["failed", "ok"] and rows[0].finished_at is not None and "left running" in rows[0].error


async def test_ga4_quality_notes_are_kept_on_the_run_row(sessions):
    d = TODAY - timedelta(days=1)

    class NotingGa4(FakeGa4):
        def pop_quality_notes(self):
            return ["key events 2026-11-01 to 2026-11-10: subject to thresholding (rows with few users withheld, so counts can be low)"]

    ga4 = NotingGa4(channels=[Ga4ChannelRow(d, "Direct", 1)])
    result = await run_google_import(sessions, GoogleSources(ads=None, ga4=ga4, gsc=None), window_days=7, backfill_days=7, today=TODAY)
    assert result.status == "ok" and len(result.notes) == 3 and result.notes[0].startswith("ga4_channels: key events")
    async with sessions() as s:
        run = (await s.execute(select(GoogleImportRun))).scalar_one()
    assert run.counts["notes"] == result.notes and run.counts["ga4_channels"] == 1


async def test_google_synced_at_follows_fully_ok_runs_only_while_the_cache_key_follows_partial_ones(sessions):
    from app.google.importer import last_google_import_ok

    d = TODAY - timedelta(days=1)
    good = await run_google_import(sessions, GoogleSources(ads=FakeAds([ads_row(d)]), ga4=FakeGa4(channels=[Ga4ChannelRow(d, "Direct", 1)]), gsc=None), window_days=7, backfill_days=7, today=TODAY)
    broken_ads = FakeAds(error=GoogleApiError(403, "scope revoked", source="google_ads"))
    partial = await run_google_import(sessions, GoogleSources(ads=broken_ads, ga4=FakeGa4(channels=[Ga4ChannelRow(d, "Direct", 2)]), gsc=None), window_days=7, backfill_days=7, today=TODAY)
    assert good.status == "ok" and partial.status == "partial"
    async with sessions() as s:
        runs = (await s.execute(select(GoogleImportRun).order_by(GoogleImportRun.id))).scalars().all()
        cache_key = await last_google_import_finished(s)
        synced = await last_google_import_ok(s)
    assert cache_key == runs[1].finished_at  # the partial run changed the tables, so the payload rebuilds
    assert synced == runs[0].finished_at  # but "last complete" stays where it was, so a persistent failure goes stale
