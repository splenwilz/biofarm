"""Pull Pipedrive into the mirror tables.

Order: pipelines, stages, deal fields, users (small, always whole), then
deals (not archived, archived, deleted), persons, activities and the Leads
inbox (what changed since the last good run), the changelog of every deal
whose update_time moved since its changelog was last read, and finally the
marketing history (consent changes, per-campaign opens and clicks) of every
person with consent whose history is new, stale or older than their last
edit. Each step commits, so a failure keeps what was already read and the
next run carries on. The run is recorded in pd_import_runs; the last run
that ended "ok" sets the window for the next incremental run.
"""

import asyncio
import hashlib
import logging
from collections.abc import Callable, Iterable
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import or_, select, tuple_, update
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.mirror.models import (
    Activity,
    CampaignStat,
    DealChange,
    DealField,
    DealStageHistory,
    ImportRun,
    MarketingStatusChange,
    MirrorDeal,
    MirrorLead,
    MirrorPerson,
    MirrorUser,
    Pipeline,
    Stage,
)
from app.mirror.reader import PipedriveReader

logger = logging.getLogger("app.mirror")

# An incremental run re-reads from the previous good run's start minus this,
# so an edit made while that run was in flight is not missed.
INCREMENTAL_MARGIN = timedelta(minutes=10)
BATCH = 500
# A run row still "running" after this long belongs to a crashed process and no
# longer blocks a new run.
STALE_RUN = timedelta(hours=2)
# Opens and clicks keep arriving for weeks after a send, so a person's
# marketing history is read again once it is this old.
FLOW_MAX_AGE = timedelta(hours=24)
FLOW_ITEMS = "marketing_status_change,marketing_campaign_stat"
FLOW_CONCURRENCY = 4
# Person histories are read this many at a time (FLOW_CONCURRENCY in flight);
# every record's writes are committed on their own so a transaction stays
# short while the web app writes form submissions to the same SQLite file.
FLOW_BATCH = 50
PERSON_FIELDS = "marketing_status,doi_status"
DEAL_FIELDS = "source_lead_id"  # v2 deals only return it on request
# Statuses whose persons have a marketing history worth reading.
MARKETED_STATUSES = ("subscribed", "unsubscribed", "bounced", "pending_consent", "archived")


class ImportInProgress(Exception):
    """Another import is running (its run row is still "running" and younger
    than STALE_RUN); two at once would interleave their writes."""


@dataclass
class ImportCounts:
    """Rows stored per table; the two history figures are rows new to us."""

    pipelines: int = 0
    stages: int = 0
    deal_fields: int = 0
    users: int = 0
    deals: int = 0
    persons: int = 0
    activities: int = 0
    leads: int = 0
    # Leads a full import no longer found in Pipedrive (converted or removed).
    leads_deleted: int = 0
    stage_changes: int = 0
    field_changes: int = 0
    # Persons whose marketing history was read, and the rows that gave.
    flows: int = 0
    marketing_changes: int = 0
    campaign_stats: int = 0

    def as_dict(self) -> dict[str, int]:
        return asdict(self)


# ---- value parsing -------------------------------------------------------------------


def parse_time(value: Any) -> datetime | None:
    """Pipedrive v2 sends "2026-09-29T10:31:28Z"; the v1 changelog sends
    "2026-09-29 10:31:28" in UTC. Anything unreadable becomes null."""
    if not value or not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)


