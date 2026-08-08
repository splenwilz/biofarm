import html
import logging

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.config import Settings
from app.models import Lead
from app.services import ga4
from app.services.pipedrive import PipedriveClient

logger = logging.getLogger(__name__)

_NOTE_ATTRIBUTION_LABELS = {
    "utm_source": "UTM source",
    "utm_medium": "UTM medium",
    "utm_campaign": "UTM campaign",
    "utm_term": "UTM term",
    "utm_content": "UTM content",
    "gclid": "Google Ads click ID",
    "fbclid": "Facebook click ID",
    "msclkid": "Microsoft click ID",
    "referrer": "Referrer",
    "landing_page": "Landing page",
}


def build_note_html(lead: Lead) -> str:
    parts: list[str] = []
    if lead.message:
        parts.append(f"<p><b>Message</b><br>{html.escape(lead.message)}</p>")
    if lead.fields:
        parts.append(f"<p><b>Field</b>: {html.escape(', '.join(lead.fields))}</p>")
    rows: list[str] = []
    for source_name, data in (("Last touch", lead.attribution), ("First touch", lead.first_touch)):
        if not data:
            continue
        pairs = [
            f"{label}: {html.escape(str(data[key]))}"
            for key, label in _NOTE_ATTRIBUTION_LABELS.items()
            if data.get(key)
        ]
        if pairs:
            rows.append(f"<p><b>{source_name}</b><br>{'<br>'.join(pairs)}</p>")
    parts.extend(rows)
    if lead.page:
        parts.append(f"<p><b>Submitted from</b>: {html.escape(lead.page)}</p>")
    parts.append(f"<p><i>Captured by biofarm-api (lead {lead.id})</i></p>")
    return "".join(parts)


def _lead_custom_fields(lead: Lead, settings: Settings) -> dict[str, str]:
    merged: dict[str, str] = {}
    # first touch fills gaps, last touch wins
    for data in (lead.first_touch or {}, lead.attribution or {}):
        for key, value in data.items():
            if value:
                merged[key] = value
    return {
        field_hash: merged[key]
        for key, field_hash in settings.pipedrive_lead_field_map.items()
        if merged.get(key)
    }


async def _sync_to_pipedrive(lead: Lead, settings: Settings) -> None:
    client = PipedriveClient(
        settings.pipedrive_company_domain,
        settings.pipedrive_api_token.get_secret_value(),
    )
    marketing_status = "subscribed" if lead.newsletter_opt_in else None
    person_id = await client.find_person_by_email(lead.email)
    if person_id is None:
        person_id = await client.create_person(
            name=lead.name,
            email=lead.email,
            phone=lead.phone,
            marketing_status=marketing_status,
        )
    elif lead.phone or marketing_status:
        await client.update_person(
            person_id, phone=lead.phone, marketing_status=marketing_status
        )
    # Record each id as soon as it exists: if a later step fails, the failed
    # row keeps the partial progress and a retry won't re-create records.
    lead.pipedrive_person_id = person_id

    title = (
        f"Website enquiry — {lead.name}"
        if lead.form == "contact"
        else f"Newsletter signup — {lead.name}"
    )
    lead_id = await client.create_lead(
        title=title,
        person_id=person_id,
        owner_id=settings.pipedrive_owner_id,
        label_ids=settings.pipedrive_lead_label_ids or None,
        custom_fields=_lead_custom_fields(lead, settings),
    )
    lead.pipedrive_lead_id = lead_id
    await client.create_note(content=build_note_html(lead), lead_id=lead_id)

    lead.sync_status = "synced"


async def process_lead(
    lead_db_id: str, sessionmaker: async_sessionmaker, settings: Settings
) -> None:
    """Background task: push the stored lead to Pipedrive and GA4.

    The lead row is already committed — any failure here is recorded on the row,
    never surfaced to the site visitor.
    """
    async with sessionmaker() as session:
        lead = await session.get(Lead, lead_db_id)
        if lead is None:  # pragma: no cover
            logger.error("process_lead: lead %s vanished", lead_db_id)
            return

        if settings.pipedrive_enabled:
            try:
                await _sync_to_pipedrive(lead, settings)
            except Exception as exc:
                logger.exception("Pipedrive sync failed for lead %s", lead.id)
                lead.sync_status = "failed"
                lead.sync_error = str(exc)[:2000]
            try:
                await session.commit()
            except Exception:
                # Outcome not recorded: the row stays 'pending' although
                # Pipedrive records may exist — a retry sweep must dedupe by
                # searching Pipedrive before re-creating.
                logger.exception(
                    "Failed to record sync outcome for lead %s", lead.id
                )

        if settings.ga4_enabled:
            await ga4.send_server_event(
                measurement_id=settings.ga4_measurement_id,
                api_secret=settings.ga4_api_secret.get_secret_value(),
                client_id=lead.ga_client_id,
                session_id=lead.ga_session_id,
                event_name="generate_lead_server",
                params={"lead_source": f"website_{lead.form}_form"},
            )
