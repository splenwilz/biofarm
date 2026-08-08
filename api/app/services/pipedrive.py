import asyncio
from typing import Any

import httpx


class PipedriveError(Exception):
    pass


def _error_reason(resp: httpx.Response) -> str:
    # This string is persisted (lead.sync_error) and logged — keep it to
    # Pipedrive's short error message, never the raw response body.
    try:
        error = resp.json().get("error")
    except ValueError:
        error = None
    return str(error)[:200] if error else "no error detail"


class PipedriveClient:
    """Thin async client for the two Pipedrive API generations this service needs.

    Persons use API v2 (v1 persons endpoints are sunset); Leads and Notes exist
    only in v1. Auth via the x-api-token header — never the query string.
    """

    def __init__(
        self,
        company_domain: str,
        api_token: str,
        *,
        timeout: float = 15.0,
        max_retries: int = 2,
    ) -> None:
        self._base = f"https://{company_domain}.pipedrive.com"
        self._headers = {"x-api-token": api_token}
        self._timeout = timeout
        self._max_retries = max_retries

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        async with httpx.AsyncClient(
            headers=self._headers, timeout=self._timeout
        ) as client:
            for attempt in range(self._max_retries + 1):
                try:
                    resp = await client.request(
                        method, f"{self._base}{path}", params=params, json=json
                    )
                except httpx.HTTPError as exc:
                    raise PipedriveError(f"{method} {path}: {exc}") from exc
                if resp.status_code == 429 and attempt < self._max_retries:
                    delay = 0.5 * 2**attempt
                    reset = resp.headers.get("x-ratelimit-reset")
                    if reset:
                        try:
                            delay = float(reset)
                        except ValueError:
                            pass  # malformed header — keep the backoff delay
                    await asyncio.sleep(min(delay, 10))
                    continue
                if resp.status_code >= 400:
                    raise PipedriveError(
                        f"{method} {path} failed with {resp.status_code}: {_error_reason(resp)}"
                    )
                return resp.json()
        raise PipedriveError(f"{method} {path}: retries exhausted")  # pragma: no cover

    async def find_person_by_email(self, email: str) -> int | None:
        data = await self._request(
            "GET",
            "/api/v2/persons/search",
            params={"term": email, "fields": "email", "exact_match": "true", "limit": 1},
        )
        items = (data.get("data") or {}).get("items") or []
        if not items:
            return None
        return items[0]["item"]["id"]

    async def create_person(
        self,
        *,
        name: str,
        email: str,
        phone: str | None = None,
        marketing_status: str | None = None,
    ) -> int:
        body: dict[str, Any] = {
            "name": name,
            "emails": [{"value": email, "primary": True, "label": "work"}],
        }
        if phone:
            body["phones"] = [{"value": phone, "primary": True, "label": "work"}]
        if marketing_status:
            body["marketing_status"] = marketing_status
        data = await self._request("POST", "/api/v2/persons", json=body)
        return data["data"]["id"]

    async def update_person(
        self,
        person_id: int,
        *,
        phone: str | None = None,
        marketing_status: str | None = None,
    ) -> None:
        body: dict[str, Any] = {}
        if phone:
            body["phones"] = [{"value": phone, "primary": True, "label": "work"}]
        if marketing_status:
            body["marketing_status"] = marketing_status
        if not body:
            return
        await self._request("PATCH", f"/api/v2/persons/{person_id}", json=body)

    async def create_lead(
        self,
        *,
        title: str,
        person_id: int,
        owner_id: int | None = None,
        label_ids: list[str] | None = None,
        custom_fields: dict[str, Any] | None = None,
    ) -> str:
        body: dict[str, Any] = {"title": title, "person_id": person_id}
        if owner_id is not None:
            body["owner_id"] = owner_id
        if label_ids:
            body["label_ids"] = label_ids
        # v1 leads take custom-field hashes at the root of the body.
        if custom_fields:
            body.update(custom_fields)
        data = await self._request("POST", "/api/v1/leads", json=body)
        return data["data"]["id"]

    async def create_note(
        self, *, content: str, lead_id: str, pinned: bool = True
    ) -> int:
        body: dict[str, Any] = {"content": content, "lead_id": lead_id}
        if pinned:
            body["pinned_to_lead_flag"] = 1
        data = await self._request("POST", "/api/v1/notes", json=body)
        return data["data"]["id"]
