"""Seeding the events table from Pipedrive's history: idempotent, and never
over hand-entered figures."""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db import Base, make_engine
from app.models import MarketingEvent
from app.reporting.event_seed import SEED, SeedEvent, apply_seed
from app.reporting.events import MatchRules

LABELS = {"UKREiiF": "lab-u", "Groundswell 2026": "lab-g"}


async def _sessions(settings):
    engine = make_engine(settings.database_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return engine, async_sessionmaker(engine, expire_on_commit=False)


def test_every_seed_event_has_usable_match_rules_and_a_unique_name():
    names = [s.name for s in SEED]
    assert len(names) == len(set(names))
    for s in SEED:
        rules = MatchRules.from_json({"labels": list(s.labels), "deal_sources": list(s.deal_sources), "title_words": list(s.title_words), "channel": s.channel, "window_from": s.window_from, "window_to": s.window_to})
        assert rules.window_from <= rules.window_to, s.name
        assert s.labels or s.deal_sources or s.title_words or s.channel, s.name
        assert s.type in ("trade_show", "cpd", "webinar", "open_day"), s.name


async def test_seed_inserts_once_resolves_labels_and_keeps_entered_costs(settings):
    engine, Session = await _sessions(settings)
    seeds = (SeedEvent("UKREiiF 2026", "2026-05-20", "trade_show", "2026-05-01", "2026-09-30", labels=("UKREiiF", "Missing label")),)
    async with Session() as s:
        first = await apply_seed(s, LABELS, seeds=seeds)
        assert first.created == ["UKREiiF 2026"] and first.unknown_labels == ["UKREiiF 2026: Missing label"]
        event = (await s.execute(select(MarketingEvent))).scalar_one()
        assert event.match["labels"] == ["lab-u"] and event.date == datetime(2026, 5, 20, 9, tzinfo=UTC) and event.cost_gbp is None
        event.cost_gbp = 3400.0
        await s.commit()
    async with Session() as s:
        again = await apply_seed(s, LABELS, seeds=seeds)
        assert again.created == [] and again.unchanged == ["UKREiiF 2026"]
        moved = (SeedEvent("UKREiiF 2026", "2026-05-19", "trade_show", "2026-05-01", "2026-09-30", labels=("UKREiiF",)),)
        assert (await apply_seed(s, LABELS, seeds=moved)).unchanged == ["UKREiiF 2026"]  # match changes need --update-match
        refreshed = await apply_seed(s, LABELS, seeds=moved, update_match=True)
        assert refreshed.updated == ["UKREiiF 2026"]
        event = (await s.execute(select(MarketingEvent))).scalar_one()
        assert event.date == datetime(2026, 5, 19, 9, tzinfo=UTC) and event.cost_gbp == 3400.0
        dry = await apply_seed(s, LABELS, seeds=seeds + (SeedEvent("New", "2026-12-01", "cpd", "2026-12-01", "2026-12-31", channel=True),), dry_run=True)
        assert dry.created == ["New"]
        assert len((await s.execute(select(MarketingEvent))).scalars().all()) == 1
    await engine.dispose()
