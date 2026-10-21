import json

import httpx
import pytest
import respx
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy import text as sqltext

from app.config import Settings
from app.main import create_app
from app.schemas import LEAD_FORMS
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
    """Mock the full sync flow. Returns the routes: re-registering a pattern
    via respx.post(...) RESETS its mock, so tests must use these handles."""
    return {
        "search": respx.get(f"{BASE}/api/v2/persons/search").mock(
            return_value=httpx.Response(200, json={"success": True, "data": {"items": []}})
        ),
        "person": respx.post(f"{BASE}/api/v2/persons").mock(
            return_value=httpx.Response(201, json={"success": True, "data": {"id": 7}})
        ),
        "lead": respx.post(f"{BASE}/api/v1/leads").mock(
            return_value=httpx.Response(
                201, json={"success": True, "data": {"id": "lead-uuid-1"}}
            )
        ),
        "note": respx.post(f"{BASE}/api/v1/notes").mock(
            return_value=httpx.Response(201, json={"success": True, "data": {"id": 5}})
        ),
    }


async def get_single_lead(client) -> Lead:
    async with client.app.state.sessionmaker() as session:
        result = await session.execute(select(Lead))
        leads = result.scalars().all()
        assert len(leads) == 1
        return leads[0]


async def test_sqlite_engine_uses_wal_and_busy_timeout(client):
    async with client.app.state.sessionmaker() as session:
        assert (await session.execute(sqltext("PRAGMA journal_mode"))).scalar() == "wal"
        assert (await session.execute(sqltext("PRAGMA busy_timeout"))).scalar() == 5000


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


@respx.mock
async def test_cpd_endpoint(client):
    mock_pipedrive_happy_path()
    r = await client.post(
        "/v1/leads/cpd",
        json={
            "name": "Jane",
            "email": "jane@example.com",
            "company": "Acme Homes",
            "role": "Planning Manager",
            "fields": ["other"],
            "team_size": "6-15",
            "message": "Viability and the off-site market",
            "page": "/bng-cpd",
        },
    )
    assert r.status_code == 202
    lead = await get_single_lead(client)
    assert lead.form == "cpd"
    assert lead.fields == ["other"]
    assert lead.newsletter_opt_in is False
    # company / role / team size fold into the message so they reach the note
    assert "Company: Acme Homes" in lead.message
    assert "Role: Planning Manager" in lead.message
    assert "Team size: 6-15" in lead.message
    assert "Viability and the off-site market" in lead.message
    assert lead.sync_status == "synced"


@respx.mock
async def test_cpd_without_fields_is_accepted_and_sets_no_client_type(client):
    """The CPD form dropped its field chips (8 Oct): no `fields` key at all must
    still be accepted, stored as [], and sync without a Client Type person field."""
    routes = mock_pipedrive_happy_path()
    r = await client.post(
        "/v1/leads/cpd",
        json={"name": "Jane", "email": "jane@example.com", "company": "Acme", "page": "/bng-cpd"},
    )
    assert r.status_code == 202
    lead = await get_single_lead(client)
    assert lead.fields == []
    assert lead.sync_status == "synced"
    person_body = json.loads(routes["person"].calls.last.request.content)
    assert "custom_fields" not in person_body


def test_note_html_keeps_line_breaks():
    from app.models import Lead
    from app.services.sync import build_note_html

    lead = Lead(form="cpd", name="Jane", email="jane@example.com",
                message="Company: Acme <Ltd>\nRole: PM", fields=[])
    note = build_note_html(lead)
    assert "Company: Acme &lt;Ltd&gt;<br>Role: PM" in note


async def test_cpd_rejects_bad_team_size(client):
    r = await client.post(
        "/v1/leads/cpd",
        json={"name": "Jane", "email": "jane@example.com", "company": "Acme", "team_size": "lots"},
    )
    assert r.status_code == 422


