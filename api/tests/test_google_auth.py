"""Exchanging the one-time refresh token for the hour-long access tokens the
three Google APIs want (https://developers.google.com/identity/protocols/oauth2/web-server#offline)."""

import httpx
import pytest
import respx

from app.google.auth import TOKEN_URL, GoogleAuthError, GoogleToken

CREDS = dict(client_id="cid.apps.googleusercontent.com", client_secret="shh-secret", refresh_token="1//refresh-xyz")


def token_source(clock: list[float]) -> tuple[GoogleToken, httpx.AsyncClient]:
    http = httpx.AsyncClient()
    return GoogleToken(http, **CREDS, now=lambda: clock[0]), http


@respx.mock
async def test_exchanges_the_refresh_token_once_and_reuses_the_access_token_until_it_nears_expiry():
    route = respx.post(TOKEN_URL).mock(return_value=httpx.Response(200, json={"access_token": "ya29.first", "expires_in": 3600, "token_type": "Bearer"}))
    clock = [1000.0]
    token, http = token_source(clock)
    async with http:
        assert await token.access_token() == "ya29.first"
        assert await token.access_token() == "ya29.first"
        assert route.call_count == 1
        sent = route.calls[0].request
        assert sent.headers["content-type"].startswith("application/x-www-form-urlencoded")
        form = dict(httpx.QueryParams(sent.content.decode()))
        assert form == {"grant_type": "refresh_token", **CREDS}
        clock[0] += 3600 - 30  # inside the safety margin: a token about to expire is not handed out
        route.mock(return_value=httpx.Response(200, json={"access_token": "ya29.second", "expires_in": 3600}))
        assert await token.access_token() == "ya29.second"
        assert route.call_count == 2
        assert await token.headers() == {"Authorization": "Bearer ya29.second"}


@respx.mock
async def test_force_refresh_fetches_a_new_token_after_a_401_elsewhere():
    route = respx.post(TOKEN_URL).mock(side_effect=[httpx.Response(200, json={"access_token": "a", "expires_in": 3600}), httpx.Response(200, json={"access_token": "b", "expires_in": 3600})])
    token, http = token_source([0.0])
    async with http:
        assert await token.access_token() == "a"
        assert await token.access_token(force=True) == "b"
    assert route.call_count == 2


@respx.mock
async def test_a_rejected_refresh_token_raises_without_leaking_the_secrets():
    respx.post(TOKEN_URL).mock(return_value=httpx.Response(400, json={"error": "invalid_grant", "error_description": "Token has been expired or revoked."}))
    token, http = token_source([0.0])
    async with http:
        with pytest.raises(GoogleAuthError) as excinfo:
            await token.access_token()
    message = str(excinfo.value)
    assert "invalid_grant" in message and "revoked" in message
    assert CREDS["client_secret"] not in message and CREDS["refresh_token"] not in message


@respx.mock
async def test_a_network_failure_is_an_auth_error_too():
    respx.post(TOKEN_URL).mock(side_effect=httpx.ConnectError("boom"))
    token, http = token_source([0.0])
    async with http:
        with pytest.raises(GoogleAuthError):
            await token.access_token()
