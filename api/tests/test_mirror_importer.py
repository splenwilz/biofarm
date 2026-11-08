"""The import: every table filled, safe to re-run, incremental after the first run."""

import asyncio
import logging
from datetime import UTC, datetime, timedelta

import httpx
import pytest
import respx
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db import Base
from app.mirror.importer import (
    FLOW_MAX_AGE,
    INCREMENTAL_MARGIN,
    STALE_RUN,
    ImportCounts,
    ImportInProgress,
    close_runs_left_running,
    run_import,
)
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
from app.mirror.reader import MirrorError, PipedriveReader

BASE = "https://biofarm.pipedrive.com"
TOKEN = "tok-secret-123"
T0 = datetime(2026, 11, 6, 9, 0, tzinfo=UTC)


def ok(items, next_cursor=None):
    return {"success": True, "data": items, "additional_data": {"next_cursor": next_cursor}}


PIPELINES = [
    {"id": 3, "name": "Developer Pipeline", "order_nr": 2, "is_deleted": False, "add_time": "2023-10-01T10:00:00Z", "update_time": "2024-01-01T00:00:00Z"},
    {"id": 7, "name": "DORMANT Developers", "order_nr": 6, "is_deleted": False, "add_time": "2024-10-01T10:00:00Z", "update_time": "2024-10-01T10:00:00Z"},
]
STAGES = [
    {"id": 13, "pipeline_id": 3, "name": "OPPORTUNITY (Qualified)", "order_nr": 1, "deal_probability": 10, "is_deleted": False, "add_time": "2023-10-01T10:00:00Z", "update_time": "2023-10-01T10:00:00Z"},
    {"id": 14, "pipeline_id": 3, "name": "QUOTED", "order_nr": 2, "deal_probability": 30, "is_deleted": False, "add_time": "2023-10-01T10:00:00Z", "update_time": "2023-10-01T10:00:00Z"},
    {"id": 61, "pipeline_id": 7, "name": "With Broker Not Dead", "order_nr": 3, "deal_probability": 5, "is_deleted": False, "add_time": "2024-10-01T10:00:00Z", "update_time": "2024-10-01T10:00:00Z"},
]
FIELDS = [
    {"field_code": "channel", "field_name": "Source channel", "field_type": "enum", "is_custom_field": False, "options": [{"id": 1037, "label": "Website"}, {"id": 1136, "label": "Existing Network"}]},
    {"field_code": "0aae17cbf55fb893122e0ac9870733d3312a4ccd", "field_name": "LPA (Deal Location)", "field_type": "enum", "is_custom_field": True, "options": [{"id": 542, "label": "Adur"}]},
    {"field_code": "title", "field_name": "Title", "field_type": "varchar", "is_custom_field": False, "options": None},
]
LPA = "0aae17cbf55fb893122e0ac9870733d3312a4ccd"


def deal(id, **over):
    base = {
        "id": id, "title": f"Deal {id}", "pipeline_id": 3, "stage_id": 13, "status": "open", "origin": "ManuallyCreated", "origin_id": None,
        "channel": 1037, "channel_id": "google / cpc", "person_id": 500 + id, "org_id": None, "owner_id": 11, "creator_user_id": 11,
        "value": 1000.5, "currency": "GBP", "lost_reason": None, "add_time": "2026-09-29T10:31:28Z", "update_time": "2026-10-07T13:47:29Z",
        "stage_change_time": "2026-10-07T13:47:29Z", "won_time": None, "lost_time": None, "close_time": None, "is_archived": False, "is_deleted": False,
        "custom_fields": {LPA: {"id": 542}}, "label_ids": [], "probability": None,
    }
    base.update(over)
    return base


def person(id, **over):
    base = {"id": id, "name": f"Person {id}", "first_name": "P", "last_name": str(id), "emails": [{"value": f"p{id}@example.com", "primary": True, "label": "work"}],
            "phones": [], "org_id": None, "owner_id": 11, "label_ids": [], "is_deleted": False, "add_time": "2026-09-01T08:00:00Z", "update_time": "2026-09-02T08:00:00Z", "custom_fields": {}}
    base.update(over)
    return base


USERS = [
    {"id": 11, "name": "Francis Morrison-Bell", "email": "francis@example.com", "active_flag": True, "is_admin": 0, "created": "2023-10-01 10:00:00", "modified": "2026-01-01 10:00:00"},
    {"id": 12, "name": "Former Colleague", "email": "former@example.com", "active_flag": False, "is_admin": 0, "created": "2023-10-01 10:00:00", "modified": "2024-01-01 10:00:00"},
]
UTM = "25d5b56aeb0185949c5876617bb88f346c89d139"