@respx.mock
async def test_fold_endpoint(client):
    mock_pipedrive_happy_path()
    r = await client.post(
        "/v1/leads/fold",
        json={
            "name": "Ed",
            "email": "ed@example.com",
            "habitat_bank": "Slades Farm",
            "location": "Waverley, Surrey",
            "units": "309",
            "message": "Registered since March.",
            "page": "/fold",
        },
    )
    assert r.status_code == 202
    lead = await get_single_lead(client)
    assert lead.form == "fold"
    assert lead.fields == ["landowner"]
    assert "Habitat bank: Slades Farm" in lead.message
    assert "Location: Waverley, Surrey" in lead.message
    assert "Registered units (approx.): 309" in lead.message
    assert "Registered since March." in lead.message
    assert lead.sync_status == "synced"


async def test_fold_requires_habitat_bank_and_location(client):
    r = await client.post("/v1/leads/fold", json={"name": "Ed", "email": "ed@example.com"})
    assert r.status_code == 422


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
    # arbitrary rate-limit buckets - it falls back to the socket address.
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


@pytest.mark.parametrize(
    "bad_url",
    [
        "sqlite+aiosqlite:///./dev.db",  # the unset default (relative)
        "sqlite+aiosqlite:///relative/leads.db",
        "sqlite+aiosqlite:///:memory:",
    ],
)
async def test_production_refuses_ephemeral_sqlite(tmp_path, bad_url):
    settings = make_settings(tmp_path, environment="production")
    settings.database_url = bad_url
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        create_app(settings)


async def test_production_allows_absolute_sqlite_on_disk(tmp_path):
    # SQLite at an absolute path (Render's persistent disk) is supported;
    # make_settings uses an absolute tmp path, mirroring /var/data/leads.db
    settings = make_settings(tmp_path, environment="production")
    assert create_app(settings) is not None


@respx.mock
async def test_labels_applied_globally_and_per_form(tmp_path):
    settings = make_settings(
        tmp_path,
        pipedrive_lead_label_ids=["website-uuid"],
        pipedrive_form_label_map={"newsletter": ["newsletter-uuid"]},
    )
    app = create_app(settings)
    routes = mock_pipedrive_happy_path()
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            ac.app = app
            r = await ac.post(
                "/v1/leads/newsletter",
                json={"name": "J", "email": "j@e.com", "field": "developer"},
            )
            assert r.status_code == 202
            lead = await get_single_lead(ac)
            assert lead.sync_status == "synced"

    body = json.loads(routes["lead"].calls.last.request.content)
    assert body["label_ids"] == ["website-uuid", "newsletter-uuid"]


@respx.mock
async def test_client_type_mapped_onto_new_person(tmp_path):
    settings = make_settings(
        tmp_path,
        pipedrive_client_type_field="clienttypehash",
        pipedrive_client_type_map={"developer": 531, "landowner": 530, "other": 1122},
    )
    app = create_app(settings)
    routes = mock_pipedrive_happy_path()
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            ac.app = app
            payload = dict(CONTACT_PAYLOAD, fields=["developer", "other"])
            r = await ac.post("/v1/leads/contact", json=payload)
            assert r.status_code == 202
            lead = await get_single_lead(ac)
            assert lead.sync_status == "synced"

    body = json.loads(routes["person"].calls.last.request.content)
    assert body["custom_fields"] == {"clienttypehash": [531, 1122]}


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


# ---- owner routing ---------------------------------------------------------

OWNER_MAP = {
    "contact:developer": 23328240,
    "contact:landowner": 27433044,
    "newsletter:landowner": 333,
    "cpd": 111,
    "fold": 222,
}
routed = pytest.mark.settings(pipedrive_owner_map=OWNER_MAP, pipedrive_owner_id=999)


def _owner_in(routes, key, call=-1):
    return json.loads(routes[key].calls[call].request.content).get("owner_id")


@routed
@respx.mock
async def test_contact_developer_routes_to_developer_owner_on_person_and_lead(client):
    routes = mock_pipedrive_happy_path()
    r = await client.post(
        "/v1/leads/contact",
        json={"name": "Dev", "email": "dev@example.com", "fields": ["developer"]},
    )
    assert r.status_code == 202
    lead = await get_single_lead(client)
    assert lead.sync_status == "synced"
    assert _owner_in(routes, "lead") == 23328240
    assert _owner_in(routes, "person") == 23328240


