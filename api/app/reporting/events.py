"""Marketing events and what Pipedrive holds for them.

Pipedrive has no event object. Sales have tagged event enquiries three ways,
never consistently: a lead label (UKREiiF, Groundswell 2026), the Deal Source
field (Farm Business Innovation), a word in the title ("FBI"), and sometimes
only the Trade Show / Event source channel. Each stored event carries the
signals that identify its records (`MarketingEvent.match`); an enquiry joins
the event when any one signal hits inside the event's date window, and joins
one event only, the nearest by date, so "FBI" in a title lands on the right
year's show. Costs are never in Pipedrive: they are typed on the dashboard.

Converting a lead deletes it and copies no lead label onto the new deal, which
would lose every qualified deal of a label-only event. The deal keeps the id
of its lead (source_lead_id) and the mirror keeps its own copy of the lead, so
a converted deal inherits the copy's labels, and its Deal Source and channel
where the deal has none. Leads converted before the mirror existed have no
copy and count only by what the deal itself carries.
"""

import logging
import re
from dataclasses import dataclass, field
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from app.mirror.models import DealField, MirrorDeal, MirrorLead
from app.models import MarketingEvent
from app.reporting.schemas import DealOut, EnquiryOut, EventMatchIn, EventOut

EVENT_CHANNEL = "Trade Show / Event"
log = logging.getLogger(__name__)


@dataclass(frozen=True)
class MatchRules:
    labels: frozenset[str]
    deal_sources: frozenset[str]
    title_words: tuple[str, ...]
    channel: bool
    window_from: date
    window_to: date
    # One compiled alternation of every title word, built once per event: the
    # matcher runs it against every enquiry title on each payload rebuild, and a
    # pattern per word per search (with Python's 512-entry regex cache thrashing
    # past a few hundred words) took minutes at the API's 50-word limit.
    title_pattern: re.Pattern[str] | None = field(default=None, compare=False, repr=False)

    @classmethod
    def from_json(cls, data: object) -> "MatchRules":
        if not isinstance(data, dict) or "window_from" not in data or "window_to" not in data:
            raise ValueError("event match needs window_from and window_to")
        # an empty word (only a hand edit can store one; the API refuses it) would compile to a pattern that matches every title
        title_words = tuple(w for w in (str(x).strip() for x in data.get("title_words") or []) if w)
        return cls(
            labels=frozenset(str(x) for x in data.get("labels") or []),
            deal_sources=frozenset(str(x) for x in data.get("deal_sources") or []),
            title_words=title_words,
            channel=bool(data.get("channel", False)),
            window_from=date.fromisoformat(str(data["window_from"])),
            window_to=date.fromisoformat(str(data["window_to"])),
            title_pattern=re.compile("|".join(rf"\b{re.escape(w)}\b" for w in title_words), re.IGNORECASE) if title_words else None,
        )

    def signal(self, record: "EventRecord", event_channel: str) -> str | None:
        """The first signal that puts `record` at this event, or None."""
        day = record.created_at.date()
        if day < self.window_from or day > self.window_to:
            return None
        if self.labels and record.label_ids & self.labels:
            return "label"
        if self.deal_sources and record.deal_source in self.deal_sources:
            return "deal_source"
        if self.title_pattern is not None and record.title and self.title_pattern.search(record.title):
            return "title"
        if self.channel and record.channel == event_channel:
            return "channel"
        return None


@dataclass(frozen=True)
class EventRecord:
    """One enquiry as the matcher sees it: its id (the enquiry id), when it
    was logged, and the signals Pipedrive holds for it."""

    id: str
    created_at: datetime
    title: str | None
    label_ids: frozenset[str]
    deal_source: str | None
    channel: str | None
    qualified: bool


@dataclass
class Assigned:
    ids: set[str] = field(default_factory=set)
    matched_by: dict[str, int] = field(default_factory=dict)
    leads: int = 0
    qualified: int = 0


def assign_records(events: list[MarketingEvent], records: list[EventRecord], event_channel: str = EVENT_CHANNEL) -> dict[str, Assigned]:
    """Which records belong to which event. A record that several events
    claim goes to the one whose date is nearest to when it was logged."""
    rules: list[tuple[MarketingEvent, MatchRules]] = []
    for e in events:
        try:
            rules.append((e, MatchRules.from_json(e.match)))
        except ValueError as exc:
            # only a hand edit of the table can get here (the API validates writes); one bad row must not take the payload down
            log.warning("event %r (%s) has unreadable match rules, counting nothing for it: %s", e.name, e.id, exc)
    out = {e.id: Assigned() for e in events}
    for record in records:
        hits = [(abs((record.created_at - e.date.astimezone(UTC)).days), e.id, signal) for e, r in rules if (signal := r.signal(record, event_channel))]
        if not hits:
            continue
        _, event_id, signal = min(hits)
        a = out[event_id]
        a.ids.add(record.id)
        a.matched_by[signal] = a.matched_by.get(signal, 0) + 1
        a.leads += 1
        a.qualified += record.qualified
    return out