def activity(id, **over):
    base = {"id": id, "subject": "Call", "type": "call", "owner_id": 11, "creator_user_id": 11, "is_deleted": False, "add_time": "2026-09-29T12:00:00Z",
            "update_time": "2026-09-30T09:00:00Z", "deal_id": 1, "lead_id": None, "person_id": 501, "org_id": None, "project_id": None, "due_date": "2026-09-30",
            "due_time": None, "duration": None, "done": True, "busy": False, "marked_as_done_time": "2026-09-30T09:00:00Z", "location": None,
            "participants": [{"person_id": 501, "primary": True}], "note": None, "priority": None, "outcome": None}
    base.update(over)
    return base


def lead(id, **over):
    base = {"id": id, "title": "Website lead", "owner_id": 11, "creator_id": 11, "label_ids": [], "value": None, "expected_close_date": None, "person_id": 502,
            "organization_id": None, "is_archived": False, "archive_time": None, "archive_reason": None, "source_name": "API", "source_deal_id": None,
            "origin": "API", "origin_id": "our-lead-uuid", "channel": 1037, "channel_id": "google / cpc", "was_seen": False, "next_activity_id": None,
            "add_time": "2026-09-29T10:00:00.000Z", "update_time": "2026-09-29T10:00:00.000Z", "visible_to": "3", "cc_email": "x@pipedrivemail.com", UTM: "spring-push"}
    base.update(over)
    return base


def campaign_stat(campaign_id, name, sent, opens=0, clicks=0, links=None):
    return {"object": "marketing_campaign_stat", "timestamp": sent, "data": {"item_type": "marketing_campaign_stat", "prio": 2, "id": campaign_id, "name": name, "type": "regular",
            "owner_id": 11, "clicked_links": links or [], "total_clicks": clicks, "open_stat": {"timestamp": sent + ".000000"} if opens else None, "total_opens": opens, "timestamp": sent + ".000000"}}


def status_change(id, status, at, reason="user", **details):
    return {"object": "marketing_status_change", "timestamp": at, "data": {"item_type": "marketing_status_change", "prio": 2, "id": id, "reason": reason, "reason_details": details or {"user_id": 11}, "status": status, "timestamp": at}}


def change(field_key, old, new, time, **over):
    base = {"field_key": field_key, "old_value": old, "new_value": new, "time": time, "actor_user_id": 11, "change_source": "app", "change_source_user_agent": None, "is_bulk_update_flag": False}
    base.update(over)
    return base


