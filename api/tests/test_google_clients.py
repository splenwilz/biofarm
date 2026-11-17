"""The three read-only Google clients: the request each sends (checked against
the official REST references) and how the JSON comes back as daily rows."""

import json
from datetime import date, timedelta

import httpx
import pytest
import respx

from app.google.ads import (
    ADS_API_SUNSET,
    ADS_API_VERSION,
    AdsDailyRow,
    GoogleAdsClient,
    campaign_daily_query,
)
from app.google.auth import TOKEN_URL, GoogleToken
from app.google.ga4 import Ga4ChannelRow, Ga4Client, Ga4KeyEventRow, Ga4SourceRow
from app.google.http import GoogleApiError
from app.google.search_console import GscDailyRow, SearchConsoleClient

START, END = date(2026, 10, 1), date(2026, 10, 2)


@pytest.fixture
async def http():
    async with httpx.AsyncClient() as client:
        yield client


@pytest.fixture
def token(http):
    respx.post(TOKEN_URL).mock(return_value=httpx.Response(200, json={"access_token": "ya29.t", "expires_in": 3600}))
    return GoogleToken(http, client_id="c", client_secret="s", refresh_token="r")


def sent_json(route, n=0) -> dict:
    return json.loads(route.calls[n].request.content)


# ---- Google Ads ------------------------------------------------------------------------------


def test_the_campaign_query_asks_for_one_row_per_campaign_and_day_in_the_window():
    q = campaign_daily_query(START, END)
    assert "FROM campaign" in q
    assert "segments.date BETWEEN '2026-10-01' AND '2026-10-02'" in q
    for field in ("campaign.id", "campaign.name", "segments.date", "metrics.cost_micros", "metrics.clicks", "metrics.impressions", "metrics.conversions", "metrics.conversions_value"):
        assert field in q
    assert "campaign.status" not in q  # removed campaigns keep their history: spend is spend


@respx.mock
async def test_ads_streams_the_report_without_a_developer_token_or_manager_header(http, token):
    """Developer tokens were sunset on 9 Sep 2026 (access comes from the Cloud
    project behind the OAuth client) and login-customer-id is only for manager
    accounts; the account is reached directly."""
    url = f"https://googleads.googleapis.com/{ADS_API_VERSION}/customers/5161532396/googleAds:searchStream"
    route = respx.post(url).mock(return_value=httpx.Response(200, json=[
        {"results": [
            {"campaign": {"resourceName": "customers/5161532396/campaigns/1", "name": "AWD - BOF - Search - Branded - UK", "id": "1"},
             "metrics": {"clicks": "12", "conversions": 1.5, "conversionsValue": 0, "costMicros": "1234567", "impressions": "300"}, "segments": {"date": "2026-10-01"}},
        ]},
        {"results": [
            {"campaign": {"resourceName": "customers/5161532396/campaigns/1", "name": "AWD - BOF - Search - Branded - UK", "id": "1"},
             "metrics": {"clicks": "0", "conversions": 0, "conversionsValue": 0, "costMicros": "0", "impressions": "5"}, "segments": {"date": "2026-10-02"}},
        ]},
    ]))
    client = GoogleAdsClient(http, token, customer_id="516-153-2396")
    rows = await client.campaign_daily(START, END)
    req = route.calls[0].request
    assert req.headers["authorization"] == "Bearer ya29.t"
    assert "developer-token" not in req.headers and "login-customer-id" not in req.headers
    assert sent_json(route)["query"] == campaign_daily_query(START, END)
    assert rows == [
        AdsDailyRow(date=date(2026, 10, 1), campaign_id=1, campaign_name="AWD - BOF - Search - Branded - UK", cost_micros=1234567, clicks=12, impressions=300, conversions=1.5, conversions_value=0.0),
        AdsDailyRow(date=date(2026, 10, 2), campaign_id=1, campaign_name="AWD - BOF - Search - Branded - UK", cost_micros=0, clicks=0, impressions=5, conversions=0.0, conversions_value=0.0),
    ]


