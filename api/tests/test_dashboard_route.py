"""GET /v1/dashboard: the dashboard's records, behind a shared token."""

from datetime import UTC, datetime

import pytest

from app.mirror.models import ImportRun, MirrorDeal, Pipeline, Stage

T = datetime(2026, 10, 7, 13, 47, 29, tzinfo=UTC)
TOKEN = "dash-secret-xyz"


async def seed(ac):
    async with ac.app.state.sessionmaker() as s:
        s.add_all([
            Pipeline(id=3, name="Developer Pipeline", raw={}, fetched_at=T),
            Stage(id=13, pipeline_id=3, name="OPPORTUNITY (Qualified)", raw={}, fetched_at=T),
            MirrorDeal(id=1, pipeline_id=3, stage_id=13, status="open", add_time=T, update_time=T, raw={}, fetched_at=T, custom_fields={}),
            ImportRun(started_at=T, finished_at=T, mode="full", status="ok"),
        ])
        await s.commit()


@pytest.mark.settings(dashboard_token=TOKEN)
async def test_returns_the_records_with_the_right_token(client):
    await seed(client)
    r = await client.get("/v1/dashboard", headers={"x-dashboard-token": TOKEN})
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "pipedrive" and body["syncedAt"] == "2026-10-07T13:47:29Z"
    assert body["deals"] == [{"id": "1", "pipeline": "developer", "channel": None, "createdAt": "2026-10-07T13:47:29Z", "qualifiedAt": "2026-10-07T13:47:29Z",
                              "status": "open", "sourceLabel": None, "campaign": None, "personId": None, "qualificationStatus": None}]
    assert r.headers["cache-control"] == "no-store"


@pytest.mark.settings(dashboard_token=TOKEN)
async def test_missing_or_wrong_token_is_401(client):
    assert (await client.get("/v1/dashboard")).status_code == 401
    r = await client.get("/v1/dashboard", headers={"x-dashboard-token": "nope"})
    assert r.status_code == 401
    assert TOKEN not in r.text
    assert (await client.get("/v1/dashboard", params={"token": TOKEN})).status_code == 401


async def test_unconfigured_token_refuses_everyone(client):
    r = await client.get("/v1/dashboard", headers={"x-dashboard-token": ""})
    assert r.status_code == 503
    assert "token" in r.json()["detail"].lower()


@pytest.mark.settings(dashboard_token=TOKEN)
async def test_no_import_yet_is_503(client):
    r = await client.get("/v1/dashboard", headers={"x-dashboard-token": TOKEN})
    assert r.status_code == 503
    assert "import" in r.json()["detail"].lower()


@pytest.mark.settings(dashboard_token=TOKEN)
async def test_payload_is_cached_until_the_next_import_finishes(client):
    """The feed is built once per import, not once per page view: a row added
    behind the API's back is not seen until a later import run has finished."""
    await seed(client)
    headers = {"x-dashboard-token": TOKEN}
    first = (await client.get("/v1/dashboard", headers=headers)).json()
    assert [d["id"] for d in first["deals"]] == ["1"]
    async with client.app.state.sessionmaker() as s:
        s.add(MirrorDeal(id=2, pipeline_id=3, stage_id=13, status="open", add_time=T, update_time=T, raw={}, fetched_at=T, custom_fields={}))
        await s.commit()
    assert [d["id"] for d in (await client.get("/v1/dashboard", headers=headers)).json()["deals"]] == ["1"]
    later = datetime(2026, 10, 8, 9, 0, 0, tzinfo=UTC)
    async with client.app.state.sessionmaker() as s:
        s.add(ImportRun(started_at=later, finished_at=later, mode="incremental", status="ok"))
        await s.commit()
    body = (await client.get("/v1/dashboard", headers=headers)).json()
    assert [d["id"] for d in body["deals"]] == ["1", "2"] and body["syncedAt"] == "2026-10-08T09:00:00Z"


@pytest.mark.settings(dashboard_token=TOKEN)
async def test_response_is_compressed_when_the_caller_accepts_gzip(client):
    await seed(client)
    async with client.app.state.sessionmaker() as s:
        s.add_all([MirrorDeal(id=n, pipeline_id=3, stage_id=13, status="open", add_time=T, update_time=T, raw={}, fetched_at=T, custom_fields={}) for n in range(2, 12)])
        await s.commit()
    res = await client.get("/v1/dashboard", headers={"x-dashboard-token": TOKEN, "accept-encoding": "gzip"})
    assert res.status_code == 200 and res.headers.get("content-encoding") == "gzip"
    assert len(res.json()["deals"]) == 11  # httpx transparently decodes


