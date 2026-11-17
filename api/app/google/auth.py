"""The refresh token from scripts/google_auth.py, exchanged for the hour-long
access tokens the APIs accept (OAuth 2.0 for installed apps, offline access:
https://developers.google.com/identity/protocols/oauth2/native-app#offline).
One exchange per hour per process; a 401 from any API forces a fresh one."""

import logging
import time
from collections.abc import Callable

import httpx

logger = logging.getLogger("app.google")

TOKEN_URL = "https://oauth2.googleapis.com/token"
# Hand out a token only while it has at least this long left: a request that
# starts with 5 s to live would fail mid-flight.
EXPIRY_MARGIN_SECONDS = 60.0


class GoogleAuthError(Exception):
    """The refresh token could not be exchanged (revoked, wrong client, network).
    The message never carries the secrets."""


class GoogleToken:
    def __init__(self, http: httpx.AsyncClient, *, client_id: str, client_secret: str, refresh_token: str, now: Callable[[], float] = time.monotonic) -> None:
        self._http = http
        self._client_id, self._client_secret, self._refresh_token = client_id, client_secret, refresh_token
        self._now = now
        self._token: str | None = None
        self._expires_at = 0.0

    async def access_token(self, *, force: bool = False) -> str:
        if not force and self._token and self._now() < self._expires_at - EXPIRY_MARGIN_SECONDS:
            return self._token
        form = {"grant_type": "refresh_token", "client_id": self._client_id, "client_secret": self._client_secret, "refresh_token": self._refresh_token}
        try:
            response = await self._http.post(TOKEN_URL, data=form, timeout=20.0)
        except httpx.HTTPError as exc:
            raise GoogleAuthError(f"token exchange failed: {type(exc).__name__}") from exc
        if response.status_code != 200:
            detail = _error_detail(response)
            raise GoogleAuthError(f"token exchange refused ({response.status_code}): {detail}")
        body = response.json()
        token = body.get("access_token")
        if not isinstance(token, str) or not token:
            raise GoogleAuthError("token exchange returned no access_token")
        self._token = token
        self._expires_at = self._now() + float(body.get("expires_in") or 3600)
        return token

    async def headers(self, *, force: bool = False) -> dict[str, str]:
        return {"Authorization": f"Bearer {await self.access_token(force=force)}"}


def _error_detail(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return response.text[:200]
    if isinstance(body, dict):
        return " ".join(str(body[k]) for k in ("error", "error_description") if k in body)[:300]
    return str(body)[:200]