async def _labels(session: AsyncSession, field_name: str) -> dict[int, str]:
    rows = (await session.execute(select(DealField.options).where(DealField.name == field_name).order_by(DealField.field_code))).scalars().all()
    for options in rows:
        if options:
            return {o["id"]: o["label"] for o in options if isinstance(o, dict) and isinstance(o.get("id"), int) and isinstance(o.get("label"), str)}
    return {}


async def _deal_source_code(session: AsyncSession) -> str | None:
    return (await session.execute(select(DealField.field_code).where(DealField.name == "Deal Source", DealField.is_custom.is_(True)).order_by(DealField.field_code))).scalars().first()


def _option_label(fields: object, code: str | None, options: dict[int, str]) -> str | None:
    if not code or not isinstance(fields, dict):
        return None
    value = fields.get(code)
    try:
        return options.get(int(value)) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


async def load_events(session: AsyncSession, enquiries: list[EnquiryOut], deals: list[DealOut]) -> list[EventOut]:
    """Every stored event with its counts from the mirror, oldest first."""
    events = (await session.execute(select(MarketingEvent).order_by(MarketingEvent.date, MarketingEvent.name))).scalars().all()
    if not events:
        return []
    channels = await _labels(session, "Source channel")
    sources = await _labels(session, "Deal Source")
    source_code = await _deal_source_code(session)
    qualified = {d.id for d in deals if d.qualified_at is not None}
    # One IN list per kind, every enquiry id in it (about 2,300 in Nov 2026). SQLite, the
    # production database, allows 32,766 host parameters per statement (3.32+): chunk these
    # two reads before the enquiry count gets near that.
    lead_ids = [e.id for e in enquiries if e.kind == "lead"]
    deal_ids = [int(e.id) for e in enquiries if e.kind == "deal" and e.id.isdigit()]
    leads = {l.id: l for l in (await session.execute(select(MirrorLead).where(MirrorLead.id.in_(lead_ids)))).scalars()} if lead_ids else {}
    mirror_deals = {d.id: d for d in (await session.execute(select(MirrorDeal).options(defer(MirrorDeal.raw)).where(MirrorDeal.id.in_(deal_ids)))).scalars()} if deal_ids else {}
    # The mirror's copies of the leads these deals were converted from, deleted ones included:
    # Pipedrive drops the lead at conversion, so a flagged copy is the normal case.
    source_ids = list({d.source_lead_id for d in mirror_deals.values() if d.source_lead_id and d.source_lead_id not in leads})
    if source_ids:
        leads.update({l.id: l for l in (await session.execute(select(MirrorLead).where(MirrorLead.id.in_(source_ids)))).scalars()})
    records: list[EventRecord] = []
    for e in enquiries:
        if e.kind == "lead":
            lead = leads.get(e.id)
            if lead is None:
                continue
            raw_labels = lead.raw.get("label_ids") if isinstance(lead.raw, dict) else None
            records.append(EventRecord(
                id=e.id, created_at=e.created_at, title=lead.title, label_ids=frozenset(str(x) for x in (raw_labels or [])),
                deal_source=_option_label(lead.custom_fields, source_code, sources), channel=channels.get(lead.channel) if lead.channel is not None else None, qualified=e.id in qualified,
            ))
        else:
            deal = mirror_deals.get(int(e.id)) if e.id.isdigit() else None
            if deal is None:
                continue
            lead = leads.get(deal.source_lead_id) if deal.source_lead_id else None
            raw_labels = lead.raw.get("label_ids") if lead is not None and isinstance(lead.raw, dict) else None
            channel_id = deal.channel if deal.channel is not None else (lead.channel if lead is not None else None)
            records.append(EventRecord(
                id=e.id, created_at=e.created_at, title=deal.title, label_ids=frozenset(str(x) for x in (raw_labels or [])),
                deal_source=_option_label(deal.custom_fields, source_code, sources) or (_option_label(lead.custom_fields, source_code, sources) if lead is not None else None),
                channel=channels.get(channel_id) if channel_id is not None else None, qualified=e.id in qualified,
            ))
    assigned = assign_records(list(events), records)
    return [
        EventOut(
            id=ev.id, name=ev.name, date=ev.date, type=ev.type, attendees=ev.attendees, cost_gbp=ev.cost_gbp, notes=ev.notes,
            match=EventMatchIn.model_validate(ev.match), leads=assigned[ev.id].leads, qualified=assigned[ev.id].qualified,
            matched_by=assigned[ev.id].matched_by, updated_at=ev.updated_at,
        )
        for ev in events
    ]
