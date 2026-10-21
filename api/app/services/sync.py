import html
import logging
from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.config import Settings
from app.models import Lead
from app.services import ga4
from app.services.pipedrive import PipedriveClient, PipedriveError

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
        # Pipedrive renders note content as HTML, so newlines must become <br>
        # or multi-line messages (and the CPD Company/Role/Team size lines)
        # collapse into one run-on line.
        body = html.escape(lead.message).replace("\n", "<br>")
        parts.append(f"<p><b>Message</b><br>{body}</p>")
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


def _person_custom_fields(lead: Lead, settings: Settings) -> dict | None:
    """Map the form's field choices onto the required 'Client Type' person
    field (set type - takes a list of option ids). Create-only: existing
    persons keep whatever the team has curated."""
    if not settings.pipedrive_client_type_field or not lead.fields:
        return None
    option_ids = [
        settings.pipedrive_client_type_map[f]
        for f in lead.fields
        if f in settings.pipedrive_client_type_map
    ]
    if not option_ids:
        return None
    return {settings.pipedrive_client_type_field: option_ids}


def resolve_owner_id(lead: Lead, settings: Settings) -> int | None:
    """Pipedrive user who should own this enquiry.

    Looks up "<form>:<field>" for each ticked field in the order the form
    submits them (DOM order of the chips, not click order - so a contact who
    ticks both developer and landowner resolves developer), then "<form>",
    then falls back to the global owner. Returns None when nothing is
    configured, so Pipedrive applies its own default (the API token's user)."""
    owner_map = settings.pipedrive_owner_map
    for field in lead.fields or []:
        owner = owner_map.get(f"{lead.form}:{field}")
        if owner is not None:
            return owner
    owner = owner_map.get(lead.form)
    if owner is not None:
        return owner
    return settings.pipedrive_owner_id


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


# 4xx codes that can never be about the owner: bad token, billing, wrong URL.
_NOT_OWNER_RELATED = {401, 402, 404, 429}


async def _create_with_owner_fallback[T](
    create: Callable[[int | None], Awaitable[T]],
    owner_id: int | None,
    lead: Lead,
    what: str,
) -> T:
    """Run create(owner_id); if Pipedrive answers 4xx while an owner was set,
    create the record once more without an owner.

    Pipedrive refuses to assign new items to a deactivated user, and an id
    that was never valid gets the same treatment. Without this, every lead of
    that enquiry type would fail silently until someone read the database -
    a lead owned by the token's user beats a lost lead. The 4xx may have
    another cause (then the retry fails the same way and the lead is marked
    failed as before), so the warning quotes Pipedrive's own message."""
    try:
        return await create(owner_id)
    except PipedriveError as exc:
        status = exc.status_code or 0
        if owner_id is None or not 400 <= status < 500 or status in _NOT_OWNER_RELATED:
            raise
        # The 4xx may have nothing to do with the owner (Pipedrive also
        # answers 400 for e.g. marketing_status without the Campaigns
        # product, or a bad custom-field value); quote its message first and
        # let the outcome of the retry say which it was.
        logger.warning(
            "Pipedrive rejected the %s of lead %s: %s. The request carried owner %s, "
            "so retrying once without it; if the retry fails too, the owner is not "
            "the cause. If it succeeds, check BIOFARM_PIPEDRIVE_OWNER_MAP / OWNER_ID.",
            what, lead.id, exc, owner_id,
        )
        result = await create(None)
        # Leave a trace on the row: logs expire, and 'synced' alone would hide
        # a misconfigured owner map. sync_status stays 'synced'.
        note = f"{what} created without owner {owner_id}: {exc}"
        lead.sync_error = (f"{lead.sync_error}; {note}" if lead.sync_error else note)[:2000]
        return result


async def _sync_to_pipedrive(lead: Lead, settings: Settings) -> None:
    client = PipedriveClient(
        settings.pipedrive_company_domain,
        settings.pipedrive_api_token.get_secret_value(),
    )
    # Resume from any previously recorded ids so a retried lead never
    # re-creates records that already exist. Ids are assigned in memory here
    # and committed once by process_lead, together with the outcome status -
    # so a failed sync still persists whatever ids it got before failing.
    # A row being retried still carries the previous attempt's error; start
    # clean so a successful retry does not read as failed. The owner-fallback
    # note (below) and process_lead's failure handling write into it afresh.
    lead.sync_error = None
    marketing_status = "subscribed" if lead.newsletter_opt_in else None
    owner_id = resolve_owner_id(lead, settings)
    person_id = lead.pipedrive_person_id
    if person_id is None:
        person_id = await client.find_person_by_email(lead.email)
        if person_id is None:
            # new persons go to the same owner as the enquiry; existing
            # persons keep whoever the team already assigned
            person_id = await _create_with_owner_fallback(
                lambda owner: client.create_person(
                    name=lead.name,
                    email=lead.email,
                    phone=lead.phone,
                    marketing_status=marketing_status,
                    custom_fields=_person_custom_fields(lead, settings),
                    owner_id=owner,
                ),
                owner_id, lead, "person",
            )
        elif lead.phone or marketing_status:
            await client.update_person(
                person_id, phone=lead.phone, marketing_status=marketing_status
            )
        lead.pipedrive_person_id = person_id

    lead_id = lead.pipedrive_lead_id
    if lead_id is None:
        title = {
            "contact": f"Website enquiry - {lead.name}",
            "newsletter": f"Newsletter signup - {lead.name}",
            "cpd": f"CPD session request - {lead.name}",
            "fold": f"Fold enquiry - {lead.name}",
        }.get(lead.form, f"Website lead - {lead.name}")
        label_ids = list(
            dict.fromkeys(
                settings.pipedrive_lead_label_ids
                + settings.pipedrive_form_label_map.get(lead.form, [])
            )
        )
        lead_id = await _create_with_owner_fallback(
            lambda owner: client.create_lead(
                title=title,
                person_id=person_id,
                owner_id=owner,
                label_ids=label_ids or None,
                custom_fields=_lead_custom_fields(lead, settings),
            ),
            owner_id, lead, "lead",
        )
        lead.pipedrive_lead_id = lead_id
    await client.create_note(content=build_note_html(lead), lead_id=lead_id)

    lead.sync_status = "synced"


async def process_lead(
    lead_db_id: str, sessionmaker: async_sessionmaker, settings: Settings
) -> None:
    """Background task: push the stored lead to Pipedrive and GA4.

    The lead row is already committed - any failure here is recorded on the row,
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
                # Keep any owner-fallback note already on the row (the failure
                # may be a later step); the failure itself goes first.
                lead.sync_error = (
                    f"{exc}; {lead.sync_error}" if lead.sync_error else str(exc)
                )[:2000]
            try:
                await session.commit()
            except Exception:
                # Outcome not recorded: the row stays 'pending' although
                # Pipedrive records may exist - a retry sweep must dedupe by
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
