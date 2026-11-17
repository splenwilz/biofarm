"""Assemble the dashboard payload from the mirror, the leads table and the
Google daily tables: deals, enquiries (with first contact from activities),
the newsletter figures, and spend / traffic / search / conversions.
The deals are read once and shared by the deals and enquiries sections."""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.google.importer import last_google_import_finished, last_google_import_ok
from app.mirror.models import ImportRun
from app.models import Lead, MarketingEvent
from app.reporting.deals import load_marketing_deals
from app.reporting.enquiries import load_enquiries
from app.reporting.events import load_events
from app.reporting.google import load_google_sections
from app.reporting.newsletter import load_newsletter, signup_months
from app.reporting.schemas import DashboardDataOut


class NoImportYet(Exception):
    """The mirror has never completed an import, so there is nothing to show."""


async def payload_version(session: AsyncSession) -> tuple[datetime, datetime | None, datetime | None, tuple[int, datetime | None]] | None:
    """What the cached payload depends on: the last good Pipedrive import, the
    newest website record (our own leads table changes between imports as
    forms are submitted, and the enquiries section reads it), the last Google
    import that wrote something, and the events table (count and newest
    change, so a write from the dashboard shows at once). None before the
    first Pipedrive import."""
    synced_at = await last_import_finished(session)
    if synced_at is None:
        return None
    newest_lead = (await session.execute(select(func.max(Lead.created_at)))).scalar_one_or_none()
    events = (await session.execute(select(func.count(MarketingEvent.id), func.max(MarketingEvent.updated_at)))).one()
    return synced_at, newest_lead, await last_google_import_finished(session), (int(events[0]), events[1])


async def last_import_finished(session: AsyncSession) -> datetime | None:
    """When the last good import ended: the payload's syncedAt, and the key the
    route caches the payload under (one build per import, not per page view)."""
    stmt = select(ImportRun.finished_at).where(ImportRun.status == "ok", ImportRun.finished_at.is_not(None)).order_by(ImportRun.finished_at.desc()).limit(1)
    return (await session.execute(stmt)).scalar_one_or_none()


async def build_dashboard_data(session: AsyncSession, settings: Settings, *, synced_at: datetime | None = None) -> DashboardDataOut:
    synced_at = synced_at or await last_import_finished(session)
    if synced_at is None:
        raise NoImportYet("run scripts/import_pipedrive.py first")
    deals = await load_marketing_deals(session, settings)
    enquiries = await load_enquiries(session, settings, deals=deals)
    newsletter = await load_newsletter(session, up_to=synced_at)
    newsletter.signups = signup_months(enquiries.newsletter_signups)
    google = await load_google_sections(session, settings)
    # Qualified records: the marketing deals, then the leads Sales ticked before converting them.
    qualified_records = [out for _, out in deals[1]] + enquiries.qualified_leads
    events = await load_events(session, enquiries.enquiries, qualified_records)
    google_synced_at = await last_google_import_ok(session)  # ok only: a source failing every day must show as stale
    return DashboardDataOut(
        deals=qualified_records,
        enquiries=enquiries.enquiries,
        newsletter=newsletter,
        spend=google.spend,
        traffic=google.traffic,
        search=google.search,
        conversions=google.conversions,
        events=events,
        synced_at=synced_at,
        google_synced_at=google_synced_at,
        source="pipedrive",
    )
