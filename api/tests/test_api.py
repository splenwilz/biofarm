import httpx
import pytest
import respx
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.main import create_app
from app.models import Lead
from tests.conftest import make_settings

BASE = "https://biofarm.pipedrive.com"

CONTACT_PAYLOAD = {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "phone": "+44 1234 567890",
    "fields": ["developer"],
    "message": "Tell me about BNG units",
    "newsletter_opt_in": True,
    "page": "/contact",
    "attribution": {"utm_source": "newsletter", "utm_medium": "email"},
    "ga_client_id": "123.456",
    "ga_session_id": "789",
}


def mock_pipedrive_happy_path():
    respx.get(f"{BASE}/api/v2/persons/search").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {"items": []}})
    )
    respx.post(f"{BASE}/api/v2/persons").mock(
        return_value=httpx.Response(201, json={"success": True, "data": {"id": 7}})
    )
    respx.post(f"{BASE}/api/v1/leads").mock(
        return_value=httpx.Response(201, json={"success": True, "data": {"id": "lead-uuid-1"}})
    )
    respx.post(f"{BASE}/api/v1/notes").mock(
        return_value=httpx.Response(201, json={"success": True, "data": {"id": 5}})
    )


async def get_single_lead(client) -> Lead:
    async with client.app.state.sessionmaker() as session:
        result = await session.execute(select(Lead))
        leads = result.scalars().all()
        assert len(leads) == 1
        return leads[0]


async def test_healthz(client):
    r = await client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


@respx.mock
async def test_contact_accepted_and_synced(client):
    mock_pipedrive_happy_path()
    r = await client.post(
        "/v1/leads/contact", json=CONTACT_PAYLOAD, headers={"user-agent": "TestUA"}
    )
    assert r.status_code == 202
    body = r.json()
    assert body["status"] == "accepted"

    lead = await get_single_lead(client)
    assert lead.form == "contact"
    assert lead.email == "jane@example.com"
    assert lead.attribution == {"utm_source": "newsletter", "utm_medium": "email"}
    assert lead.newsletter_opt_in is True
    assert lead.user_agent == "TestUA"
    assert lead.sync_status == "synced"
    assert lead.pipedrive_person_id == 7
    assert lead.pipedrive_lead_id == "lead-uuid-1"


@respx.mock
async def test_spam_gets_202_but_never_syncs(client):
    mock_pipedrive_happy_path()
    payload = dict(CONTACT_PAYLOAD, website="https://spam.example")
    r = await client.post("/v1/leads/contact", json=payload)
    assert r.status_code == 202  # do not tip off bots

    lead = await get_single_lead(client)
    assert lead.spam_flagged is True
    assert lead.sync_status == "skipped_spam"
    assert not respx.calls  # no Pipedrive traffic at all


@respx.mock
async def test_sync_failure_is_recorded_not_lost(client):
    respx.get(f"{BASE}/api/v2/persons/search").mock(
        return_value=httpx.Response(500, json={"success": False})
    )
    r = await client.post("/v1/leads/contact", json=CONTACT_PAYLOAD)
    assert r.status_code == 202  # the lead is safe in our DB regardless

    lead = await get_single_lead(client)
    assert lead.sync_status == "failed"
    assert lead.sync_error


async def test_pipedrive_disabled_still_stores(tmp_path):
    settings = make_settings(tmp_path, pipedrive_company_domain="", pipedrive_api_token="")
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            ac.app = app
            r = await ac.post("/v1/leads/contact", json=CONTACT_PAYLOAD)
            assert r.status_code == 202
            lead = await get_single_lead(ac)
            assert lead.sync_status == "disabled"


@respx.mock
async def test_newsletter_endpoint(client):
    mock_pipedrive_happy_path()
    r = await client.post(
        "/v1/leads/newsletter",
        json={"name": "Jane", "email": "jane@example.com", "field": "landowner"},
    )
    assert r.status_code == 202
    lead = await get_single_lead(client)
    assert lead.form == "newsletter"
    assert lead.fields == ["landowner"]
    # newsletter signup implies consent to marketing
    assert lead.newsletter_opt_in is True


async def test_validation_error_is_422(client):
    r = await client.post("/v1/leads/contact", json={"name": "J", "email": "nope"})
    assert r.status_code == 422


async def test_cors_preflight_allows_site_origin(client):
    r = await client.options(
        "/v1/leads/contact",
        headers={
            "Origin": "https://www.biofarm.co.uk",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "https://www.biofarm.co.uk"


async def test_cors_rejects_unknown_origin(client):
    r = await client.options(
        "/v1/leads/contact",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert "access-control-allow-origin" not in r.headers


async def test_rate_limit_keys_on_true_client_ip(tmp_path):
    # Render/Cloudflare set True-Client-IP at the edge; distinct clients behind
    # the same proxy hop must get separate rate-limit buckets.
    settings = make_settings(tmp_path, rate_limit="1/minute")
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            payload = {"name": "J", "email": "j@e.com"}
            r1 = await ac.post(
                "/v1/leads/newsletter", json=payload,
                headers={"true-client-ip": "203.0.113.1"},
            )
            r2 = await ac.post(
                "/v1/leads/newsletter", json=payload,
                headers={"true-client-ip": "203.0.113.2"},
            )
            r3 = await ac.post(
                "/v1/leads/newsletter", json=payload,
                headers={"true-client-ip": "203.0.113.1"},
            )
            assert r1.status_code == 202
            assert r2.status_code == 202  # different client, own bucket
            assert r3.status_code == 429  # same client, bucket exhausted


async def test_garbage_true_client_ip_falls_back_safely(client):
    # A junk header value must not 500 the insert (varchar 64) or mint
    # arbitrary rate-limit buckets — it falls back to the socket address.
    r = await client.post(
        "/v1/leads/newsletter",
        json={"name": "J", "email": "j@e.com"},
        headers={"true-client-ip": "x" * 200},
    )
    assert r.status_code == 202
    lead = await get_single_lead(client)
    assert lead.client_ip == "127.0.0.1"  # ASGITransport's socket address


async def test_rate_limit_kicks_in(tmp_path):
    settings = make_settings(tmp_path, rate_limit="2/minute")
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            payload = {"name": "J", "email": "j@e.com"}
            codes = []
            for _ in range(3):
                r = await ac.post("/v1/leads/newsletter", json=payload)
                codes.append(r.status_code)
            assert codes[-1] == 429


async def test_oversized_body_rejected_413(client):
    huge = dict(CONTACT_PAYLOAD, message="x" * 100_000)
    r = await client.post("/v1/leads/contact", json=huge)
    assert r.status_code == 413


async def test_production_refuses_default_dev_database(tmp_path):
    settings = make_settings(tmp_path, environment="production")
    settings.database_url = "sqlite+aiosqlite:///./dev.db"  # the unset default
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        create_app(settings)


async def test_production_allows_explicit_sqlite_on_disk(tmp_path):
    # SQLite on Render's persistent disk is a supported production setup
    settings = make_settings(tmp_path, environment="production")
    assert create_app(settings) is not None


@respx.mock
async def test_ga4_server_event_fires_when_configured(tmp_path):
    settings = make_settings(tmp_path, ga4_measurement_id="G-TEST", ga4_api_secret="sec")
    app = create_app(settings)
    mock_pipedrive_happy_path()
    ga4_route = respx.post("https://www.google-analytics.com/mp/collect").mock(
        return_value=httpx.Response(204)
    )
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post("/v1/leads/contact", json=CONTACT_PAYLOAD)
            assert r.status_code == 202
    assert ga4_route.called