@pytest.mark.settings(dashboard_token=TOKEN)
async def test_a_new_website_record_between_imports_refreshes_the_payload(client):
    """Our own leads table changes between imports (form submissions), and the
    enquiries section reads it, so it is part of the cache key."""
    from app.models import Lead

    await seed(client)
    headers = {"x-dashboard-token": TOKEN}
    first = (await client.get("/v1/dashboard", headers=headers)).json()
    assert [e["id"] for e in first["enquiries"]] == ["1"]  # the seeded deal, created directly
    async with client.app.state.sessionmaker() as s:
        s.add(Lead(id="w1", form="contact", name="J", email="j@example.com", fields=["developer"], attribution={"utm_source": "google", "utm_medium": "cpc"},
                   pipedrive_person_id=501, pipedrive_lead_id="L1", created_at=datetime(2026, 10, 7, 14, 0, 0, tzinfo=UTC)))
        s.add(MirrorDeal(id=9, pipeline_id=3, stage_id=13, status="open", origin="API", origin_id="w1", add_time=T, update_time=T, raw={}, fetched_at=T, custom_fields={}))
        await s.commit()
    second = (await client.get("/v1/dashboard", headers=headers)).json()
    nine = next(e for e in second["enquiries"] if e["id"] == "9")
    assert nine["sourceLabel"] == "google/cpc" and nine["form"] == "contact"


@pytest.mark.settings(dashboard_token=TOKEN)
async def test_google_sections_appear_in_the_payload_and_a_google_import_refreshes_it(client):
    """Spend, traffic, search and conversions come from the Google daily tables;
    a finished Google import is part of the cache key like a Pipedrive one."""
    from datetime import date

    from app.google.models import (
        AdsCampaignDay,
        Ga4ChannelDay,
        Ga4KeyEventDay,
        GoogleImportRun,
        GscDay,
    )

    await seed(client)
    headers = {"x-dashboard-token": TOKEN}
    first = (await client.get("/v1/dashboard", headers=headers)).json()
    assert first["spend"] == [] and first["traffic"] == [] and first["search"] == {"months": [], "aiReferrals": []} and first["conversions"] == []
    async with client.app.state.sessionmaker() as s:
        s.add_all([
            AdsCampaignDay(date=date(2026, 10, 1), campaign_id=5, campaign_name="AWD - BOF - Search - Branded - UK", cost_micros=12_500_000, clicks=10, impressions=100, conversions=1.0, conversions_value=0.0, fetched_at=T),
            Ga4ChannelDay(date=date(2026, 10, 1), channel_group="Paid Search", sessions=40, fetched_at=T),
            Ga4KeyEventDay(date=date(2026, 10, 1), event_name="Contact Form", key_events=2, event_count=2, fetched_at=T),
            GscDay(date=date(2026, 10, 1), segment="brand", clicks=5, impressions=60, fetched_at=T),
            GscDay(date=date(2026, 10, 1), segment="total", clicks=15, impressions=200, fetched_at=T),
        ])
        await s.commit()
    assert (await client.get("/v1/dashboard", headers=headers)).json()["spend"] == []  # cached until an import finishes
    async with client.app.state.sessionmaker() as s:
        s.add(GoogleImportRun(started_at=T, finished_at=datetime(2026, 10, 8, 6, 0, 0, tzinfo=UTC), status="ok", window_start=date(2026, 9, 1), window_end=date(2026, 10, 7), counts={}))
        await s.commit()
    body = (await client.get("/v1/dashboard", headers=headers)).json()
    assert body["spend"] == [{"id": "gads-5-2026-10", "month": "2026-10", "platform": "google_ads", "campaign": "AWD - BOF - Search - Branded - UK", "amountGbp": 12.5}]
    assert body["traffic"] == [{"month": "2026-10", "channel": "Paid search", "sessions": 40}]
    assert body["search"]["months"][0]["brandImpressions"] == 60 and body["search"]["months"][0]["totalClicks"] == 15
    assert body["conversions"] == [{"month": "2026-10", "event": "enquiry", "count": 2}]
    assert body["syncedAt"] == "2026-10-07T13:47:29Z"  # still the Pipedrive import: the records' time, not the traffic's
    assert first["googleSyncedAt"] is None and body["googleSyncedAt"] == "2026-10-08T06:00:00Z"
    async with client.app.state.sessionmaker() as s:  # a later run with one source failed rebuilds the payload but does not move googleSyncedAt
        s.add(GoogleImportRun(started_at=T, finished_at=datetime(2026, 10, 9, 6, 0, 0, tzinfo=UTC), status="partial", window_start=date(2026, 9, 1), window_end=date(2026, 10, 8), counts={"google_ads": None, "ga4_channels": 3}, error="google_ads: HTTP 403"))
        await s.commit()
    again = (await client.get("/v1/dashboard", headers=headers)).json()
    assert again["googleSyncedAt"] == "2026-10-08T06:00:00Z"


