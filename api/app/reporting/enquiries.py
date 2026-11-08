"""Enquiries as the dashboard counts them (agreed 8 Nov 2026).

An enquiry is every lead in the Pipedrive Leads inbox plus every deal created
directly in a marketing pipeline, read from the mirror so the series reaches
back to 2024 rather than to the day our own form went live. Left out, each
with a reason the loader counts: deals from bulk imports, test titles, test
campaigns, test and staff people, and newsletter sign-ups (those go to the
Newsletter page). A deal converted from a lead is counted once: as the lead,
at the lead's date, while the mirror still has the lead.

Our own website records add form, audience, source/medium, campaign and
landing page when they match a Pipedrive lead (by lead id) or deal (by the
origin id we send). First contact is the first done call, email or meeting
logged against the person after the enquiry; tasks and planned activities do
not count. Inbound versus outbound is the dashboard's split, next to the same
split for qualified deals.
"""

import logging
import re
from collections import Counter, defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from functools import cached_property
from typing import Any, Literal
from urllib.parse import urlsplit

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from app.config import Settings
from app.mirror.models import Activity, MirrorDeal, MirrorLead, MirrorPerson
from app.models import Lead
from app.reporting.deals import DealContext, MarketingDeals, load_marketing_deals
from app.reporting.schemas import Audience, Channel, EnquiryForm, EnquiryOut
from app.services.attribution import source_label, touch_label

logger = logging.getLogger("app.reporting")

CHANNELS: frozenset[str] = frozenset(Channel.__args__)
FORMS: frozenset[str] = frozenset(EnquiryForm.__args__)
CONTACT_TYPES = frozenset({"call", "email", "meeting"})
Kind = Literal["lead", "deal"]
# Why a record was left out; the loader logs a count per reason.
Reason = Literal["imported", "test_title", "test_campaign", "test_person", "staff", "newsletter"]


# ---- first contact -----------------------------------------------------------------------


def contact_times(activities: Iterable[Any]) -> dict[int, list[datetime]]:
    """When each person was contacted: done calls, emails and meetings, at the
    time they were marked done (or logged, when never marked), oldest first.
    Takes Activity rows or anything with the same attributes."""
    times: dict[int, list[datetime]] = defaultdict(list)
    for a in activities:
        if a.is_deleted or not a.done or a.type not in CONTACT_TYPES or a.person_id is None:
            continue
        at = a.marked_as_done_time or a.add_time
        if at is not None:
            times[a.person_id].append(at)
    return {person: sorted(ts) for person, ts in times.items()}


def first_contact(created_at: datetime, contacts: Iterable[datetime]) -> datetime | None:
    if created_at.tzinfo is None:  # the leads table stores UTC; SQLite hands it back naive
        created_at = created_at.replace(tzinfo=UTC)
    after = [t for t in contacts if t >= created_at]
    return min(after) if after else None