@respx.mock
async def test_a_401_refreshes_the_token_and_retries_once(http, token):
    url = f"https://googleads.googleapis.com/{ADS_API_VERSION}/customers/1/googleAds:searchStream"
    route = respx.post(url).mock(side_effect=[httpx.Response(401, json={"error": {"status": "UNAUTHENTICATED"}}), httpx.Response(200, json=[{"results": []}])])
    assert await GoogleAdsClient(http, token, customer_id="1").campaign_daily(START, END) == []
    assert route.call_count == 2
    assert respx.calls.call_count == 4  # token, 401, token again, 200


@respx.mock
async def test_a_429_is_retried_once_after_a_pause_then_raised_with_the_status(http, token):
    url = f"https://googleads.googleapis.com/{ADS_API_VERSION}/customers/1/googleAds:searchStream"
    route = respx.post(url).mock(return_value=httpx.Response(429, json={"error": {"status": "RESOURCE_EXHAUSTED", "message": "Quota exceeded"}}))
    client = GoogleAdsClient(http, token, customer_id="1", retry_sleep=0)
    with pytest.raises(GoogleApiError) as excinfo:
        await client.campaign_daily(START, END)
    assert route.call_count == 2
    assert excinfo.value.status == 429 and excinfo.value.source == "google_ads" and "Quota exceeded" in str(excinfo.value)


@respx.mock
async def test_a_transport_failure_is_a_google_api_error_naming_the_source_not_a_raw_exception(http, token):
    """Timeouts and refused connections must read like the API's own refusals:
    the importer records them per source and the dry-run script prints a sentence."""
    url = f"https://googleads.googleapis.com/{ADS_API_VERSION}/customers/1/googleAds:searchStream"
    respx.post(url).mock(side_effect=httpx.ConnectTimeout("timed out"))
    client = GoogleAdsClient(http, token, customer_id="1", retry_sleep=0)
    with pytest.raises(GoogleApiError) as excinfo:
        await client.campaign_daily(START, END)
    assert excinfo.value.status == 0 and excinfo.value.source == "google_ads"
    assert "ConnectTimeout" in str(excinfo.value)


# ---- GA4 Data API ----------------------------------------------------------------------------

GA4_URL = "https://analyticsdata.googleapis.com/v1beta/properties/403870147:runReport"


def ga4_response(rows: list[tuple[list[str], list[str]]], row_count: int | None = None) -> dict:
    return {
        "rows": [{"dimensionValues": [{"value": v} for v in dims], "metricValues": [{"value": v} for v in mets]} for dims, mets in rows],
        "rowCount": row_count if row_count is not None else len(rows),
        "metadata": {"currencyCode": "GBP", "timeZone": "Europe/London"},
        "kind": "analyticsData#runReport",
    }


@respx.mock
async def test_ga4_sessions_by_channel_sends_the_documented_report_and_parses_yyyymmdd_dates(http, token):
    route = respx.post(GA4_URL).mock(return_value=httpx.Response(200, json=ga4_response([(["20261001", "Paid Search"], ["30"]), (["20261002", "AI Assistant"], ["2"])])))
    rows = await Ga4Client(http, token, property_id="403870147").sessions_by_channel(START, END)
    body = sent_json(route)
    assert body["dateRanges"] == [{"startDate": "2026-10-01", "endDate": "2026-10-02"}]
    assert body["dimensions"] == [{"name": "date"}, {"name": "sessionDefaultChannelGroup"}]
    assert body["metrics"] == [{"name": "sessions"}]
    assert body["limit"] == "100000" and body["offset"] == "0"
    assert rows == [Ga4ChannelRow(date=date(2026, 10, 1), channel_group="Paid Search", sessions=30), Ga4ChannelRow(date=date(2026, 10, 2), channel_group="AI Assistant", sessions=2)]


@respx.mock
async def test_ga4_pages_with_offset_until_row_count_is_reached(http, token):
    route = respx.post(GA4_URL).mock(side_effect=[
        httpx.Response(200, json=ga4_response([(["20261001", "Direct"], ["1"]), (["20261001", "Email"], ["2"])], row_count=3)),
        httpx.Response(200, json=ga4_response([(["20261002", "Direct"], ["3"])], row_count=3)),
    ])
    rows = await Ga4Client(http, token, property_id="403870147", page_size=2).sessions_by_channel(START, END)
    assert [r.sessions for r in rows] == [1, 2, 3]
    assert sent_json(route, 0)["offset"] == "0" and sent_json(route, 1)["offset"] == "2"


