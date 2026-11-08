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
                              "status": "open", "sourceLabel": None, "campaign": None, "personId": None}]
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