class FakePipedrive:
    """Routes for a small account. Tests mutate the lists between runs."""

    def __init__(self):
        self.pipelines = list(PIPELINES)
        self.stages = list(STAGES)
        self.fields = list(FIELDS)
        self.deals = [deal(1), deal(2, pipeline_id=7, stage_id=61, channel=None, channel_id=None, custom_fields={LPA: None})]
        self.archived = []
        self.deleted = []
        self.persons = [person(501, marketing_status="subscribed", doi_status=1), person(502, marketing_status="no_consent", doi_status=0)]
        self.users = list(USERS)
        self.activities = [activity(1), activity(2, person_id=502, deal_id=None, type="task", done=False, marked_as_done_time=None, participants=[{"person_id": 502, "primary": True}])]
        self.leads = [lead("8cb2ba00-a95d-11ee-aec4-f3424f5b4dde")]
        self.archived_leads = [lead("dc8a80e0-b389-11ee-9581-d55a394d57f7", is_archived=True, archive_time="2026-10-01T10:00:00.000Z", person_id=501)]
        self.flows = {
            501: [campaign_stat(33, "Newsletter - October 2026", "2026-10-27 08:01:00", opens=1), status_change(320, "subscribed", "2025-10-09 08:57:27")],
            502: [],
        }
        self.lead_page_size = 100
        self.changelog = {
            1: [change("add_time", None, "2026-09-29 10:31:28", "2026-09-29 10:31:28"), change("value", "0", "1000.5", "2026-09-30 15:03:47"), change("stage_id", "13", "14", "2026-10-07 13:47:29")],
            2: [change("stage_id", "13", "14", "2026-09-29 11:56:09"), change("stage_id", "14", "61", "2026-09-29 11:56:16")],
        }
        self.changelog_status = 200

    def mount(self, router):
        router.get(f"{BASE}/api/v2/pipelines").mock(side_effect=lambda r: httpx.Response(200, json=ok(self.pipelines)))
        router.get(f"{BASE}/api/v2/stages").mock(side_effect=lambda r: httpx.Response(200, json=ok(self.stages)))
        router.get(f"{BASE}/api/v2/dealFields").mock(side_effect=lambda r: httpx.Response(200, json=ok(self.fields)))
        self.deals_route = router.get(f"{BASE}/api/v2/deals").mock(side_effect=self._deals)
        router.get(f"{BASE}/api/v2/deals/archived").mock(side_effect=lambda r: httpx.Response(200, json=ok(self.archived)))
        self.persons_route = router.get(f"{BASE}/api/v2/persons").mock(side_effect=self._persons)
        self.changelog_route = router.get(url__regex=rf"{BASE}/api/v1/deals/(?P<id>\d+)/changelog").mock(side_effect=self._changelog)
        router.get(f"{BASE}/api/v1/users").mock(side_effect=lambda r: httpx.Response(200, json={"success": True, "data": self.users}))
        self.activities_route = router.get(f"{BASE}/api/v2/activities").mock(side_effect=self._activities)
        self.leads_route = router.get(f"{BASE}/api/v1/leads").mock(side_effect=self._leads)
        router.get(f"{BASE}/api/v1/leads/archived").mock(side_effect=lambda r: self._offset_page(self.archived_leads, r))
        self.flow_route = router.get(url__regex=rf"{BASE}/api/v1/persons/(?P<id>\d+)/flow").mock(side_effect=self._flow)

    def _since(self, request):
        since = request.url.params.get("updated_since")
        return datetime.fromisoformat(since) if since else None

    def _deals(self, request):
        status = request.url.params.get("status", "")
        if status == "deleted":
            return httpx.Response(200, json=ok(self.deleted))
        since = self._since(request)
        rows = [d for d in self.deals if since is None or datetime.fromisoformat(d["update_time"]) >= since]
        return httpx.Response(200, json=ok(rows))

    def _persons(self, request):
        since = self._since(request)
        rows = [p for p in self.persons if since is None or datetime.fromisoformat(p["update_time"]) >= since]
        wanted = set((request.url.params.get("include_fields") or "").split(","))
        rows = [{k: v for k, v in p.items() if k not in ("marketing_status", "doi_status") or k in wanted} for p in rows]
        return httpx.Response(200, json=ok(rows))

    def _activities(self, request):
        since = self._since(request)
        rows = [a for a in self.activities if since is None or datetime.fromisoformat(a["update_time"]) >= since]
        return httpx.Response(200, json=ok(rows))

    def _offset_page(self, rows, request):
        start, limit = int(request.url.params.get("start", 0)), int(request.url.params.get("limit", 100))
        page = rows[start : start + limit]
        more = start + limit < len(rows)
        pagination = {"start": start, "limit": limit, "more_items_in_collection": more}
        if more:
            pagination["next_start"] = start + limit
        return httpx.Response(200, json={"success": True, "data": page or None, "additional_data": {"pagination": pagination}})

    def _leads(self, request):
        since = self._since(request)
        rows = [x for x in self.leads if since is None or datetime.fromisoformat(x["update_time"]) >= since]
        return self._offset_page(rows, request)

    def _flow(self, request, id):
        assert request.url.params.get("items") == "marketing_status_change,marketing_campaign_stat"
        return self._offset_page(self.flows.get(int(id), []), request)

    def _changelog(self, request, id):
        if self.changelog_status != 200:
            return httpx.Response(self.changelog_status, json={"success": False, "error": "server error"})
        return httpx.Response(200, json=ok(self.changelog.get(int(id), [])))


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    """Retries back off without waiting in tests."""

    async def fake_sleep(seconds: float) -> None:
        pass

    monkeypatch.setattr("app.mirror.reader.asyncio.sleep", fake_sleep)