@respx.mock
async def test_ga4_sessions_by_source_and_key_events_by_name(http, token):
    route = respx.post(GA4_URL).mock(side_effect=[
        httpx.Response(200, json=ga4_response([(["20261001", "chatgpt.com"], ["4"]), (["20261001", "google"], ["200"])])),
        httpx.Response(200, json=ga4_response([(["20261001", "Contact Form"], ["3", "3"]), (["20261002", "generate_lead"], ["1", "2"])])),
    ])
    client = Ga4Client(http, token, property_id="403870147")
    sources = await client.sessions_by_source(START, END)
    assert sent_json(route, 0)["dimensions"] == [{"name": "date"}, {"name": "sessionSource"}]
    assert sources == [Ga4SourceRow(date=date(2026, 10, 1), source="chatgpt.com", sessions=4), Ga4SourceRow(date=date(2026, 10, 1), source="google", sessions=200)]
    events = await client.key_events_by_name(START, END)
    body = sent_json(route, 1)
    assert body["dimensions"] == [{"name": "date"}, {"name": "eventName"}]
    assert body["metrics"] == [{"name": "keyEvents"}, {"name": "eventCount"}]
    # only events marked as key events come back; every other event would be noise
    assert body["metricFilter"] == {"filter": {"fieldName": "keyEvents", "numericFilter": {"operation": "GREATER_THAN", "value": {"int64Value": "0"}}}}
    assert events == [Ga4KeyEventRow(date=date(2026, 10, 1), event_name="Contact Form", key_events=3, event_count=3), Ga4KeyEventRow(date=date(2026, 10, 2), event_name="generate_lead", key_events=1, event_count=2)]


@respx.mock
async def test_ga4_an_empty_report_has_no_rows_key(http, token):
    respx.post(GA4_URL).mock(return_value=httpx.Response(200, json={"rowCount": 0, "kind": "analyticsData#runReport"}))
    assert await Ga4Client(http, token, property_id="403870147").sessions_by_channel(START, END) == []


# ---- Search Console --------------------------------------------------------------------------


def test_search_console_percent_encodes_the_site_url_in_the_path(http, token):
    client = SearchConsoleClient(http, token, site_url="https://www.biofarm.co.uk/", brand_pattern="(?i)bio ?farm")
    assert client.api_url == "https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fwww.biofarm.co.uk%2F/searchAnalytics/query"
    domain = SearchConsoleClient(http, token, site_url="sc-domain:biofarm.co.uk", brand_pattern="x")
    assert domain.api_url.endswith("/sites/sc-domain%3Abiofarm.co.uk/searchAnalytics/query")


def gsc_response(rows: list[tuple[str, int, int]]) -> dict:
    return {"rows": [{"keys": [d], "clicks": c, "impressions": i, "ctr": 0.1, "position": 5.0} for d, c, i in rows], "responseAggregationType": "byProperty"}


@respx.mock
async def test_search_console_pulls_total_brand_and_non_brand_by_day(http, token):
    client = SearchConsoleClient(http, token, site_url="https://www.biofarm.co.uk/", brand_pattern="(?i)bio ?farm")
    route = respx.post(client.api_url).mock(side_effect=[
        httpx.Response(200, json=gsc_response([("2026-10-01", 10, 200), ("2026-10-02", 8, 150)])),
        httpx.Response(200, json=gsc_response([("2026-10-01", 3, 40)])),  # brand: a day with no brand clicks is simply absent
        httpx.Response(200, json=gsc_response([("2026-10-01", 6, 120), ("2026-10-02", 7, 100)])),
    ])
    rows = await client.daily(START, END)
    total, brand, nonbrand = (sent_json(route, n) for n in range(3))
    for body in (total, brand, nonbrand):
        assert body["startDate"] == "2026-10-01" and body["endDate"] == "2026-10-02"
        assert body["dimensions"] == ["date"] and body["type"] == "web" and body["dataState"] == "final"
        assert body["rowLimit"] == 25000 and body["startRow"] == 0
    assert "dimensionFilterGroups" not in total
    assert brand["dimensionFilterGroups"] == [{"groupType": "and", "filters": [{"dimension": "query", "operator": "includingRegex", "expression": "(?i)bio ?farm"}]}]
    assert nonbrand["dimensionFilterGroups"] == [{"groupType": "and", "filters": [{"dimension": "query", "operator": "excludingRegex", "expression": "(?i)bio ?farm"}]}]
    assert rows == [
        GscDailyRow(date=date(2026, 10, 1), segment="total", clicks=10, impressions=200),
        GscDailyRow(date=date(2026, 10, 2), segment="total", clicks=8, impressions=150),
        GscDailyRow(date=date(2026, 10, 1), segment="brand", clicks=3, impressions=40),
        GscDailyRow(date=date(2026, 10, 1), segment="nonbrand", clicks=6, impressions=120),
        GscDailyRow(date=date(2026, 10, 2), segment="nonbrand", clicks=7, impressions=100),
    ]


