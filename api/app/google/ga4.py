"""GA4 Data API runReport (v1beta is still the documented endpoint:
https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport).
Three daily reports: sessions by default channel group, sessions by session
source (for the AI assistants), and key events by event name."""

from dataclasses import dataclass
from datetime import date
from typing import Any

import httpx

from app.google.auth import GoogleToken
from app.google.http import post_json

SOURCE = "ga4"
MAX_LIMIT = 250_000  # the API's own ceiling per request


@dataclass(frozen=True)
class Ga4ChannelRow:
    date: date
    channel_group: str
    sessions: int


@dataclass(frozen=True)
class Ga4SourceRow:
    date: date
    source: str
    sessions: int


@dataclass(frozen=True)
class Ga4KeyEventRow:
    date: date
    event_name: str
    key_events: int
    event_count: int


class Ga4Client:
    def __init__(self, http: httpx.AsyncClient, token: GoogleToken, *, property_id: str, page_size: int = 100_000, retry_sleep: float = 2.0) -> None:
        self._http, self._token, self._retry_sleep = http, token, retry_sleep
        self.page_size = min(page_size, MAX_LIMIT)
        self.api_url = f"https://analyticsdata.googleapis.com/v1beta/properties/{property_id}:runReport"
        # What the API said about the last reports' completeness (ResponseMetaData:
        # https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/ResponseMetaData).
        self._quality_notes: list[str] = []

    def pop_quality_notes(self) -> list[str]:
        notes, self._quality_notes = self._quality_notes, []
        return notes

    async def sessions_by_channel(self, start: date, end: date) -> list[Ga4ChannelRow]:
        rows = await self._report("sessions by channel", start, end, dimensions=["date", "sessionDefaultChannelGroup"], metrics=["sessions"])
        return [Ga4ChannelRow(date=_day(d[0]), channel_group=d[1], sessions=_int(m[0])) for d, m in rows]

    async def sessions_by_source(self, start: date, end: date) -> list[Ga4SourceRow]:
        rows = await self._report("sessions by source", start, end, dimensions=["date", "sessionSource"], metrics=["sessions"])
        return [Ga4SourceRow(date=_day(d[0]), source=d[1], sessions=_int(m[0])) for d, m in rows]

    async def key_events_by_name(self, start: date, end: date) -> list[Ga4KeyEventRow]:
        only_key_events = {"filter": {"fieldName": "keyEvents", "numericFilter": {"operation": "GREATER_THAN", "value": {"int64Value": "0"}}}}
        rows = await self._report("key events", start, end, dimensions=["date", "eventName"], metrics=["keyEvents", "eventCount"], metric_filter=only_key_events)
        return [Ga4KeyEventRow(date=_day(d[0]), event_name=d[1], key_events=_int(m[0]), event_count=_int(m[1])) for d, m in rows]

    async def _report(self, label: str, start: date, end: date, *, dimensions: list[str], metrics: list[str], metric_filter: dict[str, Any] | None = None) -> list[tuple[list[str], list[str]]]:
        """Every row of the report, paging by offset until rowCount is reached."""
        out: list[tuple[list[str], list[str]]] = []
        offset = 0
        while True:
            body: dict[str, Any] = {
                "dateRanges": [{"startDate": start.isoformat(), "endDate": end.isoformat()}],
                "dimensions": [{"name": n} for n in dimensions],
                "metrics": [{"name": n} for n in metrics],
                "limit": str(self.page_size),
                "offset": str(offset),
            }
            if metric_filter:
                body["metricFilter"] = metric_filter
            report = await post_json(self._http, self._token, self.api_url, body, source=SOURCE, retry_sleep=self._retry_sleep)
            if offset == 0:
                self._quality_notes.extend(f"{label} {start} to {end}: {note}" for note in quality_notes(report.get("metadata") or {}))
            page = report.get("rows") or []
            for row in page:
                out.append(([v["value"] for v in row.get("dimensionValues", [])], [v["value"] for v in row.get("metricValues", [])]))
            offset += len(page)
            if not page or offset >= int(report.get("rowCount") or 0):
                return out


def quality_notes(metadata: dict[str, Any]) -> list[str]:
    """The caveats GA4 attaches to a report: rows withheld to protect small
    groups (thresholding), rows folded into "(other)", or sampling."""
    notes: list[str] = []
    if metadata.get("subjectToThresholding"):
        notes.append("subject to thresholding (rows with few users withheld, so counts can be low)")
    if metadata.get("dataLossFromOtherRow"):
        notes.append("some rows folded into \"(other)\" (too many distinct values)")
    if metadata.get("samplingMetadatas"):
        notes.append("sampled")
    return notes


def _day(yyyymmdd: str) -> date:
    return date(int(yyyymmdd[:4]), int(yyyymmdd[4:6]), int(yyyymmdd[6:8]))


def _int(value: str) -> int:
    return int(float(value or 0))
