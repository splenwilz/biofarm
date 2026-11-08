"""A GET-only Pipedrive client.

One httpx client for the whole run (httpx asks for a single client rather
than one per request). httpx itself retries only connection failures, so
the rate limit (429), server errors and read failures are handled here:
a 429 waits for the window to reset, a 5xx or transport error backs off,
any other 4xx fails at once. The token travels in a header, never the URL,
and is scrubbed from every message this module raises or logs.
"""

import asyncio
import logging
from collections.abc import AsyncIterator
from typing import Any, Self

import httpx

logger = logging.getLogger("app.mirror")

PAGE_SIZE = 500  # the v2 maximum
MAX_ATTEMPTS = 5
MAX_WAIT = 30.0


class MirrorError(Exception):
    """A read from Pipedrive failed for good."""


class PipedriveReader:
    """Read-only by construction: the only HTTP verb this class knows is GET."""

    def __init__(self, company_domain: str, api_token: str, *, timeout: float = 30.0) -> None:
        if not company_domain or not api_token:
            raise MirrorError("Pipedrive company domain and API token are required")
        self._domain = company_domain
        self._token = api_token
        self._timeout = timeout
        self._client: httpx.AsyncClient | None = None
        # Seconds to wait before the next request, set when the window is nearly spent.
        self._pause = 0.0

    def __repr__(self) -> str:
        return f"PipedriveReader({self._domain!r})"

    async def __aenter__(self) -> Self:
        self._client = httpx.AsyncClient(
            base_url=f"https://{self._domain}.pipedrive.com",
            headers={"x-api-token": self._token},
            timeout=httpx.Timeout(self._timeout, connect=10.0),
            transport=httpx.AsyncHTTPTransport(retries=1),
        )
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def _scrub(self, text: str) -> str:
        return text.replace(self._token, "[token]")

    @staticmethod
    def _seconds(value: str | None) -> float | None:
        if value is None:
            return None
        try:
            seconds = float(value)
        except ValueError:
            return None
        return seconds if seconds >= 0 else None

    def _note_budget(self, headers: httpx.Headers) -> None:
        remaining = self._seconds(headers.get("x-ratelimit-remaining"))
        if remaining is not None and remaining < 2:
            self._pause = min(self._seconds(headers.get("x-ratelimit-reset")) or 1.0, MAX_WAIT)

    async def get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        """One GET, retried as the docstring says; the parsed JSON body."""
        if self._client is None:
            raise MirrorError("use the reader as an async context manager")
        last = "no attempt"
        for attempt in range(MAX_ATTEMPTS):
            if self._pause:
                await asyncio.sleep(self._pause)
                self._pause = 0.0
            backoff = min(0.5 * 2**attempt, MAX_WAIT)
            final = attempt == MAX_ATTEMPTS - 1
            try:
                resp = await self._client.get(path, params=params)
            except httpx.TransportError as exc:
                last = f"{type(exc).__name__}: {self._scrub(str(exc))}"
                logger.warning("GET %s: %s (attempt %d of %d)", path, last, attempt + 1, MAX_ATTEMPTS)
                if not final:
                    await asyncio.sleep(backoff)
                continue
            self._note_budget(resp.headers)
            if resp.status_code == 429:
                wait = min(self._seconds(resp.headers.get("x-ratelimit-reset")) or backoff, MAX_WAIT)
                last = "HTTP 429"
                logger.info("GET %s: rate limited, waiting %.1fs", path, wait)
                if not final:
                    await asyncio.sleep(wait)
                continue
            if resp.status_code >= 500:
                last = f"HTTP {resp.status_code}"
                logger.warning("GET %s: %s (attempt %d of %d)", path, last, attempt + 1, MAX_ATTEMPTS)
                if not final:
                    await asyncio.sleep(backoff)
                continue
            if resp.status_code >= 400:
                raise MirrorError(f"GET {path} failed with {resp.status_code}: {self._reason(resp)}")
            try:
                body = resp.json()
            except ValueError as exc:
                raise MirrorError(f"GET {path}: response was not JSON") from exc
            if not isinstance(body, dict) or body.get("success") is False:
                raise MirrorError(f"GET {path} returned success=false: {self._reason(resp)}")
            logger.debug("GET %s -> %d", path, resp.status_code)
            return body
        raise MirrorError(f"GET {path} failed after {MAX_ATTEMPTS} attempts, last {last}")

    def _reason(self, resp: httpx.Response) -> str:
        try:
            body = resp.json()
        except ValueError:
            return "no error detail"
        if isinstance(body, dict) and body.get("error"):
            return self._scrub(str(body["error"]))[:200]
        return "no error detail"

    async def pages(self, path: str, params: dict[str, Any] | None = None) -> AsyncIterator[dict[str, Any]]:
        """Every item of a cursor-paged list, page after page."""
        cursor: str | None = None
        while True:
            query: dict[str, Any] = {**(params or {}), "limit": PAGE_SIZE}
            if cursor:
                query["cursor"] = cursor
            body = await self.get(path, query)
            for item in body.get("data") or []:
                yield item
            cursor = (body.get("additional_data") or {}).get("next_cursor")
            if not cursor:
                return

    async def offset_pages(self, path: str, params: dict[str, Any] | None = None, *, limit: int = 100) -> AsyncIterator[dict[str, Any]]:
        """Every item of a v1 start/limit-paged list (leads, person flow)."""
        start = 0
        while True:
            body = await self.get(path, {**(params or {}), "start": start, "limit": limit})
            items = body.get("data") or []
            for item in items:
                yield item
            pagination = (body.get("additional_data") or {}).get("pagination") or {}
            if not items or not pagination.get("more_items_in_collection"):
                return
            start = pagination.get("next_start") or start + limit
