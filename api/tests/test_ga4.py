import json

import httpx
import respx

from app.services.ga4 import send_server_event


@respx.mock
async def test_sends_measurement_protocol_event():
    route = respx.post("https://www.google-analytics.com/mp/collect").mock(
        return_value=httpx.Response(204)
    )
    sent = await send_server_event(
        measurement_id="G-TEST",
        api_secret="sec",
        client_id="123.456",
        session_id="789",
        event_name="generate_lead_server",
        params={"lead_source": "website_form"},
    )
    assert sent is True
    req = route.calls.last.request
    assert req.url.params["measurement_id"] == "G-TEST"
    assert req.url.params["api_secret"] == "sec"
    body = json.loads(req.content)
    assert body["client_id"] == "123.456"
    event = body["events"][0]
    assert event["name"] == "generate_lead_server"
    assert event["params"]["session_id"] == "789"
    assert event["params"]["engagement_time_msec"] == 100
    assert event["params"]["lead_source"] == "website_form"


@respx.mock
async def test_no_client_id_means_no_send():
    route = respx.post("https://www.google-analytics.com/mp/collect").mock(
        return_value=httpx.Response(204)
    )
    sent = await send_server_event(
        measurement_id="G-TEST",
        api_secret="sec",
        client_id=None,
        session_id=None,
        event_name="generate_lead_server",
        params={},
    )
    assert sent is False
    assert not route.called


@respx.mock
async def test_network_error_is_swallowed():
    respx.post("https://www.google-analytics.com/mp/collect").mock(
        side_effect=httpx.ConnectError("boom")
    )
    sent = await send_server_event(
        measurement_id="G-TEST",
        api_secret="sec",
        client_id="1.2",
        session_id=None,
        event_name="generate_lead_server",
        params={},
    )
    assert sent is False
