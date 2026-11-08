"""Assemble the dashboard payload from the mirror and the leads table: deals,
enquiries (with first contact from activities) and the newsletter figures.
The deals are read once and shared by the deals and enquiries sections."""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.mirror.models import ImportRun
from app.models import Lead
from app.reporting.deals import load_marketing_deals
from app.reporting.enquiries import load_enquiries
from app.reporting.newsletter import load_newsletter, signup_months
from app.reporting.schemas import DashboardDataOut


class NoImportYet(Exception):
    """The mirror has never completed an import, so there is nothing to show."""


async def payload_version(session: AsyncSession) -> tuple[datetime, datetime | None] | None:
    """What the cached payload depends on: the last good import, and the newest
    website record (our own leads table changes between imports as forms are
    submitted, and the enquiries section reads it). None before the first import."""
    synced_at = await last_import_finished(session)
    if synced_at is None:
        return None
    newest_lead = (await session.execute(select(func.max(Lead.created_at)))).scalar_one_or_none()
    return synced_at, newest_lead


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
    return DashboardDataOut(
        deals=[out for _, out in deals[1]],
        enquiries=enquiries.enquiries,
        newsletter=newsletter,
        synced_at=synced_at,
        source="pipedrive",
    )
