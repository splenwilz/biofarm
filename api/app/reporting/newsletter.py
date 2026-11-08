"""Newsletter figures rebuilt from each person's marketing history.

Pipedrive Campaigns has no stats endpoint, but a person's flow records every
send with that person's opens and clicks, and every consent change. One row
per campaign comes from the sends; subscribers at each month end come from
replaying the consent changes.
"""

from collections import defaultdict
from collections.abc import Iterable, Mapping
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from app.mirror.models import CampaignStat, MarketingStatusChange, MirrorPerson
from app.reporting.schemas import (
    NewsletterIssueOut,
    NewsletterOut,
    SignupMonthOut,
    SubscriberMonthOut,
)

SUBSCRIBED = "subscribed"


def issues_from(stats: Iterable[CampaignStat], changes: Iterable[MarketingStatusChange]) -> list[NewsletterIssueOut]:
    """One row per campaign, oldest send first. Opens and clicks count people,
    not repeat opens; unsubscribes are the consent changes that campaign caused."""
    unsubscribed: dict[int, int] = defaultdict(int)
    for c in changes:
        if c.status == "unsubscribed" and c.campaign_id is not None:
            unsubscribed[c.campaign_id] += 1
    rows: dict[int, dict] = {}
    for s in stats:
        row = rows.setdefault(s.campaign_id, {"subject": s.campaign_name, "sent_at": s.sent_at, "recipients": 0, "opens": 0, "clicks": 0})
        row["recipients"] += 1
        row["opens"] += 1 if s.opens > 0 else 0
        row["clicks"] += 1 if s.clicks > 0 else 0
        if s.sent_at is not None and (row["sent_at"] is None or s.sent_at < row["sent_at"]):
            row["sent_at"] = s.sent_at
        row["subject"] = row["subject"] or s.campaign_name
    issues = [
        NewsletterIssueOut(id=str(cid), sent_at=row["sent_at"], subject=row["subject"] or f"Campaign {cid}", recipients=row["recipients"], opens=row["opens"], clicks=row["clicks"], unsubscribes=unsubscribed.get(cid, 0))
        for cid, row in rows.items() if row["sent_at"] is not None
    ]
    return sorted(issues, key=lambda i: (i.sent_at, i.id))


def _month(at: datetime) -> str:
    return at.strftime("%Y-%m")


def _next_month(month: str) -> str:
    y, m = int(month[:4]), int(month[5:7])
    return f"{y + 1}-01" if m == 12 else f"{y}-{m + 1:02d}"


def subscriber_months(
    persons: Iterable[Any],  # MirrorPerson rows or anything with id, marketing_status, add_time
    changes: Iterable[MarketingStatusChange],
    *,
    up_to: str,
    sends: Mapping[int, Iterable[datetime]] | None = None,
    now: datetime | None = None,
) -> list[SubscriberMonthOut]:
    """Subscribed persons at each month end, with that month's joins and
    leaves, from the first consent change to `up_to` (a "YYYY-MM" month).

    The flow misses some changes (hundreds of people are subscribed today
    with a history that ends at an unsubscribe), so the person's current
    status has the last word: a subscribed person with no history counts
    from the day they were added; one whose history ends elsewhere counts
    from the first campaign they received after that (`sends`, proof they
    were back on the list), else from `now`; a person not subscribed whose
    history ends subscribed leaves at `now`."""
    now = now or datetime.now(UTC)
    sends = sends or {}
    events: dict[int, list[tuple[datetime, str]]] = defaultdict(list)
    for c in changes:
        events[c.person_id].append((c.changed_at, c.status))
    for p in persons:
        timeline = sorted(events.get(p.id, []))
        last_status = timeline[-1][1] if timeline else None
        if p.marketing_status == SUBSCRIBED and last_status != SUBSCRIBED:
            if not timeline:
                if p.add_time is not None:
                    events[p.id].append((p.add_time, SUBSCRIBED))
            else:
                received = [t for t in sends.get(p.id, ()) if t > timeline[-1][0]]
                events[p.id].append((min(received) if received else now, SUBSCRIBED))
        elif p.marketing_status != SUBSCRIBED and last_status == SUBSCRIBED:
            events[p.id].append((now, p.marketing_status or "unsubscribed"))
    if not events:
        return []
    joins: dict[str, int] = defaultdict(int)
    leaves: dict[str, int] = defaultdict(int)
    for timeline in events.values():
        subscribed = False
        for at, status in sorted(timeline):
            now_subscribed = status == SUBSCRIBED
            if now_subscribed and not subscribed:
                joins[_month(at)] += 1
            elif subscribed and not now_subscribed:
                leaves[_month(at)] += 1
            subscribed = now_subscribed
    month = min(min(_month(at) for at, _ in timeline) for timeline in events.values())
    rows: list[SubscriberMonthOut] = []
    level = 0
    while month <= up_to:
        level += joins[month] - leaves[month]
        rows.append(SubscriberMonthOut(month=month, subscribers=level, added=joins[month], removed=leaves[month]))
        month = _next_month(month)
    return rows


async def load_newsletter(session: AsyncSession, *, up_to: datetime) -> NewsletterOut:
    """`up_to` is the sync time: the last month shown and the "now" the
    current status is anchored to."""
    stats = (await session.execute(select(CampaignStat).options(defer(CampaignStat.raw, raiseload=True)))).scalars().all()
    changes = (await session.execute(select(MarketingStatusChange).options(defer(MarketingStatusChange.raw, raiseload=True)))).scalars().all()
    persons = (await session.execute(
        select(MirrorPerson.id, MirrorPerson.marketing_status, MirrorPerson.add_time).where(MirrorPerson.marketing_status.is_not(None), MirrorPerson.is_deleted.is_(False))
    )).all()
    sends: dict[int, list[datetime]] = defaultdict(list)
    for s in stats:
        if s.sent_at is not None:
            sends[s.person_id].append(s.sent_at)
    return NewsletterOut(issues=issues_from(stats, changes), subscribers=subscriber_months(persons, changes, up_to=_month(up_to), sends=sends, now=up_to))


def signup_months(times: Iterable[datetime]) -> list[SignupMonthOut]:
    """Website newsletter sign-ups per calendar month (UTC), oldest first."""
    counts: dict[str, int] = {}
    for t in times:
        month = t.strftime("%Y-%m")
        counts[month] = counts.get(month, 0) + 1
    return [SignupMonthOut(month=m, count=n) for m, n in sorted(counts.items())]