@pytest.mark.settings(dashboard_token=TOKEN)
async def test_a_missing_table_is_a_503_naming_the_remedy_not_a_bare_500(client):
    """A database behind the code (a migration not applied) must say so."""
    from sqlalchemy import text

    await seed(client)
    async with client.app.state.engine.begin() as conn:
        await conn.execute(text("DROP TABLE google_import_runs"))
    r = await client.get("/v1/dashboard", headers={"x-dashboard-token": TOKEN})
    assert r.status_code == 503 and "alembic upgrade head" in r.json()["detail"]


EVENT = {"name": "UKREiiF 2026", "date": "2026-05-20", "type": "trade_show", "attendees": 120, "costGbp": 3400.5, "notes": "Leeds", "match": {"labels": ["lab-1"], "windowFrom": "2026-05-01", "windowTo": "2026-09-30"}}


@pytest.mark.settings(dashboard_token=TOKEN)
async def test_events_are_created_edited_listed_in_the_payload_and_deleted(client):
    await seed(client)
    h = {"x-dashboard-token": TOKEN}
    r = await client.post("/v1/dashboard/events", json=EVENT, headers=h)
    assert r.status_code == 201, r.text
    created = r.json()
    assert created["name"] == "UKREiiF 2026" and created["costGbp"] == 3400.5 and created["match"]["labels"] == ["lab-1"] and created["id"]
    # the payload carries it with its counts, and the cache noticed the write
    payload = (await client.get("/v1/dashboard", headers=h)).json()
    assert [e["name"] for e in payload["events"]] == ["UKREiiF 2026"]
    assert payload["events"][0]["leads"] == 0 and payload["events"][0]["qualified"] == 0 and payload["events"][0]["date"].startswith("2026-05-20")
    r = await client.put(f"/v1/dashboard/events/{created['id']}", json={**EVENT, "costGbp": 3600}, headers=h)
    assert r.status_code == 200 and r.json()["costGbp"] == 3600
    assert (await client.get("/v1/dashboard", headers=h)).json()["events"][0]["costGbp"] == 3600
    assert (await client.delete(f"/v1/dashboard/events/{created['id']}", headers=h)).status_code == 204
    assert (await client.get("/v1/dashboard", headers=h)).json()["events"] == []
    assert (await client.put(f"/v1/dashboard/events/{created['id']}", json=EVENT, headers=h)).status_code == 404


@pytest.mark.settings(dashboard_token=TOKEN)
async def test_event_writes_need_the_token_and_a_sane_body(client):
    await seed(client)
    assert (await client.post("/v1/dashboard/events", json=EVENT)).status_code == 401
    h = {"x-dashboard-token": TOKEN}
    for bad in ({**EVENT, "type": "party"}, {**EVENT, "costGbp": -1}, {**EVENT, "costGbp": 0}, {**EVENT, "name": ""}, {**EVENT, "match": {"labels": ["x"], "windowFrom": "2026-09-30", "windowTo": "2026-05-01"}}):
        assert (await client.post("/v1/dashboard/events", json=bad, headers=h)).status_code == 422, bad
    # the match lists are bounded: nobody needs 50 title words, and an unbounded list is a 2 MB row
    assert (await client.post("/v1/dashboard/events", json={**EVENT, "match": {**EVENT["match"], "titleWords": ["x"] * 51}}, headers=h)).status_code == 422
    assert (await client.post("/v1/dashboard/events", json={**EVENT, "match": {**EVENT["match"], "labels": ["x" * 101]}}, headers=h)).status_code == 422
    assert (await client.post("/v1/dashboard/events", json={**EVENT, "match": {**EVENT["match"], "titleWords": ["x"] * 50, "dealSources": ["y" * 100]}}, headers=h)).status_code == 201
    # no Pipedrive signal at all is fine: a CPD session with no trail simply counts no enquiries
    assert (await client.post("/v1/dashboard/events", json={**EVENT, "match": {"windowFrom": "2026-05-01", "windowTo": "2026-09-30"}}, headers=h)).status_code == 201
    # cost and attendees are optional: an event can be logged before Vix has the figures
    r = await client.post("/v1/dashboard/events", json={k: v for k, v in EVENT.items() if k not in ("costGbp", "attendees", "notes")}, headers=h)
    assert r.status_code == 201 and r.json()["costGbp"] is None and r.json()["attendees"] is None
