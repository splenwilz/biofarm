"""Search Console Search Analytics by day, three ways: every query, queries
naming the brand, and the rest (https://developers.google.com/webmaster-tools/v1/searchanalytics/query).
The API returns top rows rather than all rows once a query filter is on, so
brand plus non-brand will usually fall short of the unfiltered total; the
total is kept so the gap is visible. Final data only: fresh days change."""

import urllib.parse
from dataclasses import dataclass
from datetime import date
from typing import Any

import httpx

from app.google.auth import GoogleToken
from app.google.http import post_json

SOURCE = "search_console"
SEGMENTS = ("total", "brand", "nonbrand")
MAX_ROW_LIMIT = 25_000


@dataclass(frozen=True)
class GscDailyRow:
    date: date
    segment: str  # one of SEGMENTS
    clicks: int
    impressions: int


class SearchConsoleClient:
    def __init__(self, http: httpx.AsyncClient, token: GoogleToken, *, site_url: str, brand_pattern: str, row_limit: int = MAX_ROW_LIMIT, retry_sleep: float = 2.0) -> None:
        self._http, self._token, self._retry_sleep = http, token, retry_sleep
        self.brand_pattern = brand_pattern
        self.row_limit = min(row_limit, MAX_ROW_LIMIT)
        # The property exactly as Search Console names it, percent-encoded as one path segment.
        self.api_url = f"https://www.googleapis.com/webmasters/v3/sites/{urllib.parse.quote(site_url, safe='')}/searchAnalytics/query"

    async def daily(self, start: date, end: date) -> list[GscDailyRow]:
        rows: list[GscDailyRow] = []
        for segment in SEGMENTS:
            rows.extend(await self._segment(segment, start, end))
        return rows

    async def _segment(self, segment: str, start: date, end: date) -> list[GscDailyRow]:
        out: list[GscDailyRow] = []
        start_row = 0
        while True:
            body: dict[str, Any] = {"startDate": start.isoformat(), "endDate": end.isoformat(), "dimensions": ["date"], "type": "web", "dataState": "final", "rowLimit": self.row_limit, "startRow": start_row}
            if segment != "total":
                operator = "includingRegex" if segment == "brand" else "excludingRegex"
                body["dimensionFilterGroups"] = [{"groupType": "and", "filters": [{"dimension": "query", "operator": operator, "expression": self.brand_pattern}]}]
            report = await post_json(self._http, self._token, self.api_url, body, source=SOURCE, retry_sleep=self._retry_sleep)
            page = report.get("rows") or []
            out.extend(GscDailyRow(date=date.fromisoformat(r["keys"][0]), segment=segment, clicks=int(r.get("clicks") or 0), impressions=int(r.get("impressions") or 0)) for r in page)
            if len(page) < self.row_limit:
                return out
            start_row += len(page)
