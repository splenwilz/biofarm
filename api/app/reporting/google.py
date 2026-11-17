"""The dashboard's spend, traffic, search and conversions sections, rolled up
by month from the Google daily tables (app/google/models.py)."""

from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.google.models import AdsCampaignDay, Ga4ChannelDay, Ga4KeyEventDay, Ga4SourceDay, GscDay
from app.reporting.schemas import AiReferralOut, ConversionMonthOut, SearchMonthOut, SearchOut, SpendEntryOut, TrafficMonthOut

# GA4 default channel group -> the dashboard's traffic channel. Anything GA4
# adds that is not listed lands in "Other" rather than vanishing.
GA4_CHANNEL_MAP: dict[str, str] = {
    "Organic Search": "Organic search",
    "Paid Search": "Paid search",
    "Direct": "Direct",
    "Unassigned": "Direct",  # GA4 could not say; the dashboard shows Direct as "Direct/unknown"
    "Referral": "Referral",
    "Organic Social": "Organic social",
    "Paid Social": "Paid social",
    "Email": "Email",
    "AI Assistant": "AI assistant",
    "Display": "Display",
    "Cross-network": "Paid other",  # Performance Max and Demand Gen
    "Paid Video": "Paid other",
    "Paid Shopping": "Paid other",
    "Paid Other": "Paid other",
}
OTHER_CHANNEL = "Other"
AI_CHANNEL_GROUP = "AI Assistant"

# Session source -> the assistant the dashboard knows (its AiAssistant type).
AI_ASSISTANT_HOSTS: dict[str, str] = {
    "chatgpt.com": "ChatGPT",
    "chat.openai.com": "ChatGPT",
    "openai.com": "ChatGPT",
    "perplexity.ai": "Perplexity",
    "www.perplexity.ai": "Perplexity",
    "claude.ai": "Claude",
    "gemini.google.com": "Gemini",
    "copilot.microsoft.com": "Copilot",
}


def _month(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def spend_entries(rows: Iterable[AdsCampaignDay]) -> list[SpendEntryOut]:
    """One entry per campaign and month, in pounds; the id is stable across
    imports so the dashboard can tell feed rows from hand-entered ones."""
    cost: dict[tuple[str, int], int] = defaultdict(int)
    names: dict[tuple[str, int], tuple[date, str]] = {}
    for r in rows:
        key = (_month(r.date), r.campaign_id)
        cost[key] += r.cost_micros
        if key not in names or r.date > names[key][0]:
            names[key] = (r.date, r.campaign_name)  # the latest name the campaign had that month
    return [
        SpendEntryOut(id=f"gads-{campaign_id}-{month}", month=month, platform="google_ads", campaign=names[(month, campaign_id)][1], amount_gbp=round(micros / 1_000_000, 2))
        for (month, campaign_id), micros in sorted(cost.items())
        if micros > 0
    ]


def traffic_months(rows: Iterable[Ga4ChannelDay]) -> list[TrafficMonthOut]:
    sessions: dict[tuple[str, str], int] = defaultdict(int)
    for r in rows:
        sessions[(_month(r.date), GA4_CHANNEL_MAP.get(r.channel_group, OTHER_CHANNEL))] += r.sessions
    return [TrafficMonthOut(month=month, channel=channel, sessions=n) for (month, channel), n in sorted(sessions.items())]


def ai_referrals(rows: Iterable[Ga4SourceDay]) -> list[AiReferralOut]:
    sessions: dict[tuple[str, str], int] = defaultdict(int)
    for r in rows:
        assistant = AI_ASSISTANT_HOSTS.get(r.source.lower())
        if assistant:
            sessions[(_month(r.date), assistant)] += r.sessions
    return [AiReferralOut(month=month, assistant=assistant, sessions=n) for (month, assistant), n in sorted(sessions.items())]


def search_months(gsc: Iterable[GscDay], channels: Iterable[Ga4ChannelDay]) -> list[SearchMonthOut]:
    """Brand, non-brand and total search figures by month, with that month's
    AI-assistant sessions; a month present in either source gets a row."""
    totals: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for r in gsc:
        totals[_month(r.date)][f"{r.segment}_clicks"] += r.clicks
        totals[_month(r.date)][f"{r.segment}_impressions"] += r.impressions
    for c in channels:
        if c.channel_group == AI_CHANNEL_GROUP:
            totals[_month(c.date)]["ai_sessions"] += c.sessions
    return [
        SearchMonthOut(
            month=month,
            brand_impressions=t["brand_impressions"], brand_clicks=t["brand_clicks"],
            ai_sessions=t["ai_sessions"], ai_mention_share=None,
            total_clicks=t["total_clicks"], total_impressions=t["total_impressions"],
            non_brand_clicks=t["nonbrand_clicks"], non_brand_impressions=t["nonbrand_impressions"],
        )
        for month, t in sorted(totals.items())
    ]


def conversion_months(rows: Iterable[Ga4KeyEventDay], event_map: Mapping[str, str]) -> list[ConversionMonthOut]:
    """GA4 key events by month under the dashboard's names (enquiry,
    newsletter_signup, email_click); names not in the map are not reported."""
    counts: dict[tuple[str, str], int] = defaultdict(int)
    for r in rows:
        kind = event_map.get(r.event_name)
        if kind:
            counts[(_month(r.date), kind)] += r.key_events
    return [ConversionMonthOut(month=month, event=kind, count=n) for (month, kind), n in sorted(counts.items())]


@dataclass
class GoogleSections:
    spend: list[SpendEntryOut]
    traffic: list[TrafficMonthOut]
    search: SearchOut
    conversions: list[ConversionMonthOut]


async def load_google_sections(session: AsyncSession, settings: Settings) -> GoogleSections:
    ads = (await session.execute(select(AdsCampaignDay))).scalars().all()
    channels = (await session.execute(select(Ga4ChannelDay))).scalars().all()
    sources = (await session.execute(select(Ga4SourceDay))).scalars().all()
    events = (await session.execute(select(Ga4KeyEventDay))).scalars().all()
    gsc = (await session.execute(select(GscDay))).scalars().all()
    return GoogleSections(
        spend=spend_entries(ads),
        traffic=traffic_months(channels),
        search=SearchOut(months=search_months(gsc, channels), ai_referrals=ai_referrals(sources)),
        conversions=conversion_months(events, settings.ga4_key_event_map),
    )
