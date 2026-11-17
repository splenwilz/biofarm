"""The events Pipedrive can see in its history, as a seed for the
marketing_events table (scripts/seed_events.py). Dates are the show dates as
far as the records tell; Vix corrects them and adds costs on the dashboard.
Seeding never touches a cost, attendee count or note already entered."""

from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MarketingEvent


@dataclass(frozen=True)
class SeedEvent:
    name: str
    date: str  # YYYY-MM-DD
    type: str
    window_from: str
    window_to: str
    labels: tuple[str, ...] = ()  # lead label NAMES, resolved to ids at seed time
    deal_sources: tuple[str, ...] = ()
    title_words: tuple[str, ...] = ()
    channel: bool = False
    notes: str | None = None


FBI = {"deal_sources": ("Farm Business Innovation",), "title_words": ("FBI",), "channel": True}

SEED: tuple[SeedEvent, ...] = (
    SeedEvent("Farm Business Innovation 2023", "2023-11-08", "trade_show", "2023-11-01", "2024-03-31", **FBI),
    SeedEvent("Event, name unknown (Feb 2024)", "2024-02-12", "trade_show", "2024-02-01", "2024-02-29", channel=True, notes="One deal on the Trade Show / Event channel with nothing naming the event. Rename or delete."),
    SeedEvent("Padel evening, May 2024", "2024-05-15", "trade_show", "2024-05-01", "2024-05-31", title_words=("padel",), notes="One deal with 'padel' in the title. Rename or delete."),
    SeedEvent("Farm Business Innovation 2024", "2024-11-06", "trade_show", "2024-11-01", "2025-03-31", **FBI),
    SeedEvent("Event, name unknown (May 2025)", "2025-05-30", "trade_show", "2025-05-01", "2025-05-31", channel=True, notes="One deal on the Trade Show / Event channel with nothing naming the event. Rename or delete."),
    SeedEvent("Event, name unknown (Aug to Sep 2025)", "2025-09-02", "trade_show", "2025-08-01", "2025-09-30", channel=True, notes="Three deals on the Trade Show / Event channel with nothing naming the event. Rename or delete."),
    SeedEvent("Farm Business Innovation 2025", "2025-11-05", "trade_show", "2025-11-01", "2026-03-31", **FBI),
    SeedEvent("UKREiiF 2026", "2026-05-20", "trade_show", "2026-05-01", "2026-09-30", labels=("UKREiiF",), channel=True),
    SeedEvent("Groundswell 2026", "2026-07-01", "trade_show", "2026-07-01", "2026-10-31", labels=("Groundswell 2026",), channel=True),
    SeedEvent("Padel evening, Aug 2026", "2026-08-15", "trade_show", "2026-08-01", "2026-08-31", title_words=("padel",), notes="One deal with 'padel' in the title. Rename or delete."),
    SeedEvent("Event, name unknown (Sep 2026)", "2026-09-21", "trade_show", "2026-09-01", "2026-09-30", channel=True, notes="One deal on the Trade Show / Event channel with nothing naming the event. Rename or delete."),
    SeedEvent("Farm Business Innovation 2026", "2026-11-04", "trade_show", "2026-10-01", "2027-03-31", **FBI),
    SeedEvent("Lesnewth open day", "2026-11-24", "open_day", "2026-11-24", "2027-03-31", title_words=("Lesnewth",), channel=True, notes="Invites sent from Pipedrive Campaigns on 10 Nov 2026."),
)


@dataclass
class SeedResult:
    created: list[str] = field(default_factory=list)
    updated: list[str] = field(default_factory=list)
    unchanged: list[str] = field(default_factory=list)
    unknown_labels: list[str] = field(default_factory=list)


def _match(seed: SeedEvent, label_ids: dict[str, str], result: SeedResult) -> dict:
    ids = []
    for name in seed.labels:
        if name in label_ids:
            ids.append(label_ids[name])
        else:
            result.unknown_labels.append(f"{seed.name}: {name}")
    return {"labels": ids, "deal_sources": list(seed.deal_sources), "title_words": list(seed.title_words), "channel": seed.channel, "window_from": seed.window_from, "window_to": seed.window_to}


async def apply_seed(session: AsyncSession, label_ids: dict[str, str], *, seeds: tuple[SeedEvent, ...] = SEED, update_match: bool = False, dry_run: bool = False) -> SeedResult:
    """Insert each seed event that is not there yet (by name). An existing
    event keeps everything the team entered; its match rules and date are
    refreshed only with `update_match`. `label_ids` maps lead label names to
    their Pipedrive ids."""
    result = SeedResult()
    existing = {e.name: e for e in (await session.execute(select(MarketingEvent))).scalars()}
    now = datetime.now(UTC)
    for seed in seeds:
        match = _match(seed, label_ids, result)
        date = datetime.fromisoformat(seed.date).replace(hour=9, tzinfo=UTC)
        current = existing.get(seed.name)
        if current is None:
            result.created.append(seed.name)
            if not dry_run:
                session.add(MarketingEvent(name=seed.name, date=date, type=seed.type, notes=seed.notes, match=match, created_at=now, updated_at=now))
        elif update_match and (current.match != match or current.date != date or current.type != seed.type):
            result.updated.append(seed.name)
            if not dry_run:
                current.match, current.date, current.type, current.updated_at = match, date, seed.type, now
        else:
            result.unchanged.append(seed.name)
    if not dry_run:
        await session.commit()
    return result