@routed
@respx.mock
async def test_contact_first_submitted_field_wins(client):
    routes = mock_pipedrive_happy_path()
    r = await client.post(
        "/v1/leads/contact",
        json={"name": "L", "email": "l@example.com", "fields": ["other", "landowner", "developer"]},
    )
    assert r.status_code == 202
    await get_single_lead(client)
    # "other" has no mapping, so the first mapped field (landowner) decides
    assert _owner_in(routes, "lead") == 27433044


@routed
@respx.mock
async def test_form_level_mapping_applies_to_cpd(client):
    routes = mock_pipedrive_happy_path()
    r = await client.post(
        "/v1/leads/cpd",
        json={"name": "Jane", "email": "jane@example.com", "company": "Acme"},
    )
    assert r.status_code == 202
    await get_single_lead(client)
    assert _owner_in(routes, "lead") == 111


@routed
@respx.mock
async def test_fold_form_mapping_beats_its_hardcoded_landowner_field(client):
    routes = mock_pipedrive_happy_path()
    r = await client.post(
        "/v1/leads/fold",
        json={"name": "F", "email": "f@example.com", "habitat_bank": "Oak Farm", "location": "Kent"},
    )
    assert r.status_code == 202
    await get_single_lead(client)
    # fold sets fields=["landowner"], but there is no "fold:landowner" key,
    # so the "fold" entry applies - not contact's landowner owner
    assert _owner_in(routes, "lead") == 222


@routed
@respx.mock
async def test_newsletter_routes_by_its_optional_field(client):
    routes = mock_pipedrive_happy_path()
    r = await client.post(
        "/v1/leads/newsletter",
        json={"name": "N", "email": "n@example.com", "field": "landowner"},
    )
    assert r.status_code == 202
    await get_single_lead(client)
    assert _owner_in(routes, "lead") == 333


@routed
@respx.mock
async def test_unmapped_form_falls_back_to_global_owner_on_person_and_lead(client):
    routes = mock_pipedrive_happy_path()
    r = await client.post(
        "/v1/leads/newsletter", json={"name": "N", "email": "n@example.com"}
    )
    assert r.status_code == 202
    await get_single_lead(client)
    assert _owner_in(routes, "lead") == 999
    assert _owner_in(routes, "person") == 999


@routed
@respx.mock
async def test_existing_person_keeps_its_owner(client):
    routes = mock_pipedrive_happy_path()
    routes["search"].mock(
        return_value=httpx.Response(
            200, json={"success": True, "data": {"items": [{"item": {"id": 4455}}]}}
        )
    )
    r = await client.post(
        "/v1/leads/contact",
        json={"name": "Dev", "email": "dev@example.com", "fields": ["developer"]},
    )
    assert r.status_code == 202
    await get_single_lead(client)
    assert not routes["person"].called  # no create, so no owner change
    assert _owner_in(routes, "lead") == 23328240


@respx.mock
async def test_no_owner_config_sends_no_owner_id(client):
    routes = mock_pipedrive_happy_path()
    r = await client.post(
        "/v1/leads/contact",
        json={"name": "Dev", "email": "dev@example.com", "fields": ["developer"]},
    )
    assert r.status_code == 202
    await get_single_lead(client)
    assert "owner_id" not in json.loads(routes["lead"].calls.last.request.content)
    assert "owner_id" not in json.loads(routes["person"].calls.last.request.content)


# ---- owner rejected by Pipedrive (deactivated user / wrong id) --------------

_OWNER_REJECTED = httpx.Response(
    400, json={"success": False, "error": "Owner not found"}
)


def _reject_owner_then_ok(ok: httpx.Response):
    """Side effect: 400 while the body carries owner_id, otherwise succeed."""

    def handler(request):
        if "owner_id" in json.loads(request.content):
            return _OWNER_REJECTED
        return ok

    return handler


