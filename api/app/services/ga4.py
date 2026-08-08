from typing import Any

import httpx

MP_ENDPOINT = "https://www.google-analytics.com/mp/collect"


async def send_server_event(
    *,
    measurement_id: str,
    api_secret: str,
    client_id: str | None,
    session_id: str | None,
    event_name: str,
    params: dict[str, Any],
) -> bool:
    """Send a GA4 Measurement Protocol event. Best-effort: analytics must never
    break lead capture, so failures return False rather than raising.

    Without the browser's client_id the event can't join a session — skip it.
    """
    if not client_id:
        return False
    event_params: dict[str, Any] = {**params, "engagement_time_msec": 100}
    if session_id:
        event_params["session_id"] = session_id
    payload = {
        "client_id": client_id,
        "events": [{"name": event_name, "params": event_params}],
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                MP_ENDPOINT,
                params={"measurement_id": measurement_id, "api_secret": api_secret},
                json=payload,
            )
        return True
    except httpx.HTTPError:
        return False
