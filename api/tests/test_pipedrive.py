import json

import httpx
import pytest
import respx

from app.services.pipedrive import PipedriveClient, PipedriveError

BASE = "https://biofarm.pipedrive.com"


@pytest.fixture
def pd():
    return PipedriveClient(company_domain="biofarm", api_token="tok-123")


@respx.mock
async def test_find_person_by_email_found(pd):
    route = respx.get(f"{BASE}/api/v2/persons/search").mock(
        return_value=httpx.Response(
            200,
            json={"success": True, "data": {"items": [{"result_score": 1, "item": {"id": 42, "name": "Jane"}}]}},
        )
    )
    person_id = await pd.find_person_by_email("jane@example.com")
    assert person_id == 42
    req = route.calls.last.request
    assert req.url.params["term"] == "jane@example.com"
    assert req.url.params["fields"] == "email"
    assert req.url.params["exact_match"] == "true"
    assert req.headers["x-api-token"] == "tok-123"
    # token must never leak into the query string
    assert "api_token" not in dict(req.url.params)


@respx.mock
async def test_find_person_by_email_not_found(pd):
    respx.get(f"{BASE}/api/v2/persons/search").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {"items": []}})
    )
    assert await pd.find_person_by_email("nobody@example.com") is None


@respx.mock
async def test_create_person_payload_shape(pd):
    route = respx.post(f"{BASE}/api/v2/persons").mock(
        return_value=httpx.Response(201, json={"success": True, "data": {"id": 7}})
    )
    person_id = await pd.create_person(
        name="Jane", email="jane@example.com", phone="+44123", marketing_status="subscribed"
    )
    assert person_id == 7
    body = json.loads(route.calls.last.request.content)
    assert body["name"] == "Jane"
    assert body["emails"] == [{"value": "jane@example.com", "primary": True, "label": "work"}]
    assert body["phones"] == [{"value": "+44123", "primary": True, "label": "work"}]
    assert body["marketing_status"] == "subscribed"


@respx.mock
async def test_create_person_omits_optional_fields(pd):
    route = respx.post(f"{BASE}/api/v2/persons").mock(
        return_value=httpx.Response(201, json={"success": True, "data": {"id": 8}})
    )
    await pd.create_person(name="Jane", email="jane@example.com")
    body = json.loads(route.calls.last.request.content)
    assert "phones" not in body
    assert "marketing_status" not in body


@respx.mock
async def test_update_person_uses_patch(pd):
    route = respx.patch(f"{BASE}/api/v2/persons/42").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {"id": 42}})
    )
    await pd.update_person(42, marketing_status="subscribed")
    assert route.called
    body = json.loads(route.calls.last.request.content)
    assert body == {"marketing_status": "subscribed"}


@respx.mock
async def test_create_lead_v1_with_root_level_custom_fields(pd):
    route = respx.post(f"{BASE}/api/v1/leads").mock(
        return_value=httpx.Response(
            201, json={"success": True, "data": {"id": "adf21080-0e10-11eb-879b-05d71fb426ec"}}
        )
    )
    lead_id = await pd.create_lead(
        title="Website enquiry — Jane",
        person_id=42,
        custom_fields={"40charhash": "newsletter"},
    )
    assert lead_id == "adf21080-0e10-11eb-879b-05d71fb426ec"
    body = json.loads(route.calls.last.request.content)
    assert body["title"] == "Website enquiry — Jane"
    assert body["person_id"] == 42
    # leads are v1: custom field keys sit at the ROOT of the body, not nested
    assert body["40charhash"] == "newsletter"
    assert "custom_fields" not in body


@respx.mock
async def test_create_note_pinned_to_lead(pd):
    route = respx.post(f"{BASE}/api/v1/notes").mock(
        return_value=httpx.Response(201, json={"success": True, "data": {"id": 5}})
    )
    await pd.create_note(content="<p>hi</p>", lead_id="uuid-1")
    body = json.loads(route.calls.last.request.content)
    assert body["content"] == "<p>hi</p>"
    assert body["lead_id"] == "uuid-1"
    assert body["pinned_to_lead_flag"] == 1


@respx.mock
async def test_retries_on_429_then_succeeds(pd):
    route = respx.get(f"{BASE}/api/v2/persons/search").mock(
        side_effect=[
            httpx.Response(429, headers={"x-ratelimit-reset": "0"}),
            httpx.Response(200, json={"success": True, "data": {"items": []}}),
        ]
    )
    assert await pd.find_person_by_email("j@e.com") is None
    assert route.call_count == 2


@respx.mock
async def test_gives_up_after_retries_exhausted(pd):
    route = respx.get(f"{BASE}/api/v2/persons/search").mock(
        return_value=httpx.Response(429, headers={"x-ratelimit-reset": "0"})
    )
    with pytest.raises(PipedriveError):
        await pd.find_person_by_email("j@e.com")
    assert route.call_count == 3  # initial attempt + max_retries (2)


@respx.mock
async def test_malformed_ratelimit_reset_falls_back_to_backoff(monkeypatch):
    sleeps = []

    async def fake_sleep(delay):
        sleeps.append(delay)

    monkeypatch.setattr("app.services.pipedrive.asyncio.sleep", fake_sleep)
    client = PipedriveClient(company_domain="biofarm", api_token="t", max_retries=1)
    route = respx.get(f"{BASE}/api/v2/persons/search").mock(
        side_effect=[
            httpx.Response(429, headers={"x-ratelimit-reset": "soon"}),
            httpx.Response(200, json={"success": True, "data": {"items": []}}),
        ]
    )
    assert await client.find_person_by_email("j@e.com") is None
    assert route.call_count == 2
    assert sleeps == [0.5]  # exponential fallback for attempt 0, not the header


@respx.mock
async def test_client_error_raises_without_retry(pd):
    route = respx.post(f"{BASE}/api/v1/leads").mock(
        return_value=httpx.Response(400, json={"success": False, "error": "bad"})
    )
    with pytest.raises(PipedriveError):
        await pd.create_lead(title="t", person_id=1)
    assert route.call_count == 1
