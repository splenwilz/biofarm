"""The GET-only Pipedrive reader: paging, rate limits, retries, and no token leaks."""

import logging

import httpx
import pytest
import respx

from app.mirror.reader import MirrorError, PipedriveReader

BASE = "https://biofarm.pipedrive.com"
TOKEN = "tok-secret-123"


@pytest.fixture
def sleeps(monkeypatch):
    """Record the reader's sleeps instead of waiting."""
    calls: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        calls.append(seconds)

    monkeypatch.setattr("app.mirror.reader.asyncio.sleep", fake_sleep)
    return calls


@pytest.fixture
async def reader():
    async with PipedriveReader(company_domain="biofarm", api_token=TOKEN) as r:
        yield r


def page(items, next_cursor=None):
    return {"success": True, "data": items, "additional_data": {"next_cursor": next_cursor}}


def test_reader_cannot_write():
    """Read-only by construction: the class exposes no method that could change Pipedrive."""
    names = {n for n in dir(PipedriveReader) if not n.startswith("_")}
    for forbidden in ("post", "put", "patch", "delete", "request"):
        assert forbidden not in names
    assert names <= {"get", "pages", "offset_pages", "aclose"}


@respx.mock
async def test_get_sends_token_in_header_only(reader):
    route = respx.get(f"{BASE}/api/v2/pipelines").mock(return_value=httpx.Response(200, json=page([{"id": 1}])))
    body = await reader.get("/api/v2/pipelines")
    assert body["data"] == [{"id": 1}]
    req = route.calls.last.request
    assert req.headers["x-api-token"] == TOKEN
    assert "api_token" not in dict(req.url.params)


@respx.mock
async def test_pages_follow_next_cursor_to_the_end(reader):
    route = respx.get(f"{BASE}/api/v2/deals")
    route.side_effect = [
        httpx.Response(200, json=page([{"id": 1}, {"id": 2}], next_cursor="c2")),
        httpx.Response(200, json=page([{"id": 3}], next_cursor=None)),
    ]
    items = [d async for d in reader.pages("/api/v2/deals", {"status": "open"})]
    assert [d["id"] for d in items] == [1, 2, 3]
    first, second = route.calls[0].request, route.calls[1].request
    assert first.url.params["limit"] == "500"
    assert first.url.params["status"] == "open"
    assert "cursor" not in dict(first.url.params)
    assert second.url.params["cursor"] == "c2"
    assert second.url.params["status"] == "open"


@respx.mock
async def test_offset_pages_follow_v1_start_until_no_more_items(reader):
    """v1 lists (leads, person flow) page by start/limit, not cursor."""
    route = respx.get(f"{BASE}/api/v1/leads")
    route.side_effect = [
        httpx.Response(200, json={"success": True, "data": [{"id": "a"}, {"id": "b"}], "additional_data": {"pagination": {"start": 0, "limit": 2, "more_items_in_collection": True, "next_start": 2}}}),
        httpx.Response(200, json={"success": True, "data": [{"id": "c"}], "additional_data": {"pagination": {"start": 2, "limit": 2, "more_items_in_collection": False}}}),
    ]
    items = [d async for d in reader.offset_pages("/api/v1/leads", {"archived_status": "not_archived"}, limit=2)]
    assert [d["id"] for d in items] == ["a", "b", "c"]
    first, second = route.calls[0].request, route.calls[1].request
    assert first.url.params["limit"] == "2" and first.url.params["start"] == "0" and first.url.params["archived_status"] == "not_archived"
    assert second.url.params["start"] == "2"


@respx.mock
async def test_offset_pages_stop_on_an_empty_page_without_pagination_data(reader):
    route = respx.get(f"{BASE}/api/v1/persons/5/flow")
    route.side_effect = [httpx.Response(200, json={"success": True, "data": None})]
    assert [d async for d in reader.offset_pages("/api/v1/persons/5/flow")] == []
    assert route.call_count == 1


@respx.mock
async def test_429_waits_for_the_reset_header_then_retries(reader, sleeps):
    route = respx.get(f"{BASE}/api/v2/stages")
    route.side_effect = [
        httpx.Response(429, headers={"x-ratelimit-reset": "2"}, json={"success": False, "error": "rate limit"}),
        httpx.Response(200, json=page([{"id": 6}])),
    ]
    body = await reader.get("/api/v2/stages")
    assert body["data"] == [{"id": 6}]
    assert route.call_count == 2
    assert sleeps == [2.0]


@respx.mock
async def test_429_without_a_usable_header_backs_off(reader, sleeps):
    route = respx.get(f"{BASE}/api/v2/stages")
    route.side_effect = [
        httpx.Response(429, headers={"x-ratelimit-reset": "soon"}),
        httpx.Response(200, json=page([])),
    ]
    await reader.get("/api/v2/stages")
    assert len(sleeps) == 1 and sleeps[0] > 0


@respx.mock
async def test_low_remaining_budget_pauses_before_the_next_call(reader, sleeps):
    route = respx.get(f"{BASE}/api/v2/stages")
    route.side_effect = [
        httpx.Response(200, headers={"x-ratelimit-remaining": "1", "x-ratelimit-reset": "1"}, json=page([])),
        httpx.Response(200, headers={"x-ratelimit-remaining": "39"}, json=page([])),
    ]
    await reader.get("/api/v2/stages")
    await reader.get("/api/v2/stages")
    assert sleeps == [1.0]


@respx.mock
async def test_server_errors_are_retried_with_backoff_then_fail(reader, sleeps):
    route = respx.get(f"{BASE}/api/v2/persons").mock(return_value=httpx.Response(503))
    with pytest.raises(MirrorError, match="503"):
        await reader.get("/api/v2/persons")
    assert route.call_count == 5
    assert len(sleeps) == 4
    assert sleeps == sorted(sleeps)  # growing backoff


@respx.mock
async def test_transport_errors_are_retried(reader, sleeps):
    route = respx.get(f"{BASE}/api/v2/persons")
    route.side_effect = [httpx.ReadError("boom"), httpx.Response(200, json=page([{"id": 9}]))]
    body = await reader.get("/api/v2/persons")
    assert body["data"] == [{"id": 9}]
    assert route.call_count == 2


@respx.mock
async def test_other_client_errors_fail_at_once(reader, sleeps):
    route = respx.get(f"{BASE}/api/v2/persons").mock(return_value=httpx.Response(401, json={"success": False, "error": "unauthorized"}))
    with pytest.raises(MirrorError, match="401"):
        await reader.get("/api/v2/persons")
    assert route.call_count == 1
    assert sleeps == []


@respx.mock
async def test_unsuccessful_body_is_an_error(reader):
    respx.get(f"{BASE}/api/v2/persons").mock(return_value=httpx.Response(200, json={"success": False, "error": "nope"}))
    with pytest.raises(MirrorError, match="nope"):
        await reader.get("/api/v2/persons")


@respx.mock
async def test_token_never_appears_in_logs_or_errors(reader, caplog):
    caplog.set_level(logging.DEBUG)
    respx.get(f"{BASE}/api/v2/persons").mock(return_value=httpx.Response(401, json={"success": False, "error": f"bad token {TOKEN}"}))
    with pytest.raises(MirrorError) as exc:
        await reader.get("/api/v2/persons")
    assert TOKEN not in str(exc.value)
    assert TOKEN not in repr(exc.value)
    assert TOKEN not in caplog.text
    assert TOKEN not in repr(reader)