@routed
@respx.mock
async def test_rejected_owner_on_lead_retries_without_owner(client, caplog):
    routes = mock_pipedrive_happy_path()
    routes["lead"].mock(
        side_effect=_reject_owner_then_ok(
            httpx.Response(201, json={"success": True, "data": {"id": "lead-uuid-1"}})
        )
    )
    r = await client.post(
        "/v1/leads/contact",
        json={"name": "Dev", "email": "dev@example.com", "fields": ["developer"]},
    )
    assert r.status_code == 202
    lead = await get_single_lead(client)
    assert lead.sync_status == "synced"
    assert lead.pipedrive_lead_id == "lead-uuid-1"
    assert routes["lead"].call_count == 2
    assert _owner_in(routes, "lead", 0) == 23328240
    assert _owner_in(routes, "lead", 1) is None
    assert routes["note"].called
    assert "owner 23328240" in caplog.text
    assert "Owner not found" in caplog.text
    # the row records what happened even though the sync succeeded
    assert lead.sync_error and "lead created without owner 23328240" in lead.sync_error


@routed
@respx.mock
async def test_rejected_owner_on_person_retries_without_owner(client):
    routes = mock_pipedrive_happy_path()
    routes["person"].mock(
        side_effect=_reject_owner_then_ok(
            httpx.Response(201, json={"success": True, "data": {"id": 7}})
        )
    )
    r = await client.post(
        "/v1/leads/contact",
        json={"name": "Dev", "email": "dev@example.com", "fields": ["developer"]},
    )
    assert r.status_code == 202
    lead = await get_single_lead(client)
    assert lead.sync_status == "synced"
    assert lead.pipedrive_person_id == 7
    assert routes["person"].call_count == 2
    assert _owner_in(routes, "person", 1) is None
    # the lead itself still goes to the routed owner
    assert _owner_in(routes, "lead") == 23328240
    assert lead.sync_error and "person created without owner" in lead.sync_error


@routed
@respx.mock
async def test_both_fallbacks_are_recorded_on_the_row(client):
    routes = mock_pipedrive_happy_path()
    routes["person"].mock(
        side_effect=_reject_owner_then_ok(
            httpx.Response(201, json={"success": True, "data": {"id": 7}})
        )
    )
    routes["lead"].mock(
        side_effect=_reject_owner_then_ok(
            httpx.Response(201, json={"success": True, "data": {"id": "lead-uuid-1"}})
        )
    )
    await client.post(
        "/v1/leads/contact",
        json={"name": "Dev", "email": "dev@example.com", "fields": ["developer"]},
    )
    lead = await get_single_lead(client)
    assert lead.sync_status == "synced"
    assert "person created without owner" in lead.sync_error
    assert "lead created without owner" in lead.sync_error


@routed
@respx.mock
@pytest.mark.parametrize("status", [401, 402, 404])
async def test_auth_billing_and_not_found_are_never_retried_without_owner(client, status):
    routes = mock_pipedrive_happy_path()
    routes["lead"].mock(return_value=httpx.Response(status, json={"success": False}))
    r = await client.post(
        "/v1/leads/contact",
        json={"name": "Dev", "email": "dev@example.com", "fields": ["developer"]},
    )
    assert r.status_code == 202
    lead = await get_single_lead(client)
    assert lead.sync_status == "failed"
    assert routes["lead"].call_count == 1


@routed
@respx.mock
async def test_forbidden_with_owner_is_retried_without_it(client):
    routes = mock_pipedrive_happy_path()

    def handler(request):
        if "owner_id" in json.loads(request.content):
            return httpx.Response(403, json={"success": False, "error": "Not permitted"})
        return httpx.Response(201, json={"success": True, "data": {"id": "lead-uuid-1"}})

    routes["lead"].mock(side_effect=handler)
    r = await client.post(
        "/v1/leads/contact",
        json={"name": "Dev", "email": "dev@example.com", "fields": ["developer"]},
    )
    assert r.status_code == 202
    lead = await get_single_lead(client)
    assert lead.sync_status == "synced"
    assert routes["lead"].call_count == 2


