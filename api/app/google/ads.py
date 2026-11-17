"""Google Ads: one row per campaign and day from the REST searchStream
(https://developers.google.com/google-ads/api/rest/examples). No developer
token: they were sunset on 9 September 2026 and access now comes from the
Cloud project that owns the OAuth client. No login-customer-id: the account
is reached directly, not through a manager account."""

from dataclasses import dataclass
from datetime import date

import httpx

from app.google.auth import GoogleToken
from app.google.http import post_json

# v26 (14 Oct 2026), sunset November 2027: https://developers.google.com/google-ads/api/docs/sunset-dates
# Bump both together; tests/test_google_clients.py fails two months before the sunset as the reminder.
ADS_API_VERSION = "v26"
ADS_API_SUNSET = date(2027, 11, 1)
SOURCE = "google_ads"


@dataclass(frozen=True)
class AdsDailyRow:
    date: date
    campaign_id: int
    campaign_name: str
    cost_micros: int
    clicks: int
    impressions: int
    conversions: float
    conversions_value: float


def campaign_daily_query(start: date, end: date) -> str:
    return (
        "SELECT campaign.id, campaign.name, segments.date, metrics.cost_micros, metrics.clicks, "
        "metrics.impressions, metrics.conversions, metrics.conversions_value "
        f"FROM campaign WHERE segments.date BETWEEN '{start.isoformat()}' AND '{end.isoformat()}'"
    )  # no status filter: a campaign removed later still spent money in the window


class GoogleAdsClient:
    def __init__(self, http: httpx.AsyncClient, token: GoogleToken, *, customer_id: str, retry_sleep: float = 2.0) -> None:
        self._http, self._token, self._retry_sleep = http, token, retry_sleep
        self.customer_id = customer_id.replace("-", "")
        self.api_url = f"https://googleads.googleapis.com/{ADS_API_VERSION}/customers/{self.customer_id}/googleAds:searchStream"

    async def campaign_daily(self, start: date, end: date) -> list[AdsDailyRow]:
        batches = await post_json(self._http, self._token, self.api_url, {"query": campaign_daily_query(start, end)}, source=SOURCE, retry_sleep=self._retry_sleep, timeout=120.0)
        rows: list[AdsDailyRow] = []
        for batch in batches or []:
            for result in batch.get("results", []):
                campaign, metrics, segments = result.get("campaign", {}), result.get("metrics", {}), result.get("segments", {})
                rows.append(AdsDailyRow(
                    date=date.fromisoformat(segments["date"]),
                    campaign_id=int(campaign["id"]),
                    campaign_name=str(campaign.get("name") or ""),
                    cost_micros=int(metrics.get("costMicros") or 0),
                    clicks=int(metrics.get("clicks") or 0),
                    impressions=int(metrics.get("impressions") or 0),
                    conversions=float(metrics.get("conversions") or 0),
                    conversions_value=float(metrics.get("conversionsValue") or 0),
                ))
        return rows