# ---- one record ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Candidate:
    """A lead or a deal flattened to what the rules read."""

    kind: Kind
    id: str
    title: str | None
    created_at: datetime
    origin: str | None
    channel_id: int | None
    person_id: int | None
    archived: bool
    audience: Audience
    utm_campaign: str | None
    landing_page: str | None
    # Our own website record for the same enquiry, when one matched.
    website: Lead | None
    # A deal converted from a lead the mirror never saw (see EnquiryOut.converted).
    converted: bool = False
    # The visit as Pipedrive's UTM Source, UTM Medium and Referrer fields recorded it.
    touch: Mapping[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class EnquiryContext:
    settings: Settings
    channel_labels: Mapping[int, str]
    person_emails: Mapping[int, list[str]]
    contacts: Mapping[int, list[datetime]] = field(default_factory=dict)

    @cached_property
    def test_title(self) -> re.Pattern[str]:
        return re.compile(self.settings.enquiry_test_title_pattern, re.IGNORECASE)

    @cached_property
    def newsletter_title(self) -> re.Pattern[str]:
        return re.compile(self.settings.enquiry_newsletter_title_pattern, re.IGNORECASE)

    @cached_property
    def title_channels(self) -> list[tuple[re.Pattern[str], str]]:
        return [(re.compile(rf"\b{re.escape(word)}\b"), label) for word, label in self.settings.enquiry_channel_by_title.items() if label in CHANNELS]

    @cached_property
    def test_campaigns(self) -> frozenset[str]:
        return frozenset(c.strip().lower() for c in self.settings.enquiry_test_campaigns)


def audience_of(fields: object) -> Audience:
    chosen = set(fields) if isinstance(fields, list) else set()
    if "developer" in chosen:
        return "developer"
    if "landowner" in chosen:
        return "landowner"
    return "other"


def landing_path(page: str | None) -> str:
    if not page:
        return "/"
    path = urlsplit(page).path if "://" in page else page.split("?")[0]
    return path or "/"


def _clean(value: object) -> str | None:
    text = value.strip() if isinstance(value, str) else ""
    return text or None


def _domain(email: str) -> str:
    return email.rsplit("@", 1)[-1] if "@" in email else ""


def campaign_of(c: Candidate) -> str | None:
    if c.website is not None:
        touches = [t for t in (c.website.attribution, c.website.first_touch) if isinstance(t, dict)]
        for t in touches:
            if _clean(t.get("utm_campaign")):
                return _clean(t.get("utm_campaign"))
    return _clean(c.utm_campaign)


def form_of(c: Candidate, ctx: EnquiryContext) -> EnquiryForm | None:
    if c.website is not None and c.website.form in FORMS:
        return c.website.form  # type: ignore[return-value]
    if c.origin not in ctx.settings.enquiry_website_origins:
        return None
    title = c.title or ""
    if ctx.newsletter_title.search(title):
        return "newsletter"
    if re.match(r"\s*cpd\b", title, re.IGNORECASE):
        return "cpd"
    if re.match(r"\s*fold\b", title, re.IGNORECASE):
        return "fold"
    return "contact"


def channel_of(c: Candidate, ctx: EnquiryContext) -> Channel | None:
    """A word in the title first (the team's after-the-event batches), then the
    channel someone set, then Website for anything that came through the site."""
    title = c.title or ""
    for pattern, label in ctx.title_channels:
        if pattern.search(title):
            return label  # type: ignore[return-value]
    label = ctx.channel_labels.get(c.channel_id) if c.channel_id is not None else None
    if label in CHANNELS:
        return label  # type: ignore[return-value]
    if c.origin in ctx.settings.enquiry_website_origins:
        return "Website"
    return None


def derive(c: Candidate, ctx: EnquiryContext) -> EnquiryOut | Reason:
    """The dashboard's view of one record, or the reason it is not an enquiry."""
    s = ctx.settings
    title = c.title or ""
    if c.kind == "deal" and c.origin in s.enquiry_excluded_deal_origins:
        return "imported"
    if ctx.test_title.search(title):
        return "test_title"
    campaign = campaign_of(c)
    if campaign and campaign.lower() in ctx.test_campaigns:
        return "test_campaign"
    emails = [e.lower() for e in ctx.person_emails.get(c.person_id, [])] if c.person_id is not None else []
    if c.website is not None and c.website.email:
        emails.append(c.website.email.lower())
    if any(e in s.enquiry_test_emails or _domain(e) in s.enquiry_test_domains for e in emails):
        return "test_person"
    is_website = c.origin in s.enquiry_website_origins
    if c.kind == "lead" and is_website and any(_domain(e) in s.enquiry_staff_domains for e in emails):
        return "staff"
    form = form_of(c, ctx)
    if form == "newsletter":
        return "newsletter"
    if c.website is not None:
        page: str | None = landing_path(c.website.page)
        label: str | None = source_label(c.website.attribution, c.website.first_touch)
        audience = audience_of(c.website.fields) if c.audience == "other" else c.audience
    else:
        page = landing_path(c.landing_page) if _clean(c.landing_page) else None
        label = touch_label(c.touch)
        audience = c.audience
    return EnquiryOut(
        id=c.id,
        created_at=c.created_at,
        kind=c.kind,
        form=form,
        audience=audience,
        channel=channel_of(c, ctx),
        source_label=label,
        campaign=campaign,
        landing_page=page,
        first_contact_at=first_contact(c.created_at, ctx.contacts.get(c.person_id, [])) if c.person_id is not None else None,
        person_id=c.person_id,
        archived=c.archived,
        converted=c.converted,
    )


# ---- leads and deals as one list ------------------------------------------------------------


def _custom(fields: object, code: str | None) -> str | None:
    return _clean(fields.get(code)) if code and isinstance(fields, dict) else None


def candidates_from(
    leads: Iterable[MirrorLead],
    deals: Iterable[tuple[MirrorDeal, Audience]],
    website_records: Mapping[str, Lead],
    *,
    utm_campaign_code: str | None = None,
    landing_page_code: str | None = None,
    touch_codes: Mapping[str, str] | None = None,
) -> list[Candidate]:
    """Every lead the mirror still lists and every marketing deal, each once.
    `deals` are the deals the KPI rule keeps, with the audience of the pipeline
    they were created in. `website_records` is keyed by Pipedrive lead id and
    by our own record id (the origin id we send with a lead). `touch_codes`
    maps utm_source / utm_medium / referrer to the custom field codes that
    hold them; a converted lead's deal fills in what the lead lacks."""

    def touch(*records: MirrorLead | MirrorDeal | None) -> dict[str, object]:
        fields = [r.custom_fields for r in records if r is not None and isinstance(r.custom_fields, dict)]
        return {key: next((_clean(f.get(code)) for f in fields if _clean(f.get(code))), None) for key, code in (touch_codes or {}).items()}

    deals = list(deals)
    converted = {d.source_lead_id: (d, audience) for d, audience in deals if d.source_lead_id}
    out: list[Candidate] = []
    live_leads: set[str] = set()
    for lead in leads:
        if lead.is_deleted or lead.add_time is None:
            continue
        live_leads.add(lead.id)
        conv = converted.get(lead.id)
        deal = conv[0] if conv else None
        out.append(Candidate(
            kind="lead", id=lead.id, title=lead.title, created_at=lead.add_time, origin=lead.origin,
            channel_id=lead.channel if lead.channel is not None else (deal.channel if deal else None),
            person_id=lead.person_id if lead.person_id is not None else (deal.person_id if deal else None),
            archived=lead.is_archived, audience=conv[1] if conv else "other",
            utm_campaign=_custom(lead.custom_fields, utm_campaign_code) or (_custom(deal.custom_fields, utm_campaign_code) if deal else None),
            landing_page=_custom(lead.custom_fields, landing_page_code) or (_custom(deal.custom_fields, landing_page_code) if deal else None),
            website=website_records.get(lead.id) or (website_records.get(lead.origin_id) if lead.origin_id else None),
            touch=touch(lead, deal),
        ))
    for deal, audience in deals:
        if deal.add_time is None or (deal.source_lead_id and deal.source_lead_id in live_leads):
            continue
        out.append(Candidate(
            kind="deal", id=str(deal.id), title=deal.title, created_at=deal.add_time, origin=deal.origin, channel_id=deal.channel,
            person_id=deal.person_id, archived=False, audience=audience, converted=bool(deal.source_lead_id), touch=touch(deal),
            utm_campaign=_custom(deal.custom_fields, utm_campaign_code), landing_page=_custom(deal.custom_fields, landing_page_code),
            website=(website_records.get(deal.origin_id) if deal.origin_id else None) or (website_records.get(deal.source_lead_id) if deal.source_lead_id else None),
        ))
    return out


@dataclass
class EnquiryReport:
    enquiries: list[EnquiryOut]
    # When each newsletter sign-up came in, for the Newsletter page.
    newsletter_signups: list[datetime]
    excluded: dict[str, int]


async def load_enquiries(session: AsyncSession, settings: Settings, *, deals: tuple[DealContext, MarketingDeals] | None = None) -> EnquiryReport:
    """`deals` is the shared read from load_marketing_deals when the caller
    already has it (the dashboard builds both sections from one read)."""
    ctx_deals, kept = deals if deals is not None else await load_marketing_deals(session, settings)
    marketing_deals: list[tuple[MirrorDeal, Audience]] = [(d, out.pipeline) for d, out in kept]
    leads = (await session.execute(select(MirrorLead).options(defer(MirrorLead.raw, raiseload=True)).where(MirrorLead.is_deleted.is_(False)))).scalars().all()

    records: dict[str, Lead] = {}
    for w in (await session.execute(select(Lead).where(Lead.spam_flagged.is_(False)))).scalars():
        records[w.id] = w
        if w.pipedrive_lead_id:
            records[w.pipedrive_lead_id] = w
    emails: dict[int, list[str]] = {}
    for pid, raw in (await session.execute(select(MirrorPerson.id, MirrorPerson.emails))).all():
        emails[pid] = [str(e.get("value")) for e in raw if isinstance(e, dict) and e.get("value")] if isinstance(raw, list) else []
    landing_code = ctx_deals.field_codes.get("Landing Page")
    touch_codes = ctx_deals.touch_codes
    contact_rows = await session.execute(
        select(Activity.person_id, Activity.marked_as_done_time, Activity.add_time, Activity.is_deleted, Activity.done, Activity.type)
        .where(Activity.done.is_(True), Activity.type.in_(CONTACT_TYPES), Activity.is_deleted.is_(False), Activity.person_id.is_not(None))
    )
    contacts = contact_times(contact_rows.all())
    ctx = EnquiryContext(settings=settings, channel_labels=ctx_deals.channel_labels, person_emails=emails, contacts=contacts)

    enquiries: list[EnquiryOut] = []
    signups: list[datetime] = []
    excluded: Counter[str] = Counter()
    for c in candidates_from(leads, marketing_deals, records, utm_campaign_code=ctx_deals.utm_campaign_code, landing_page_code=landing_code, touch_codes=touch_codes):
        result = derive(c, ctx)
        if isinstance(result, EnquiryOut):
            enquiries.append(result)
        else:
            excluded[result] += 1
            if result == "newsletter":
                signups.append(c.created_at)
    enquiries.sort(key=lambda e: (e.created_at, e.kind, e.id))
    signups.sort()
    logger.info("enquiries %d; left out %s", len(enquiries), dict(excluded) or "nothing")
    return EnquiryReport(enquiries=enquiries, newsletter_signups=signups, excluded=dict(excluded))