@respx.mock
async def test_search_console_pages_by_start_row_when_a_page_is_full(http, token):
    client = SearchConsoleClient(http, token, site_url="https://www.biofarm.co.uk/", brand_pattern="b", row_limit=2)
    route = respx.post(client.api_url).mock(side_effect=[
        httpx.Response(200, json=gsc_response([("2026-10-01", 1, 1), ("2026-10-02", 1, 1)])),
        httpx.Response(200, json=gsc_response([("2026-10-03", 1, 1)])),
        httpx.Response(200, json={"responseAggregationType": "byProperty"}),  # brand: nothing at all
        httpx.Response(200, json=gsc_response([("2026-10-01", 1, 1)])),
    ])
    rows = await client.daily(START, date(2026, 10, 3))
    assert [r.date.day for r in rows if r.segment == "total"] == [1, 2, 3]
    assert sent_json(route, 1)["startRow"] == 2
    assert route.call_count == 4


@respx.mock
async def test_a_search_console_403_names_the_source_in_the_error(http, token):
    client = SearchConsoleClient(http, token, site_url="https://www.biofarm.co.uk/", brand_pattern="b")
    respx.post(client.api_url).mock(return_value=httpx.Response(403, json={"error": {"code": 403, "message": "User does not have sufficient permission for site"}}))
    with pytest.raises(GoogleApiError) as excinfo:
        await client.daily(START, END)
    assert excinfo.value.source == "search_console" and excinfo.value.status == 403 and "permission" in str(excinfo.value)


def test_the_ads_api_version_is_bumped_well_before_its_sunset():
    """Google sunsets each major version about a year after release; this fails two
    months ahead so the bump (ADS_API_VERSION + ADS_API_SUNSET, and the sunset-dates
    page) happens while the old version still works."""
    today = date.today()
    assert today < ADS_API_SUNSET - timedelta(days=60), (
        f"Google Ads API {ADS_API_VERSION} is sunset on {ADS_API_SUNSET}: move app/google/ads.py to the current version "
        "(https://developers.google.com/google-ads/api/docs/sunset-dates) and update ADS_API_SUNSET"
    )


@respx.mock
async def test_ga4_reports_their_caveats_as_quality_notes(http, token):
    body = ga4_response([(["20261001", "Contact Form"], ["3", "3"])])
    body["metadata"] = {"currencyCode": "GBP", "timeZone": "Europe/London", "subjectToThresholding": True, "dataLossFromOtherRow": False, "samplingMetadatas": [{"samplesReadCount": "1", "samplingSpaceSize": "2"}]}
    respx.post(GA4_URL).mock(return_value=httpx.Response(200, json=body))
    client = Ga4Client(http, token, property_id="403870147")
    await client.key_events_by_name(START, END)
    notes = client.pop_quality_notes()
    assert len(notes) == 2 and notes[0].startswith("key events 2026-10-01 to 2026-10-02: subject to thresholding") and notes[1].endswith("sampled")
    assert client.pop_quality_notes() == []  # drained
    await client.sessions_by_channel(START, END)  # a clean report adds nothing
    assert client.pop_quality_notes() == ["sessions by channel 2026-10-01 to 2026-10-02: subject to thresholding (rows with few users withheld, so counts can be low)", "sessions by channel 2026-10-01 to 2026-10-02: sampled"]