@routed
@respx.mock
async def test_later_failure_keeps_the_owner_fallback_note(client):
    routes = mock_pipedrive_happy_path()
    routes["person"].mock(
        side_effect=_reject_owner_then_ok(
            httpx.Response(201, json={"success": True, "data": {"id": 7}})
        )
    )
    routes["note"].mock(return_value=httpx.Response(500, json={"success": False}))
    await client.post(
        "/v1/leads/contact",
        json={"name": "Dev", "email": "dev@example.com", "fields": ["developer"]},
    )
    lead = await get_single_lead(client)
    assert lead.sync_status == "failed"
    assert "500" in lead.sync_error  # the failure comes first
    assert "person created without owner 23328240" in lead.sync_error  # the trace survives


@respx.mock
async def test_retrying_a_failed_lead_clears_the_old_error_on_success(client):
    routes = mock_pipedrive_happy_path()
    routes["lead"].mock(return_value=httpx.Response(500, json={"success": False}))
    await client.post(
        "/v1/leads/contact", json={"name": "Dev", "email": "dev@example.com"}
    )
    lead = await get_single_lead(client)
    assert lead.sync_status == "failed" and lead.sync_error
    # second attempt (what a retry sweep would do) now succeeds
    routes["lead"].mock(
        return_value=httpx.Response(201, json={"success": True, "data": {"id": "lead-uuid-1"}})
    )
    from app.services.sync import process_lead
    await process_lead(lead.id, client.app.state.sessionmaker, client.app.state.settings)
    lead = await get_single_lead(client)
    assert lead.sync_status == "synced"
    assert lead.sync_error is None
    # the person found/created in the first attempt was reused, not duplicated
    assert routes["person"].call_count == 1


@routed
@respx.mock
async def test_server_error_with_owner_is_not_retried_without_it(client):
    routes = mock_pipedrive_happy_path()
    routes["lead"].mock(return_value=httpx.Response(500, json={"success": False}))
    r = await client.post(
        "/v1/leads/contact",
        json={"name": "Dev", "email": "dev@example.com", "fields": ["developer"]},
    )
    assert r.status_code == 202
    lead = await get_single_lead(client)
    assert lead.sync_status == "failed"
    assert routes["lead"].call_count == 1


@respx.mock
async def test_client_error_without_owner_is_not_retried(client):
    routes = mock_pipedrive_happy_path()
    routes["lead"].mock(return_value=_OWNER_REJECTED)
    r = await client.post(
        "/v1/leads/contact",
        json={"name": "Dev", "email": "dev@example.com", "fields": ["developer"]},
    )
    assert r.status_code == 202
    lead = await get_single_lead(client)
    assert lead.sync_status == "failed"
    assert routes["lead"].call_count == 1


# ---- owner settings validation ---------------------------------------------


@pytest.mark.parametrize(
    "bad_map",
    [
        {"Contact:Developer": 1},  # case matters: field values are lower-case
        {"contact:developers": 1},  # typo in the field
        {"enquiry": 1},  # not a form
        {"contact:developer": 0},  # not a user id
        {"contact:developer": True},  # JSON true must not become user 1
        {"contact:developer": 111.0},  # floats aren't ids either
        {"contact:developer": "abc"},  # nor arbitrary strings
        {"contact:developer": "\u00b2"},  # passes str.isdigit() but int() refuses it
    ],
)
def test_owner_map_drops_unknown_keys_and_bad_ids_without_failing_boot(tmp_path, bad_map, caplog):
    # A typo in an optional routing setting must not take every form offline:
    # the entry is dropped with an error log and the service still boots.
    with caplog.at_level("ERROR", logger="app.config"):
        s = make_settings(tmp_path, pipedrive_owner_map=bad_map)
    assert s.pipedrive_owner_map == {}
    assert "BIOFARM_PIPEDRIVE_OWNER_MAP" in caplog.text


def test_owner_map_keeps_good_entries_next_to_bad_ones(tmp_path, caplog):
    with caplog.at_level("ERROR", logger="app.config"):
        s = make_settings(
            tmp_path, pipedrive_owner_map={"contact:developer": 5, "bogus": 6, "cpd": "7"}
        )
    assert s.pipedrive_owner_map == {"contact:developer": 5, "cpd": 7}
    assert "'bogus'" in caplog.text