@pytest.fixture
async def sessions(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/mirror.db")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


@pytest.fixture
def pipedrive():
    with respx.mock(assert_all_mocked=True, assert_all_called=False) as router:
        fake = FakePipedrive()
        fake.mount(router)
        yield fake


async def do_run(sessions, *, full=False, dry_run=False, now=T0) -> ImportCounts:
    async with PipedriveReader(company_domain="biofarm", api_token=TOKEN) as reader:
        return await run_import(sessions, reader, full=full, dry_run=dry_run, clock=lambda: now)


async def count(sessions, model) -> int:
    async with sessions() as s:
        return (await s.execute(select(func.count()).select_from(model))).scalar_one()


async def test_first_run_fills_every_table(sessions, pipedrive):
    counts = await do_run(sessions)
    assert counts.pipelines == 2 and counts.stages == 3 and counts.deal_fields == 3
    assert counts.deals == 2 and counts.persons == 2 and counts.stage_changes == 3 and counts.field_changes == 5
    assert counts.users == 2 and counts.activities == 2 and counts.leads == 2
    # only the subscribed person has a marketing history worth reading; no_consent persons have none
    assert counts.flows == 1 and counts.marketing_changes == 1 and counts.campaign_stats == 1
    assert [c.request.url.path for c in pipedrive.flow_route.calls] == ["/api/v1/persons/501/flow"]
    async with sessions() as s:
        u = await s.get(MirrorUser, 12)
        assert u.name == "Former Colleague" and u.email == "former@example.com" and u.is_active is False and u.raw["id"] == 12
        a = await s.get(Activity, 1)
        assert a.type == "call" and a.person_id == 501 and a.deal_id == 1 and a.done is True and a.owner_id == 11
        assert a.marked_as_done_time == datetime(2026, 9, 30, 9, 0, tzinfo=UTC) and a.add_time == datetime(2026, 9, 29, 12, 0, tzinfo=UTC)
        assert (await s.get(Activity, 2)).marked_as_done_time is None
        lead_row = await s.get(MirrorLead, "8cb2ba00-a95d-11ee-aec4-f3424f5b4dde")
        assert lead_row.person_id == 502 and lead_row.origin == "API" and lead_row.origin_id == "our-lead-uuid" and lead_row.channel == 1037 and lead_row.channel_id == "google / cpc"
        assert lead_row.is_archived is False and lead_row.custom_fields == {UTM: "spring-push"} and lead_row.add_time == datetime(2026, 9, 29, 10, 0, tzinfo=UTC)
        archived = await s.get(MirrorLead, "dc8a80e0-b389-11ee-9581-d55a394d57f7")
        assert archived.is_archived is True and archived.archive_time == datetime(2026, 10, 1, 10, 0, tzinfo=UTC)
        p1 = await s.get(MirrorPerson, 501)
        assert p1.marketing_status == "subscribed" and p1.doi_status == 1 and p1.flow_fetched_at == T0
        p2 = await s.get(MirrorPerson, 502)
        assert p2.marketing_status == "no_consent" and p2.flow_fetched_at is None
        stat = await s.get(CampaignStat, (33, 501))
        assert stat.campaign_name == "Newsletter - October 2026" and stat.opens == 1 and stat.clicks == 0 and stat.clicked_links == []
        assert stat.sent_at == datetime(2026, 10, 27, 8, 1, tzinfo=UTC) and stat.first_open_at == datetime(2026, 10, 27, 8, 1, tzinfo=UTC)
        ch = await s.get(MarketingStatusChange, 320)
        assert ch.person_id == 501 and ch.status == "subscribed" and ch.reason == "user" and ch.user_id == 11 and ch.campaign_id is None
        assert ch.changed_at == datetime(2025, 10, 9, 8, 57, 27, tzinfo=UTC)
        d = await s.get(MirrorDeal, 1)
        assert d.title == "Deal 1" and d.pipeline_id == 3 and d.stage_id == 13 and d.status == "open"
        assert d.channel == 1037 and d.channel_id == "google / cpc" and d.origin == "ManuallyCreated"
        assert d.add_time == datetime(2026, 9, 29, 10, 31, 28, tzinfo=UTC)
        assert d.custom_fields == {LPA: {"id": 542}}
        assert d.raw["title"] == "Deal 1" and d.raw["custom_fields"][LPA] == {"id": 542}
        assert d.fetched_at == T0
        d2 = await s.get(MirrorDeal, 2)
        assert d2.channel is None and d2.channel_id is None
        history = (await s.execute(select(DealStageHistory).where(DealStageHistory.deal_id == 2).order_by(DealStageHistory.changed_at))).scalars().all()
        assert [(h.old_stage_id, h.new_stage_id) for h in history] == [(13, 14), (14, 61)]
        assert history[0].changed_at == datetime(2026, 9, 29, 11, 56, 9, tzinfo=UTC)
        assert history[0].actor_user_id == 11
        # the move into the DORMANT pipeline is recoverable through the stage's pipeline
        stage = await s.get(Stage, history[1].new_stage_id)
        assert stage.pipeline_id == 7 and (await s.get(Pipeline, 7)).name == "DORMANT Developers"
        changes = (await s.execute(select(DealChange).where(DealChange.deal_id == 1).order_by(DealChange.changed_at))).scalars().all()
        assert [c.field_key for c in changes] == ["add_time", "value", "stage_id"]
        assert changes[1].old_value == "0" and changes[1].new_value == "1000.5"
        f = await s.get(DealField, "channel")
        assert f.name == "Source channel" and f.is_custom is False and f.options[0] == {"id": 1037, "label": "Website"}
        p = await s.get(MirrorPerson, 501)
        assert p.name == "Person 501" and p.emails[0]["value"] == "p501@example.com" and p.raw["id"] == 501
        run = (await s.execute(select(ImportRun))).scalar_one()
        assert run.status == "ok" and run.mode == "full" and run.started_at == T0 and run.finished_at == T0
        assert run.counts["deals"] == 2 and run.counts["flows"] == 1 and run.updated_since is None


async def test_running_twice_creates_no_duplicates(sessions, pipedrive):
    first = await do_run(sessions)
    second = await do_run(sessions, full=True, now=T0 + timedelta(hours=1))
    assert second.deals == first.deals and second.persons == first.persons
    # a full run reads every changelog again and finds nothing new
    assert pipedrive.changelog_route.call_count == 4
    assert second.stage_changes == 0 and second.field_changes == 0
    assert await count(sessions, MirrorDeal) == 2
    assert await count(sessions, DealStageHistory) == 3
    assert await count(sessions, DealChange) == 5
    assert await count(sessions, MirrorPerson) == 2
    assert await count(sessions, ImportRun) == 2


async def test_second_run_is_incremental_from_the_last_good_start(sessions, pipedrive):
    await do_run(sessions)
    for route in (pipedrive.deals_route, pipedrive.persons_route, pipedrive.changelog_route):
        route.reset()
    # deal 1 changed since, deal 2 did not; a new person appeared
    pipedrive.deals[0] = deal(1, title="Deal 1 renamed", update_time="2026-11-06T09:30:00Z", stage_id=14)
    pipedrive.changelog[1].append(change("stage_id", "14", "13", "2026-11-06 09:30:00"))
    pipedrive.persons.append(person(503, update_time="2026-11-06T09:40:00Z"))
    later = T0 + timedelta(hours=1)
    counts = await do_run(sessions, now=later)

    since = (T0 - INCREMENTAL_MARGIN).strftime("%Y-%m-%dT%H:%M:%SZ")
    sent = {c.request.url.params.get("updated_since") for c in pipedrive.deals_route.calls if c.request.url.params.get("status") != "deleted"}
    assert sent == {since}
    assert pipedrive.persons_route.calls.last.request.url.params["updated_since"] == since
    assert pipedrive.activities_route.calls.last.request.url.params["updated_since"] == since
    assert pipedrive.leads_route.calls.last.request.url.params["updated_since"] == since
    assert [c.request.url.path for c in pipedrive.changelog_route.calls] == ["/api/v1/deals/1/changelog"]
    assert counts.deals == 1 and counts.persons == 1 and counts.stage_changes == 1
    async with sessions() as s:
        assert (await s.get(MirrorDeal, 1)).title == "Deal 1 renamed"
        assert (await s.get(MirrorDeal, 2)).title == "Deal 2"  # untouched rows stay
        assert await count(sessions, DealStageHistory) == 4
        assert await count(sessions, MirrorPerson) == 3
        run = (await s.execute(select(ImportRun).order_by(ImportRun.id.desc()))).scalars().first()
        assert run.mode == "incremental" and run.updated_since == T0 - INCREMENTAL_MARGIN


async def test_a_failed_run_does_not_move_the_incremental_window(sessions, pipedrive):
    await do_run(sessions)
    pipedrive.deals[0] = deal(1, update_time="2026-11-06T09:30:00Z")
    pipedrive.changelog_status = 500
    with pytest.raises(MirrorError):
        await do_run(sessions, now=T0 + timedelta(hours=1))
    pipedrive.changelog_status = 200
    await do_run(sessions, now=T0 + timedelta(hours=2))
    since = (T0 - INCREMENTAL_MARGIN).strftime("%Y-%m-%dT%H:%M:%SZ")
    assert pipedrive.deals_route.calls.last.request.url.params.get("updated_since") == since


async def test_deleted_and_archived_deals_are_kept_and_marked(sessions, pipedrive):
    await do_run(sessions)
    pipedrive.deleted = [deal(2, is_deleted=True, update_time="2026-11-06T08:00:00Z")]
    pipedrive.deals = [d for d in pipedrive.deals if d["id"] != 2]
    pipedrive.archived = [deal(3, is_archived=True, update_time="2026-11-06T08:30:00Z")]
    await do_run(sessions, now=T0 + timedelta(hours=1))
    async with sessions() as s:
        assert (await s.get(MirrorDeal, 2)).is_deleted is True
        assert (await s.get(MirrorDeal, 3)).is_archived is True
        assert await count(sessions, MirrorDeal) == 3


async def test_a_failure_is_recorded_on_the_run_and_raised(sessions, pipedrive, caplog):
    caplog.set_level(logging.DEBUG)
    pipedrive.changelog_status = 500
    with pytest.raises(MirrorError):
        await do_run(sessions)
    async with sessions() as s:
        run = (await s.execute(select(ImportRun))).scalar_one()
        assert run.status == "failed" and "500" in run.error and run.finished_at == T0
        assert TOKEN not in run.error
    assert TOKEN not in caplog.text
    # the tables filled before the failure are kept: a retry picks up from there
    assert await count(sessions, MirrorDeal) == 2


async def test_dry_run_reads_everything_and_writes_nothing(sessions, pipedrive):
    counts = await do_run(sessions, dry_run=True)
    assert counts.deals == 2 and counts.stage_changes == 3
    assert counts.users == 2 and counts.activities == 2 and counts.leads == 2 and counts.flows == 1 and counts.campaign_stats == 1
    for model in (Pipeline, Stage, DealField, MirrorDeal, MirrorPerson, DealStageHistory, DealChange, ImportRun, MirrorUser, Activity, MirrorLead, CampaignStat, MarketingStatusChange):
        assert await count(sessions, model) == 0


async def test_changelog_pages_are_followed(sessions, pipedrive):
    pages = [
        httpx.Response(200, json=ok([change("stage_id", "13", "14", "2026-10-01 10:00:00")], next_cursor="more")),
        httpx.Response(200, json=ok([change("stage_id", "14", "13", "2026-10-02 10:00:00")])),
    ]
    pipedrive.changelog_route.side_effect = lambda request, id: pages.pop(0) if int(id) == 1 else httpx.Response(200, json=ok([]))
    counts = await do_run(sessions)
    assert counts.stage_changes == 2
    assert [c.request.url.params.get("cursor") for c in pipedrive.changelog_route.calls][:2] == [None, "more"]


async def test_odd_values_do_not_break_the_import(sessions, pipedrive):
    pipedrive.deals.append(deal(4, channel="1136", value=None, add_time="2026-09-29 10:31:28", custom_fields=None, person_id=None))
    pipedrive.changelog[4] = [change("stage_id", None, "13", "2026-09-29 10:31:28"), change("stage_id", "13", "not-a-number", "2026-09-30 10:31:28")]
    counts = await do_run(sessions)
    async with sessions() as s:
        d = await s.get(MirrorDeal, 4)
        assert d.channel == 1136 and d.value is None and d.custom_fields == {} and d.person_id is None
        assert d.add_time == datetime(2026, 9, 29, 10, 31, 28, tzinfo=UTC)
        history = (await s.execute(select(DealStageHistory).where(DealStageHistory.deal_id == 4))).scalars().all()
        assert [(h.old_stage_id, h.new_stage_id) for h in history] == [(None, 13)]
    assert counts.deals == 3


async def test_marketing_history_is_re_read_only_when_the_person_changed_or_the_read_is_old(sessions, pipedrive):
    await do_run(sessions)
    pipedrive.flow_route.reset()
    # an hour later: nothing changed, the flow is fresh, so it is not read again
    await do_run(sessions, now=T0 + timedelta(hours=1))
    assert pipedrive.flow_route.call_count == 0
    # the person was edited: read again
    pipedrive.persons[0] = person(501, marketing_status="subscribed", doi_status=1, update_time="2026-11-06T10:30:00Z")
    pipedrive.flows[501].append(status_change(900, "unsubscribed", "2026-11-06 09:45:00", reason="campaign", campaign_id=33))
    counts = await do_run(sessions, now=T0 + timedelta(hours=2))
    assert pipedrive.flow_route.call_count == 1 and counts.flows == 1 and counts.marketing_changes == 1
    async with sessions() as s:
        ch = await s.get(MarketingStatusChange, 900)
        assert ch.status == "unsubscribed" and ch.reason == "campaign" and ch.campaign_id == 33 and ch.user_id is None
        assert (await s.get(MirrorPerson, 501)).flow_fetched_at == T0 + timedelta(hours=2)
    # a day on, opens have accumulated: every person with a marketing history is read again, no_consent still skipped
    pipedrive.flow_route.reset()
    pipedrive.flows[501][0] = campaign_stat(33, "Newsletter - October 2026", "2026-10-27 08:01:00", opens=3, clicks=1, links=[{"link": "https://www.biofarm.co.uk/stories/x", "count": 1}])
    counts = await do_run(sessions, now=T0 + timedelta(hours=2) + FLOW_MAX_AGE + timedelta(minutes=1))
    assert [c.request.url.path for c in pipedrive.flow_route.calls] == ["/api/v1/persons/501/flow"]
    assert counts.flows == 1 and counts.marketing_changes == 0 and counts.campaign_stats == 1
    async with sessions() as s:
        stat = await s.get(CampaignStat, (33, 501))
        assert stat.opens == 3 and stat.clicks == 1 and stat.clicked_links[0]["count"] == 1
        assert await count(sessions, CampaignStat) == 1 and await count(sessions, MarketingStatusChange) == 2


async def test_a_person_who_gains_consent_gets_a_history_read(sessions, pipedrive):
    await do_run(sessions)
    pipedrive.persons[1] = person(502, marketing_status="subscribed", doi_status=1, update_time="2026-11-06T09:30:00Z")
    pipedrive.flows[502] = [status_change(901, "subscribed", "2026-11-06 09:45:00")]
    pipedrive.flow_route.reset()
    counts = await do_run(sessions, now=T0 + timedelta(hours=1))
    assert [c.request.url.path for c in pipedrive.flow_route.calls] == ["/api/v1/persons/502/flow"]
    assert counts.marketing_changes == 1


async def test_v1_offset_pages_are_followed_for_leads_and_flows(sessions, pipedrive):
    pipedrive.leads = [lead(f"lead-{n}", person_id=502) for n in range(5)]
    pipedrive.flows[501] = [campaign_stat(n, f"Issue {n}", f"2026-0{n}-01 09:00:00") for n in range(1, 4)] + [status_change(320, "subscribed", "2025-10-09 08:57:27")]
    pipedrive.flow_route.side_effect = lambda request, id: pipedrive._offset_page(pipedrive.flows.get(int(id), []), httpx.Request("GET", str(request.url).replace("limit=100", "limit=2")))
    pipedrive.leads_route.side_effect = lambda request: pipedrive._offset_page(pipedrive.leads, httpx.Request("GET", str(request.url).replace("limit=100", "limit=2")))
    counts = await do_run(sessions)
    assert counts.leads == 6 and counts.campaign_stats == 3 and counts.marketing_changes == 1
    assert [c.request.url.params["start"] for c in pipedrive.leads_route.calls] == ["0", "2", "4"]
    assert [c.request.url.params["start"] for c in pipedrive.flow_route.calls] == ["0", "2"]


async def test_odd_marketing_items_are_skipped_not_fatal(sessions, pipedrive):
    pipedrive.flows[501] = [
        {"object": "mailMessage", "timestamp": "2026-10-01 10:00:00", "data": {"id": 1}},
        {"object": "marketing_campaign_stat", "timestamp": "2026-10-01 10:00:00", "data": {"name": "no id"}},
        {"object": "marketing_status_change", "timestamp": "bad", "data": {"id": 5, "status": "subscribed", "timestamp": "bad"}},
        campaign_stat(33, "Newsletter - October 2026", "2026-10-27 08:01:00"),
    ]
    counts = await do_run(sessions)
    assert counts.campaign_stats == 1 and counts.marketing_changes == 0


async def test_deals_carry_the_lead_they_were_converted_from(sessions, pipedrive):
    """v2 deals only return source_lead_id when asked for it; it is the link
    from a converted deal back to the lead, which Pipedrive deletes on conversion."""
    pipedrive.deals.append(deal(5, source_lead_id="8cb2ba00-a95d-11ee-aec4-f3424f5b4dde"))
    await do_run(sessions)
    for call in pipedrive.deals_route.calls:
        assert "source_lead_id" in call.request.url.params.get("include_fields", "").split(",")
    async with sessions() as s:
        assert (await s.get(MirrorDeal, 5)).source_lead_id == "8cb2ba00-a95d-11ee-aec4-f3424f5b4dde"
        assert (await s.get(MirrorDeal, 1)).source_lead_id is None


async def test_full_import_marks_leads_pipedrive_no_longer_returns_as_deleted(sessions, pipedrive):
    """Pipedrive deletes a lead when it is converted or removed and never lists
    it again, so only a full read can notice; an incremental read leaves it."""
    await do_run(sessions)
    gone, kept = pipedrive.leads[0]["id"], pipedrive.archived_leads[0]["id"]
    pipedrive.leads = []
    await do_run(sessions, now=T0 + timedelta(hours=1))
    async with sessions() as s:
        assert (await s.get(MirrorLead, gone)).is_deleted is False
    counts = await do_run(sessions, full=True, now=T0 + timedelta(hours=2))
    async with sessions() as s:
        assert (await s.get(MirrorLead, gone)).is_deleted is True
        assert (await s.get(MirrorLead, kept)).is_deleted is False
    assert counts.leads_deleted == 1
    pipedrive.leads = [lead(gone)]
    await do_run(sessions, full=True, now=T0 + timedelta(hours=3))
    async with sessions() as s:
        assert (await s.get(MirrorLead, gone)).is_deleted is False


async def test_each_deal_changelog_commits_on_its_own(sessions, pipedrive):
    """On the production SQLite the API writes form submissions while an import
    runs, so a write transaction must stay short: one deal's changelog is
    committed before the next one is read. A failure on deal 2 keeps deal 1."""
    first = pipedrive.changelog_route.side_effect

    def failing(request, id):
        if int(id) == 2:
            return httpx.Response(500, json={"success": False})
        return first(request, id)

    pipedrive.changelog_route.side_effect = failing
    with pytest.raises(MirrorError):
        await do_run(sessions)
    async with sessions() as s:
        assert (await s.get(MirrorDeal, 1)).changelog_update_time is not None
        assert await count(sessions, DealStageHistory) == 1  # deal 1's one move


async def test_a_run_still_marked_running_blocks_a_new_one(sessions, pipedrive):
    """Two imports at once would interleave writes; the run row is the lock. A
    row left "running" by a crash stops blocking after STALE_RUN."""
    async with sessions() as s:
        s.add(ImportRun(started_at=T0 - timedelta(minutes=5), mode="full", status="running"))
        await s.commit()
    with pytest.raises(ImportInProgress):
        await do_run(sessions)
    async with sessions() as s:
        await s.execute(update(ImportRun).values(started_at=T0 - STALE_RUN - timedelta(minutes=1)))
        await s.commit()
    counts = await do_run(sessions)
    assert counts.deals == 2
    async with sessions() as s:
        statuses = sorted(r.status for r in (await s.execute(select(ImportRun))).scalars())
    assert statuses == ["failed", "ok"]  # the stale row is closed as failed, not left running


async def test_a_cancelled_run_marks_its_row_failed_and_does_not_block_the_next(sessions, pipedrive, monkeypatch):
    """SIGTERM on a deploy cancels a run mid-way. CancelledError is not an
    Exception, so the row used to stay "running" and refuse imports for two
    hours; the run must close its row on the way out."""
    real_get = PipedriveReader.get
    reached_changelog, hold = asyncio.Event(), asyncio.Event()  # events, not sleeps: asyncio.sleep is a no-op in this module's tests

    async def slow_get(self, path, params=None):
        if "/changelog" in path:
            reached_changelog.set()
            await hold.wait()  # the run is mid-way here when the "shutdown" arrives
        return await real_get(self, path, params)

    monkeypatch.setattr(PipedriveReader, "get", slow_get)
    async with PipedriveReader(company_domain="biofarm", api_token=TOKEN) as reader:
        task = asyncio.create_task(run_import(sessions, reader, clock=lambda: T0))
        await asyncio.wait_for(reached_changelog.wait(), 5)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    async with sessions() as s:
        row = (await s.execute(select(ImportRun))).scalars().one()
        assert row.status == "failed" and "cancelled" in (row.error or "") and row.finished_at is not None
    monkeypatch.setattr(PipedriveReader, "get", real_get)
    counts = await do_run(sessions, now=T0 + timedelta(minutes=1))
    assert counts.deals == 2


async def test_rows_left_running_by_a_dead_process_are_closed_on_request(sessions):
    """A fresh process (one web service, one scheduler) knows any "running" row
    it finds at start belongs to a process that is gone."""
    async with sessions() as s:
        s.add(ImportRun(started_at=T0 - timedelta(minutes=3), mode="incremental", status="running"))
        await s.commit()
    async with sessions() as s:
        assert await close_runs_left_running(s, now=T0) == 1
        row = (await s.execute(select(ImportRun))).scalars().one()
        assert row.status == "failed" and "restart" in (row.error or "")
        assert await close_runs_left_running(s, now=T0) == 0
