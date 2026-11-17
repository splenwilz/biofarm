"""One POST helper for the three Google APIs: bearer token, one retry after a
401 (fresh token) and one after a 429 or 5xx (short pause), anything else
raised as GoogleApiError with the status and the API's own message."""

import asyncio
import logging
from typing import Any

import httpx

from app.google.auth import GoogleToken

logger = logging.getLogger("app.google")

RETRY_STATUSES = {429, 500, 502, 503, 504}


class GoogleApiError(Exception):
    def __init__(self, status: int, detail: str, *, source: str) -> None:
        super().__init__(f"{source}: HTTP {status}: {detail}")
        self.status, self.detail, self.source = status, detail, source


async def post_json(http: httpx.AsyncClient, token: GoogleToken, url: str, body: dict[str, Any], *, source: str, retry_sleep: float = 2.0, timeout: float = 60.0) -> Any:
    """The parsed JSON, or GoogleApiError. A timeout or refused connection is
    reported the same way, with status 0, so callers deal with one error type."""
    try:
        response = await _post(http, token, url, body, timeout=timeout)
        if response.status_code == 401:
            logger.info("%s: 401, refreshing the access token and retrying once", source)
            response = await _post(http, token, url, body, timeout=timeout, force_token=True)
        elif response.status_code in RETRY_STATUSES:
            logger.warning("%s: HTTP %d, retrying once in %.0f s", source, response.status_code, retry_sleep)
            await asyncio.sleep(retry_sleep)
            response = await _post(http, token, url, body, timeout=timeout)
    except httpx.HTTPError as exc:
        raise GoogleApiError(0, f"{type(exc).__name__}: {exc}"[:300], source=source) from exc
    if response.status_code != 200:
        raise GoogleApiError(response.status_code, api_message(response), source=source)
    return response.json()


async def _post(http: httpx.AsyncClient, token: GoogleToken, url: str, body: dict[str, Any], *, timeout: float, force_token: bool = False) -> httpx.Response:
    headers = {**await token.headers(force=force_token), "Accept": "application/json"}
    return await http.post(url, json=body, headers=headers, timeout=timeout)


def api_message(response: httpx.Response) -> str:
    """Google's errors all carry {"error": {"message": ...}}; the Ads
    searchStream wraps that in a list."""
    try:
        body = response.json()
    except ValueError:
        return response.text[:300]
    if isinstance(body, list) and body:
        body = body[0]
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict):
            return str(error.get("message") or error.get("status") or error)[:300]
        if error is not None:
            return str(error)[:300]
    return str(body)[:300]