def test_owner_map_accepts_every_form_and_field(tmp_path):
    s = make_settings(
        tmp_path,
        pipedrive_owner_map={
            "contact": 1, "newsletter": 2, "cpd": 3, "fold": 4,
            "contact:developer": 5, "newsletter:landowner": 6, "fold:other": 7,
        },
    )
    assert len(s.pipedrive_owner_map) == 7


@pytest.mark.parametrize("bad", [0, -5, True, 12.0, "abc", "\u00b2"])
def test_owner_id_bad_values_are_ignored_not_fatal(tmp_path, bad, caplog):
    with caplog.at_level("ERROR", logger="app.config"):
        s = make_settings(tmp_path, pipedrive_owner_id=bad)
    assert s.pipedrive_owner_id is None
    assert "BIOFARM_PIPEDRIVE_OWNER_ID" in caplog.text


def test_bad_owner_values_are_never_echoed_into_logs(tmp_path, caplog):
    # a secret pasted into the wrong variable must not be printed by the error
    with caplog.at_level("ERROR", logger="app.config"):
        make_settings(tmp_path, pipedrive_owner_id="sk-live-SECRET-TOKEN")
        make_settings(tmp_path, pipedrive_owner_map={"cpd": "sk-live-SECRET-TOKEN"})
    assert "SECRET" not in caplog.text
    assert "BIOFARM_PIPEDRIVE_OWNER_ID" in caplog.text


def test_owner_id_from_env_string(monkeypatch):
    # Render passes every variable as a string
    monkeypatch.setenv("BIOFARM_PIPEDRIVE_OWNER_ID", "23328240")
    assert Settings(_env_file=None).pipedrive_owner_id == 23328240


def test_owner_map_malformed_json_in_env_is_ignored(monkeypatch, caplog):
    monkeypatch.setenv("BIOFARM_PIPEDRIVE_OWNER_MAP", '{"contact:developer": 23328240,}')
    with caplog.at_level("ERROR", logger="app.config"):
        s = Settings(_env_file=None)
    assert s.pipedrive_owner_map == {}
    assert "not valid JSON" in caplog.text


@respx.mock
async def test_every_route_stores_a_known_form(client):
    """Guards the owner-map key validation: a new route must be added to
    LEAD_FORMS or its owner mapping is rejected at boot."""
    mock_pipedrive_happy_path()
    payloads = {
        "contact": {"name": "A", "email": "a@example.com"},
        "newsletter": {"name": "B", "email": "b@example.com"},
        "cpd": {"name": "C", "email": "c@example.com", "company": "Acme"},
        "fold": {"name": "D", "email": "d@example.com", "habitat_bank": "X", "location": "Y"},
    }
    for form, payload in payloads.items():
        r = await client.post(f"/v1/leads/{form}", json=payload)
        assert r.status_code == 202, form
    async with client.app.state.sessionmaker() as session:
        forms = {lead.form for lead in (await session.execute(select(Lead))).scalars()}
    assert forms == set(LEAD_FORMS)


def test_empty_env_values_mean_unset(monkeypatch):
    # Render lets you save a variable with an empty value; that must not
    # break the boot by parsing "" as JSON / int.
    monkeypatch.setenv("BIOFARM_PIPEDRIVE_OWNER_MAP", "")
    monkeypatch.setenv("BIOFARM_PIPEDRIVE_OWNER_ID", "")
    monkeypatch.setenv("BIOFARM_PIPEDRIVE_LEAD_LABEL_IDS", "")
    s = Settings(_env_file=None)
    assert s.pipedrive_owner_map == {}
    assert s.pipedrive_owner_id is None
    assert s.pipedrive_lead_label_ids == []


def test_env_json_owner_map_parses(monkeypatch):
    monkeypatch.setenv(
        "BIOFARM_PIPEDRIVE_OWNER_MAP", '{"contact:developer": 23328240, "cpd": 111}'
    )
    s = Settings(_env_file=None)
    assert s.pipedrive_owner_map == {"contact:developer": 23328240, "cpd": 111}
