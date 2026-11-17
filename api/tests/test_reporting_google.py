"""Daily Google rows rolled up into the dashboard's monthly sections."""

from datetime import UTC, date, datetime

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db import Base, make_engine
from app.google.models import AdsCampaignDay, Ga4ChannelDay, Ga4KeyEventDay, Ga4SourceDay, GscDay
from app.reporting.google import (
    GA4_CHANNEL_MAP,
    ai_referrals,
    conversion_months,
    load_google_sections,
    search_months,
    spend_entries,
    traffic_months,
)

T = datetime(2026, 11, 1, tzinfo=UTC)


def ads(d: date, campaign_id: int, name: str, cost_micros: int):
    return AdsCampaignDay(date=d, campaign_id=campaign_id, campaign_name=name, cost_micros=cost_micros, clicks=1, impressions=1, conversions=0.0, conversions_value=0.0, fetched_at=T)


def test_spend_is_one_entry_per_campaign_and_month_in_pounds_with_a_stable_id():
    rows = [ads(date(2026, 10, 1), 1, "Brand", 1_234_567), ads(date(2026, 10, 2), 1, "Brand", 1_000_000), ads(date(2026, 11, 1), 1, "Brand (renamed)", 10), ads(date(2026, 10, 2), 2, "NSIP", 999_999)]
    entries = spend_entries(rows)
    assert [(e.id, e.month, e.platform, e.campaign, e.amount_gbp) for e in entries] == [
        ("gads-1-2026-10", "2026-10", "google_ads", "Brand", 2.23),
        ("gads-2-2026-10", "2026-10", "google_ads", "NSIP", 1.0),
        ("gads-1-2026-11", "2026-11", "google_ads", "Brand (renamed)", 0.0),
    ]


def test_spend_skips_months_a_campaign_spent_nothing_in():
    assert spend_entries([ads(date(2026, 10, 1), 1, "Paused", 0)]) == []


def test_traffic_maps_ga4_channel_groups_onto_the_dashboards_channels_and_sums_the_month():
    rows = [Ga4ChannelDay(date=date(2026, 10, 1), channel_group="Paid Search", sessions=10, fetched_at=T),
            Ga4ChannelDay(date=date(2026, 10, 2), channel_group="Paid Search", sessions=5, fetched_at=T),
            Ga4ChannelDay(date=date(2026, 10, 2), channel_group="AI Assistant", sessions=2, fetched_at=T),
            Ga4ChannelDay(date=date(2026, 10, 2), channel_group="Cross-network", sessions=3, fetched_at=T),
            Ga4ChannelDay(date=date(2026, 10, 2), channel_group="Paid Video", sessions=1, fetched_at=T),
            Ga4ChannelDay(date=date(2026, 10, 2), channel_group="Display", sessions=7, fetched_at=T),
            Ga4ChannelDay(date=date(2026, 10, 2), channel_group="Unassigned", sessions=1, fetched_at=T),
            Ga4ChannelDay(date=date(2026, 10, 2), channel_group="Organic Shopping", sessions=1, fetched_at=T),
            Ga4ChannelDay(date=date(2026, 11, 3), channel_group="Organic Search", sessions=4, fetched_at=T)]
    months = traffic_months(rows)
    assert [(m.month, m.channel, m.sessions) for m in months] == [
        ("2026-10", "AI assistant", 2),
        ("2026-10", "Direct", 1),
        ("2026-10", "Display", 7),
        ("2026-10", "Other", 1),
        ("2026-10", "Paid other", 4),
        ("2026-10", "Paid search", 15),
        ("2026-11", "Organic search", 4),
    ]
    # every GA4 default channel group has a home; the dashboard shows one name per channel
    assert set(GA4_CHANNEL_MAP) >= {"Direct", "Organic Search", "Paid Search", "Referral", "Organic Social", "Paid Social", "Email", "AI Assistant", "Display", "Cross-network", "Paid Video", "Unassigned"}


def test_ai_referrals_are_the_sessions_from_known_assistant_hosts_by_month():
    rows = [Ga4SourceDay(date=date(2026, 10, 1), source="chatgpt.com", sessions=3, fetched_at=T),
            Ga4SourceDay(date=date(2026, 10, 9), source="chat.openai.com", sessions=1, fetched_at=T),
            Ga4SourceDay(date=date(2026, 10, 9), source="perplexity.ai", sessions=1, fetched_at=T),
            Ga4SourceDay(date=date(2026, 10, 9), source="copilot.microsoft.com", sessions=1, fetched_at=T),
            Ga4SourceDay(date=date(2026, 10, 9), source="google", sessions=400, fetched_at=T),
            Ga4SourceDay(date=date(2026, 11, 2), source="gemini.google.com", sessions=2, fetched_at=T)]
    assert [(r.month, r.assistant, r.sessions) for r in ai_referrals(rows)] == [
        ("2026-10", "ChatGPT", 4), ("2026-10", "Copilot", 1), ("2026-10", "Perplexity", 1), ("2026-11", "Gemini", 2),
    ]