def parse_int(value: Any) -> int | None:
    """An id as Pipedrive sends it: an int, a digit string, or {"id": n}."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdecimal():
        return int(value)
    if isinstance(value, dict):
        return parse_int(value.get("id"))
    return None


def parse_float(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _text(value: Any) -> str | None:
    return None if value is None else str(value)


def _dict(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def _list(value: Any) -> list:
    return value if isinstance(value, list) else []


def since_param(since: datetime | None) -> dict[str, str]:
    return {"updated_since": since.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")} if since else {}


# ---- row builders --------------------------------------------------------------------


def pipeline_row(p: dict, now: datetime) -> dict:
    return {"id": p["id"], "name": str(p.get("name") or ""), "order_nr": parse_int(p.get("order_nr")), "is_deleted": bool(p.get("is_deleted")),
            "add_time": parse_time(p.get("add_time")), "update_time": parse_time(p.get("update_time")), "raw": p, "fetched_at": now}


def stage_row(s: dict, now: datetime) -> dict:
    return {"id": s["id"], "pipeline_id": parse_int(s.get("pipeline_id")), "name": str(s.get("name") or ""), "order_nr": parse_int(s.get("order_nr")),
            "deal_probability": parse_int(s.get("deal_probability")), "is_deleted": bool(s.get("is_deleted")),
            "add_time": parse_time(s.get("add_time")), "update_time": parse_time(s.get("update_time")), "raw": s, "fetched_at": now}


def field_row(f: dict, now: datetime) -> dict:
    return {"field_code": str(f["field_code"]), "name": str(f.get("field_name") or ""), "field_type": _text(f.get("field_type")),
            "is_custom": bool(f.get("is_custom_field")), "options": f.get("options") if isinstance(f.get("options"), list) else None, "raw": f, "fetched_at": now}


def deal_row(d: dict, now: datetime) -> dict:
    return {
        "id": d["id"], "title": _text(d.get("title")), "pipeline_id": parse_int(d.get("pipeline_id")), "stage_id": parse_int(d.get("stage_id")),
        "status": _text(d.get("status")), "origin": _text(d.get("origin")), "origin_id": _text(d.get("origin_id")),
        "channel": parse_int(d.get("channel")), "channel_id": _text(d.get("channel_id")), "person_id": parse_int(d.get("person_id")),
        "org_id": parse_int(d.get("org_id")), "owner_id": parse_int(d.get("owner_id")), "creator_user_id": parse_int(d.get("creator_user_id")),
        "value": parse_float(d.get("value")), "currency": _text(d.get("currency")), "lost_reason": _text(d.get("lost_reason")),
        "add_time": parse_time(d.get("add_time")), "update_time": parse_time(d.get("update_time")), "stage_change_time": parse_time(d.get("stage_change_time")),
        "won_time": parse_time(d.get("won_time")), "lost_time": parse_time(d.get("lost_time")), "close_time": parse_time(d.get("close_time")),
        "is_archived": bool(d.get("is_archived")), "is_deleted": bool(d.get("is_deleted")), "source_lead_id": _text(d.get("source_lead_id")),
        "custom_fields": _dict(d.get("custom_fields")), "raw": d, "fetched_at": now, "changelog_update_time": None,
    }


def person_row(p: dict, now: datetime) -> dict:
    return {"id": p["id"], "name": _text(p.get("name")), "first_name": _text(p.get("first_name")), "last_name": _text(p.get("last_name")),
            "emails": _list(p.get("emails")), "phones": _list(p.get("phones")), "org_id": parse_int(p.get("org_id")), "owner_id": parse_int(p.get("owner_id")),
            "label_ids": _list(p.get("label_ids")), "custom_fields": _dict(p.get("custom_fields")), "is_deleted": bool(p.get("is_deleted")),
            "add_time": parse_time(p.get("add_time")), "update_time": parse_time(p.get("update_time")),
            "marketing_status": _text(p.get("marketing_status")), "doi_status": parse_int(p.get("doi_status")), "raw": p, "fetched_at": now, "flow_fetched_at": None}


def user_row(u: dict, now: datetime) -> dict:
    return {"id": u["id"], "name": _text(u.get("name")), "email": _text(u.get("email")), "is_active": bool(u.get("active_flag")),
            "is_admin": bool(u.get("is_admin")), "raw": u, "fetched_at": now}


def activity_row(a: dict, now: datetime) -> dict:
    return {"id": a["id"], "type": _text(a.get("type")), "subject": _text(a.get("subject")), "owner_id": parse_int(a.get("owner_id")),
            "deal_id": parse_int(a.get("deal_id")), "lead_id": _text(a.get("lead_id")), "person_id": parse_int(a.get("person_id")), "org_id": parse_int(a.get("org_id")),
            "done": bool(a.get("done")), "due_date": _text(a.get("due_date")), "due_time": _text(a.get("due_time")),
            "add_time": parse_time(a.get("add_time")), "update_time": parse_time(a.get("update_time")), "marked_as_done_time": parse_time(a.get("marked_as_done_time")),
            "is_deleted": bool(a.get("is_deleted")), "raw": a, "fetched_at": now}


def _is_custom_key(key: str) -> bool:
    return len(key) == 40 and all(c in "0123456789abcdef" for c in key)


def lead_row(x: dict, now: datetime) -> dict:
    return {"id": str(x["id"]), "title": _text(x.get("title")), "owner_id": parse_int(x.get("owner_id")), "creator_id": parse_int(x.get("creator_id")),
            "person_id": parse_int(x.get("person_id")), "org_id": parse_int(x.get("organization_id")), "source_name": _text(x.get("source_name")),
            "source_deal_id": parse_int(x.get("source_deal_id")), "origin": _text(x.get("origin")), "origin_id": _text(x.get("origin_id")),
            "channel": parse_int(x.get("channel")), "channel_id": _text(x.get("channel_id")), "is_archived": bool(x.get("is_archived")),
            "archive_time": parse_time(x.get("archive_time")), "was_seen": bool(x.get("was_seen")), "add_time": parse_time(x.get("add_time")),
            "update_time": parse_time(x.get("update_time")), "is_deleted": False, "custom_fields": {k: v for k, v in x.items() if _is_custom_key(k)}, "raw": x, "fetched_at": now}


def flow_rows(person_id: int, items: Iterable[dict], now: datetime) -> tuple[list[dict], list[dict]]:
    """Consent changes and campaign stats from a person's flow. Items of other
    kinds, or without an id or a readable time, are skipped and logged."""
    changes: list[dict] = []
    stats: list[dict] = []
    for item in items:
        kind, data = item.get("object"), _dict(item.get("data"))
        at = parse_time(data.get("timestamp")) or parse_time(item.get("timestamp"))
        if kind == "marketing_status_change":
            change_id, status = parse_int(data.get("id")), _text(data.get("status"))
            if change_id is None or status is None or at is None:
                logger.warning("person %d: unreadable status change skipped: %s", person_id, str(item)[:200])
                continue
            details = _dict(data.get("reason_details"))
            changes.append({"id": change_id, "person_id": person_id, "changed_at": at, "status": status, "reason": _text(data.get("reason")),
                            "campaign_id": parse_int(details.get("campaign_id")), "user_id": parse_int(details.get("user_id")), "raw": item})
        elif kind == "marketing_campaign_stat":
            campaign_id = parse_int(data.get("id"))
            if campaign_id is None:
                logger.warning("person %d: campaign stat without a campaign id skipped: %s", person_id, str(item)[:200])
                continue
            stats.append({"campaign_id": campaign_id, "person_id": person_id, "campaign_name": _text(data.get("name")), "campaign_type": _text(data.get("type")),
                          "sent_at": at, "opens": parse_int(data.get("total_opens")) or 0, "clicks": parse_int(data.get("total_clicks")) or 0,
                          "first_open_at": parse_time(_dict(data.get("open_stat")).get("timestamp")), "clicked_links": _list(data.get("clicked_links")),
                          "raw": item, "fetched_at": now})
        else:
            logger.debug("person %d: flow item %s ignored", person_id, kind)
    return changes, stats


def change_id(deal_id: int, entry: dict) -> str:
    key = "|".join([str(deal_id), str(entry.get("time") or ""), str(entry.get("field_key") or ""), _text(entry.get("old_value")) or "", _text(entry.get("new_value")) or ""])
    return hashlib.sha1(key.encode()).hexdigest()


def change_rows(deal_id: int, entries: Iterable[dict]) -> tuple[list[dict], list[dict]]:
    """Field changes and the stage moves among them. An entry without a
    readable time, or a stage move to something that is not a stage id, is
    logged and left out of the history (it still goes in the changes table
    when it has a time)."""
    changes: list[dict] = []
    stages: list[dict] = []
    seen: set[str] = set()
    for e in entries:
        at = parse_time(e.get("time"))
        if at is None or not e.get("field_key"):
            logger.warning("deal %s: changelog entry without a time or field, skipped", deal_id)
            continue
        cid = change_id(deal_id, e)
        if cid in seen:
            continue
        seen.add(cid)
        changes.append({"id": cid, "deal_id": deal_id, "changed_at": at, "field_key": str(e["field_key"]), "old_value": _text(e.get("old_value")),
                        "new_value": _text(e.get("new_value")), "actor_user_id": parse_int(e.get("actor_user_id")), "change_source": _text(e.get("change_source")), "raw": e})
        if e["field_key"] == "stage_id":
            new_stage = parse_int(e.get("new_value"))
            if new_stage is None:
                logger.warning("deal %s: stage change to %r is not a stage id, left out of the history", deal_id, e.get("new_value"))
                continue
            stages.append({"deal_id": deal_id, "changed_at": at, "new_stage_id": new_stage, "old_stage_id": parse_int(e.get("old_value")),
                           "actor_user_id": parse_int(e.get("actor_user_id")), "change_source": _text(e.get("change_source"))})
    return changes, stages


# ---- database -----------------------------------------------------------------------


def _insert(session: AsyncSession, table):
    return postgresql.insert(table) if session.bind.dialect.name == "postgresql" else sqlite.insert(table)


async def upsert(session: AsyncSession, model, rows: list[dict], *, keep: Iterable[str] = ()) -> int:
    """Insert or, when the Pipedrive id exists, update every column except the
    key and those in `keep` (values we own, not Pipedrive)."""
    if not rows:
        return 0
    table = model.__table__
    key = [c.name for c in table.primary_key.columns]
    skip = set(key) | set(keep)
    for start in range(0, len(rows), BATCH):
        stmt = _insert(session, table)
        stmt = stmt.on_conflict_do_update(index_elements=key, set_={c.name: stmt.excluded[c.name] for c in table.columns if c.name not in skip})
        await session.execute(stmt, rows[start : start + BATCH])
        await asyncio.sleep(0)  # let the web app's requests run between batches; the import shares their event loop
    return len(rows)


async def insert_new(session: AsyncSession, model, rows: list[dict]) -> int:
    """Insert the rows whose key is not there yet; the number inserted."""
    if not rows:
        return 0
    table = model.__table__
    key = [c.name for c in table.primary_key.columns]
    keys = [tuple(r[k] for k in key) for r in rows]
    cols = [table.c[k] for k in key]
    existing = set((await session.execute(select(*cols).where(tuple_(*cols).in_(keys)))).all()) if len(cols) > 1 else {
        (v,) for v in (await session.execute(select(cols[0]).where(cols[0].in_([k[0] for k in keys])))).scalars()
    }
    fresh = [r for r, k in zip(rows, keys, strict=True) if k not in existing]
    for start in range(0, len(fresh), BATCH):
        stmt = _insert(session, table).on_conflict_do_nothing(index_elements=key)
        await session.execute(stmt, fresh[start : start + BATCH])
    return len(fresh)


async def mark_missing_leads_deleted(session: AsyncSession, seen_ids: Iterable[str]) -> int:
    """After a full read of the open and archived inboxes: flag the leads Pipedrive
    no longer lists, and clear the flag on any it lists again. Returns how many
    were newly flagged."""
    seen = set(seen_ids)
    rows = (await session.execute(select(MirrorLead.id, MirrorLead.is_deleted))).all()
    gone = [r.id for r in rows if r.id not in seen and not r.is_deleted]
    back = [r.id for r in rows if r.id in seen and r.is_deleted]
    for ids, flag in ((gone, True), (back, False)):
        for chunk in range(0, len(ids), 500):
            await session.execute(update(MirrorLead).where(MirrorLead.id.in_(ids[chunk:chunk + 500])).values(is_deleted=flag))
    return len(gone)


async def close_runs_left_running(session: AsyncSession, *, now: datetime | None = None) -> int:
    """Mark every row still "running" as failed. For a fresh process at start:
    this deployment has one web service and one scheduler, so a running row
    found at boot belongs to a process that is gone (a deploy restarted it)."""
    now = now or datetime.now(UTC)
    rows = (await session.execute(select(ImportRun).where(ImportRun.status == "running"))).scalars().all()
    for row in rows:
        row.status, row.finished_at, row.error = "failed", now, "left running by a process that was restarted"
    await session.commit()
    return len(rows)


async def running_run(session: AsyncSession, *, now: datetime) -> ImportRun | None:
    """The run row that still says "running", or None. A row older than
    STALE_RUN is closed as failed (the process that owned it is gone)."""
    rows = (await session.execute(select(ImportRun).where(ImportRun.status == "running").order_by(ImportRun.started_at.desc()))).scalars().all()
    live: ImportRun | None = None
    for row in rows:
        if row.started_at < now - STALE_RUN:
            row.status, row.finished_at, row.error = "failed", now, "left running by a process that did not finish"
        elif live is None:
            live = row
    await session.commit()
    return live


async def last_good_start(session: AsyncSession) -> datetime | None:
    stmt = select(ImportRun.started_at).where(ImportRun.status == "ok").order_by(ImportRun.started_at.desc()).limit(1)
    return (await session.execute(stmt)).scalar_one_or_none()


async def deals_needing_changelog(session: AsyncSession, *, full: bool) -> list[tuple[int, datetime | None]]:
    stmt = select(MirrorDeal.id, MirrorDeal.update_time).order_by(MirrorDeal.id)
    if not full:
        stmt = stmt.where(or_(MirrorDeal.changelog_update_time.is_(None), MirrorDeal.changelog_update_time < MirrorDeal.update_time))
    return [(row.id, row.update_time) for row in (await session.execute(stmt)).all()]


async def persons_needing_flow(session: AsyncSession, *, now: datetime, full: bool, max_age: timedelta = FLOW_MAX_AGE) -> list[int]:
    """Persons with consent whose marketing history is unread, older than
    their last edit, or older than `max_age` (opens keep arriving)."""
    stmt = select(MirrorPerson.id).where(MirrorPerson.marketing_status.in_(MARKETED_STATUSES)).order_by(MirrorPerson.id)
    if not full:
        stmt = stmt.where(or_(MirrorPerson.flow_fetched_at.is_(None), MirrorPerson.flow_fetched_at < MirrorPerson.update_time, MirrorPerson.flow_fetched_at < now - max_age))
    return list((await session.execute(stmt)).scalars())


# ---- the run -------------------------------------------------------------------------


async def run_import(
    sessions: async_sessionmaker[AsyncSession],
    reader: PipedriveReader,
    *,
    full: bool = False,
    dry_run: bool = False,
    clock: Callable[[], datetime] = lambda: datetime.now(UTC),
) -> ImportCounts:
    """Pull everything that changed (or everything, with `full`) into the
    mirror. `dry_run` reads and counts but writes nothing, not even the run
    row. Raises MirrorError when Pipedrive cannot be read; the run row says so."""
    now = clock()
    counts = ImportCounts()

    async with sessions() as session:
        if not dry_run:
            live = await running_run(session, now=now)
            if live is not None:
                raise ImportInProgress(f"run {live.id} started {live.started_at.isoformat()} is still running")
        since = None if full else await last_good_start(session)
        if since is not None:
            since -= INCREMENTAL_MARGIN
        mode = "incremental" if since else "full"
        run_id: int | None = None
        if not dry_run:
            run = ImportRun(started_at=now, mode=mode, status="running", updated_since=since)
            session.add(run)
            await session.commit()
            run_id = run.id
    logger.info("import %s%s: start%s", mode, " (dry run)" if dry_run else "", f", changes since {since.isoformat()}" if since else "")

    async def store(model, rows: list[dict], **kw) -> int:
        if dry_run:
            return len(rows)
        async with sessions() as session:
            n = await upsert(session, model, rows, **kw)
            await session.commit()
            return n

    try:
        counts.pipelines = await store(Pipeline, [pipeline_row(p, now) async for p in reader.pages("/api/v2/pipelines")])
        counts.stages = await store(Stage, [stage_row(s, now) async for s in reader.pages("/api/v2/stages")])
        counts.deal_fields = await store(DealField, [field_row(f, now) async for f in reader.pages("/api/v2/dealFields")])
        counts.users = await store(MirrorUser, [user_row(u, now) for u in (await reader.get("/api/v1/users")).get("data") or []])
        logger.info("pipelines %d, stages %d, deal fields %d, users %d", counts.pipelines, counts.stages, counts.deal_fields, counts.users)

        fetched_deals: list[dict] = []
        for path, params in (
            ("/api/v2/deals", {"status": "open,won,lost"}),
            ("/api/v2/deals/archived", {"status": "open,won,lost"}),
            ("/api/v2/deals", {"status": "deleted"}),
        ):
            rows = [deal_row(d, now) async for d in reader.pages(path, {**params, "include_fields": DEAL_FIELDS, **since_param(since)})]
            counts.deals += await store(MirrorDeal, rows, keep=("changelog_update_time",))
            fetched_deals.extend(rows)
        logger.info("deals %d", counts.deals)

        fetched_persons = [person_row(p, now) async for p in reader.pages("/api/v2/persons", {"include_fields": PERSON_FIELDS, **since_param(since)})]
        counts.persons = await store(MirrorPerson, fetched_persons, keep=("flow_fetched_at",))
        logger.info("persons %d", counts.persons)

        counts.activities = await store(Activity, [activity_row(a, now) async for a in reader.pages("/api/v2/activities", since_param(since))])
        open_leads = [lead_row(x, now) async for x in reader.offset_pages("/api/v1/leads", since_param(since))]
        archived_leads = [lead_row(x, now) async for x in reader.offset_pages("/api/v1/leads/archived")]
        counts.leads = await store(MirrorLead, open_leads) + await store(MirrorLead, archived_leads)
        if full and not dry_run:
            seen = [r["id"] for r in open_leads] + [r["id"] for r in archived_leads]
            async with sessions() as session:
                counts.leads_deleted = await mark_missing_leads_deleted(session, seen)
                await session.commit()
        logger.info("activities %d, leads %d (%d no longer in Pipedrive)", counts.activities, counts.leads, counts.leads_deleted)

        if dry_run:
            todo = [(r["id"], r["update_time"]) for r in fetched_deals]
        else:
            async with sessions() as session:
                todo = await deals_needing_changelog(session, full=full)
        logger.info("changelog: %d deals to read", len(todo))
        session = None if dry_run else sessions()
        try:
            for deal_id, update_time in todo:
                entries = [e async for e in reader.pages(f"/api/v1/deals/{deal_id}/changelog")]
                changes, stages = change_rows(deal_id, entries)
                if dry_run:
                    counts.field_changes += len(changes)
                    counts.stage_changes += len(stages)
                    continue
                counts.field_changes += await insert_new(session, DealChange, changes)
                counts.stage_changes += await insert_new(session, DealStageHistory, stages)
                await session.execute(update(MirrorDeal).where(MirrorDeal.id == deal_id).values(changelog_update_time=update_time))
                await session.commit()  # one deal per transaction: short, and a failure keeps what came before
        finally:
            if session is not None:
                await session.close()
        logger.info("stage changes new %d, field changes new %d", counts.stage_changes, counts.field_changes)

        if dry_run:
            people = [r["id"] for r in fetched_persons if r["marketing_status"] in MARKETED_STATUSES]
        else:
            async with sessions() as session:
                people = await persons_needing_flow(session, now=now, full=full)
        logger.info("marketing history: %d persons to read", len(people))
        gate = asyncio.Semaphore(FLOW_CONCURRENCY)

        async def read_flow(person_id: int) -> tuple[int, list[dict]]:
            async with gate:
                return person_id, [i async for i in reader.offset_pages(f"/api/v1/persons/{person_id}/flow", {"items": FLOW_ITEMS})]

        session = None if dry_run else sessions()
        try:
            for start in range(0, len(people), FLOW_BATCH):
                for person_id, items in await asyncio.gather(*(read_flow(p) for p in people[start : start + FLOW_BATCH])):
                    changes, stats = flow_rows(person_id, items, now)
                    counts.flows += 1
                    if dry_run:
                        counts.marketing_changes += len(changes)
                        counts.campaign_stats += len(stats)
                        continue
                    counts.marketing_changes += await insert_new(session, MarketingStatusChange, changes)
                    counts.campaign_stats += await upsert(session, CampaignStat, stats)
                    await session.execute(update(MirrorPerson).where(MirrorPerson.id == person_id).values(flow_fetched_at=now))
                    await session.commit()  # one person per transaction
        finally:
            if session is not None:
                await session.close()
        logger.info("marketing history read for %d persons: status changes new %d, campaign stats %d", counts.flows, counts.marketing_changes, counts.campaign_stats)
    except BaseException as exc:
        # BaseException, not Exception: a cancelled task (SIGTERM on a deploy)
        # raises CancelledError, which is not an Exception, and the row must
        # still be closed or it would block the next run for STALE_RUN.
        reason = "cancelled (process shutting down)" if isinstance(exc, asyncio.CancelledError) else str(exc)[:2000]
        logger.error("import failed: %s", reason)
        if run_id is not None:
            async with sessions() as session:
                await session.execute(update(ImportRun).where(ImportRun.id == run_id).values(status="failed", finished_at=clock(), error=reason, counts=counts.as_dict()))
                await session.commit()
        raise

    if run_id is not None:
        async with sessions() as session:
            await session.execute(update(ImportRun).where(ImportRun.id == run_id).values(status="ok", finished_at=clock(), counts=counts.as_dict()))
            await session.commit()
    logger.info("import done: %s", counts.as_dict())
    return counts