def test_search_months_join_brand_figures_with_ai_sessions_and_keep_the_unfiltered_totals():
    gsc = [GscDay(date=date(2026, 10, 1), segment="total", clicks=10, impressions=200, fetched_at=T),
           GscDay(date=date(2026, 10, 2), segment="total", clicks=5, impressions=100, fetched_at=T),
           GscDay(date=date(2026, 10, 1), segment="brand", clicks=3, impressions=40, fetched_at=T),
           GscDay(date=date(2026, 10, 1), segment="nonbrand", clicks=6, impressions=150, fetched_at=T),
           GscDay(date=date(2026, 11, 1), segment="total", clicks=1, impressions=10, fetched_at=T)]
    channels = [Ga4ChannelDay(date=date(2026, 10, 5), channel_group="AI Assistant", sessions=6, fetched_at=T),
                Ga4ChannelDay(date=date(2026, 10, 5), channel_group="Direct", sessions=60, fetched_at=T),
                Ga4ChannelDay(date=date(2026, 9, 5), channel_group="AI Assistant", sessions=1, fetched_at=T)]
    months = search_months(gsc, channels)
    assert [m.model_dump(by_alias=True) for m in months] == [
        {"month": "2026-09", "brandImpressions": 0, "brandClicks": 0, "aiSessions": 1, "aiMentionShare": None, "totalClicks": 0, "totalImpressions": 0, "nonBrandClicks": 0, "nonBrandImpressions": 0},
        {"month": "2026-10", "brandImpressions": 40, "brandClicks": 3, "aiSessions": 6, "aiMentionShare": None, "totalClicks": 15, "totalImpressions": 300, "nonBrandClicks": 6, "nonBrandImpressions": 150},
        {"month": "2026-11", "brandImpressions": 0, "brandClicks": 0, "aiSessions": 0, "aiMentionShare": None, "totalClicks": 1, "totalImpressions": 10, "nonBrandClicks": 0, "nonBrandImpressions": 0},
    ]


def test_conversions_are_the_mapped_key_events_by_month_and_unmapped_names_are_left_out():
    rows = [Ga4KeyEventDay(date=date(2026, 10, 1), event_name="Contact Form", key_events=3, event_count=3, fetched_at=T),
            Ga4KeyEventDay(date=date(2026, 10, 9), event_name="Contact Form", key_events=2, event_count=2, fetched_at=T),
            Ga4KeyEventDay(date=date(2026, 10, 9), event_name="E-mail Click", key_events=1, event_count=1, fetched_at=T),
            Ga4KeyEventDay(date=date(2026, 10, 9), event_name="Newsletter Sign Up Form", key_events=1, event_count=1, fetched_at=T),
            Ga4KeyEventDay(date=date(2026, 10, 9), event_name="generate_lead", key_events=4, event_count=9, fetched_at=T),
            Ga4KeyEventDay(date=date(2026, 10, 9), event_name="purchase", key_events=1, event_count=1, fetched_at=T)]
    event_map = {"Contact Form": "enquiry", "Newsletter Sign Up Form": "newsletter_signup", "E-mail Click": "email_click"}
    assert [(c.month, c.event, c.count) for c in conversion_months(rows, event_map)] == [
        ("2026-10", "email_click", 1), ("2026-10", "enquiry", 5), ("2026-10", "newsletter_signup", 1),
    ]


@pytest.fixture
async def sessions(tmp_path):
    engine = make_engine(f"sqlite+aiosqlite:///{tmp_path}/r.db")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


async def test_load_google_sections_reads_the_tables_and_applies_the_settings_event_map(sessions):
    from app.config import Settings

    async with sessions() as s:
        s.add_all([ads(date(2026, 10, 1), 7, "Lesnewth", 5_000_000),
                   Ga4ChannelDay(date=date(2026, 10, 1), channel_group="Email", sessions=9, fetched_at=T),
                   Ga4SourceDay(date=date(2026, 10, 1), source="claude.ai", sessions=1, fetched_at=T),
                   Ga4KeyEventDay(date=date(2026, 10, 1), event_name="Contact Form", key_events=2, event_count=2, fetched_at=T),
                   GscDay(date=date(2026, 10, 1), segment="brand", clicks=1, impressions=30, fetched_at=T)])
        await s.commit()
        settings = Settings(_env_file=None, ga4_key_event_map={"Contact Form": "enquiry"})
        sections = await load_google_sections(s, settings)
    assert [e.amount_gbp for e in sections.spend] == [5.0]
    assert [(t.channel, t.sessions) for t in sections.traffic] == [("Email", 9)]
    assert [(r.assistant, r.sessions) for r in sections.search.ai_referrals] == [("Claude", 1)]
    assert [(m.month, m.brand_impressions) for m in sections.search.months] == [("2026-10", 30)]
    assert [(c.event, c.count) for c in sections.conversions] == [("enquiry", 2)]
