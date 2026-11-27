import html
import logging
from collections.abc import Awaitable, Callable
from datetime import datetime

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.config import Settings
from app.models import Lead
from app.schemas import FIELD_LABELS, HEARD_ABOUT_LABELS, UNITS_WHEN_LABELS
from app.services import ga4
from app.services.attribution import source_label
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
    "gbraid": "Google Ads gbraid",
    "wbraid": "Google Ads wbraid",
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
        parts.append(f"<p><b>Field</b>: {html.escape(', '.join(FIELD_LABELS.get(f, f) for f in lead.fields))}</p>")
    if lead.heard_about:
        label = HEARD_ABOUT_LABELS.get(lead.heard_about, lead.heard_about)
        if lead.heard_about_other:
            label = f"{label} ({lead.heard_about_other})"
        parts.append(f"<p><b>Heard about us</b>: {html.escape(label)}</p>")
    # the developer questions, only the ones answered
    if lead.units_needed:
        parts.append(f"<p><b>Biodiversity units needed</b>: {html.escape(lead.units_needed)}</p>")
    if lead.site_location:
        parts.append(f"<p><b>Site location</b>: {html.escape(lead.site_location)}</p>")
    if lead.units_when:
        parts.append(f"<p><b>Units needed by</b>: {html.escape(UNITS_WHEN_LABELS.get(lead.units_when, lead.units_when))}</p>")
    # The newsletter answer, as the record on the lead itself (the person
    # fields need an admin to exist; this line is always there).
    if lead.newsletter_consent_basis:
        when = f" on {_day(lead.newsletter_consent_at)}" if lead.newsletter_consent_at else ""
        wording = {
            "soft_opt_in": f"added by soft opt-in{when} (the “I’d prefer not” box was left unticked)",
            "opt_in": f"opted in{when}",
            "declined": "declined",
        }.get(lead.newsletter_consent_basis, lead.newsletter_consent_basis)
        parts.append(f"<p><b>Newsletter</b>: {wording}</p>")
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


def _day(at: datetime) -> str:
    return f"{at.day} {at.strftime('%b %Y')}"


def newsletter_answer(*, opt_in: bool | None, declined: bool | None, asked_by_default: bool) -> tuple[bool, str | None]:
    """What the visitor answered about the newsletter: (add them?, basis).

    declined is the soft opt-in form's "I'd prefer not to receive these
    updates" box (26 Nov 2026 on): left unticked = added by soft opt-in,
    ticked = declined. Without it the payload came from an older form. On a
    form that always asked (asked_by_default: the old Yes / No radios) a
    bare opt_in is that answer; on one that never used to ask (CPD, Fold)
    only an explicit True or False is an answer, and None means no question
    was put, so nothing is recorded and nobody is added."""
    if declined is not None:
        return (False, "declined") if declined else (True, "soft_opt_in")
    if opt_in:
        return True, "opt_in"
    if asked_by_default or opt_in is False:
        return False, "declined"
    return False, None


def _consent_custom_fields(lead: Lead, settings: Settings) -> dict:
    """The consent record on the person: how the question was answered and,
    for an opt-in, the day. Empty until an admin has created the fields."""
    fields: dict = {}
    basis = lead.newsletter_consent_basis
    if not basis:
        return fields
    if settings.pipedrive_newsletter_consent_field:
        option_id = settings.pipedrive_newsletter_consent_option_map.get(basis)
        if option_id is not None:
            fields[settings.pipedrive_newsletter_consent_field] = option_id
    if settings.pipedrive_newsletter_consent_date_field and lead.newsletter_opt_in and lead.newsletter_consent_at:
        fields[settings.pipedrive_newsletter_consent_date_field] = lead.newsletter_consent_at.strftime("%Y-%m-%d")
    return fields


def _person_custom_fields(lead: Lead, settings: Settings) -> dict | None:
    """Custom fields for a NEW person: the required 'Client Type' (set type -
    takes a list of option ids; existing persons keep whatever the team has
    curated) and the newsletter consent record."""
    fields: dict = {}
    if settings.pipedrive_client_type_field and lead.fields:
        option_ids = [
            settings.pipedrive_client_type_map[f]
            for f in lead.fields
            if f in settings.pipedrive_client_type_map
        ]
        if option_ids:
            fields[settings.pipedrive_client_type_field] = option_ids
    fields.update(_consent_custom_fields(lead, settings))
    return fields or None


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


# Forms that always put the newsletter question to the visitor before the
# consent basis was recorded (rows from before 26 Nov 2026 have no basis):
# the contact and landowner forms' Yes / No radios, the newsletter form
# itself. The old CPD and Fold forms never asked, so their leads say nothing
# either way - "Opted Out" for a question that was never put would be false.
_FORMS_ASKING_ABOUT_NEWSLETTER = frozenset({"contact", "landowner", "newsletter"})


def _lead_custom_fields(lead: Lead, settings: Settings) -> dict[str, str | int]:
    merged: dict[str, str] = {}
    # first touch fills gaps, last touch wins
    for data in (lead.first_touch or {}, lead.attribution or {}):
        for key, value in data.items():
            if value:
                merged[key] = value
    fields: dict[str, str | int] = {
        field_hash: merged[key]
        for key, field_hash in settings.pipedrive_lead_field_map.items()
        if merged.get(key)
    }
    # The "Newsletter Sign Up" option field, as the old embeds wrote it: the
    # option id (an integer, which is how Pipedrive stores and returns it).
    basis = lead.newsletter_consent_basis
    asked = basis is not None or lead.form in _FORMS_ASKING_ABOUT_NEWSLETTER
    if settings.pipedrive_newsletter_field and asked:
        options = settings.pipedrive_newsletter_option_map
        if basis == "soft_opt_in" and "soft_opt_in" in options:
            choice = "soft_opt_in"
        else:
            choice = "opted_in" if lead.newsletter_opt_in else "opted_out"
        option_id = options.get(choice)
        if option_id is not None:
            fields[settings.pipedrive_newsletter_field] = option_id
    # "How they heard": a multiple-option field, which v1 leads take (and
    # return) as a string of option ids - one answer here. An answer the map
    # does not cover is left to the note.
    if settings.pipedrive_heard_about_field and lead.heard_about:
        option_id = settings.pipedrive_heard_about_option_map.get(lead.heard_about)
        if option_id is not None:
            fields[settings.pipedrive_heard_about_field] = str(option_id)
    return fields


# 4xx codes that can never be about the owner or channel: bad token, billing,
# wrong URL, rate limit.
_NOT_FIELD_RELATED = {401, 402, 404, 429}


async def _create_with_fallbacks[T](
    create: Callable[[int | None, int | None], Awaitable[T]],
    *,
    owner_id: int | None,
    channel: int | None,
    lead: Lead,
    what: str,
) -> T:
    """Run create(owner_id, channel); if Pipedrive answers 4xx, try again
    with the optional ids left out, one at a time, until it accepts.

    Pipedrive refuses to assign new items to a deactivated user, an id that
    was never valid gets the same treatment, and a `channel` that is not one
    of the company's configured Source channel options is a 400 too. Without
    this, a stale setting would fail every lead of that enquiry type silently
    until someone read the database - a lead missing its owner or channel
    beats a lost lead. Order: drop the channel first (the newer, more often
    misconfigured setting), then the owner, then both, so a good value is
    only lost once everything else has been tried. The 4xx may have another
    cause (then every attempt fails the same way and the lead is marked
    failed as before), so the warning quotes Pipedrive's own message."""
    attempts: list[tuple[int | None, int | None]] = []
    for combo in ((owner_id, channel), (owner_id, None), (None, channel), (None, None)):
        if combo not in attempts:
            attempts.append(combo)
    last_error: PipedriveError | None = None
    for index, (owner, chan) in enumerate(attempts):
        try:
            result = await create(owner, chan)
        except PipedriveError as exc:
            status = exc.status_code or 0
            is_last = index == len(attempts) - 1
            if is_last or not 400 <= status < 500 or status in _NOT_FIELD_RELATED:
                raise
            next_owner, next_chan = attempts[index + 1]
            dropping = ", ".join(
                name
                for name, had, keeps in (
                    (f"owner {owner}", owner is not None, next_owner is not None),
                    (f"channel {chan}", chan is not None, next_chan is not None),
                )
                if had and not keeps
            )
            # The 4xx may have nothing to do with these ids (Pipedrive also
            # answers 400 for e.g. marketing_status without the Campaigns
            # product, or a bad custom-field value); quote its message first
            # and let the outcome of the retry say which it was.
            logger.warning(
                "Pipedrive rejected the %s of lead %s: %s. Retrying without %s; if "
                "that succeeds, check BIOFARM_PIPEDRIVE_OWNER_MAP / OWNER_ID / "
                "WEBSITE_CHANNEL; if it fails too, the cause is elsewhere.",
                what, lead.id, exc, dropping,
            )
            last_error = exc
            continue
        dropped = [
            f"owner {owner_id}" if owner is None and owner_id is not None else None,
            f"channel {channel}" if chan is None and channel is not None else None,
        ]
        dropped = [d for d in dropped if d]
        if dropped:
            # Leave a trace on the row: logs expire, and 'synced' alone would
            # hide a misconfigured setting. sync_status stays 'synced'.
            note = f"{what} created without {' and '.join(dropped)}: {last_error}"
            lead.sync_error = (f"{lead.sync_error}; {note}" if lead.sync_error else note)[:2000]
        return result
    raise AssertionError("unreachable: the last attempt raises or returns")


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
            person_id = await _create_with_fallbacks(
                lambda owner, _channel: client.create_person(
                    name=lead.name,
                    email=lead.email,
                    phone=lead.phone,
                    marketing_status=marketing_status,
                    custom_fields=_person_custom_fields(lead, settings),
                    owner_id=owner,
                ),
                owner_id=owner_id, channel=None, lead=lead, what="person",
            )
        else:
            # An existing contact. An express opt-in (a sign-up form, a box
            # ticked) subscribes them as before. A soft opt-in only lifts a
            # person who has never answered: someone who unsubscribed, bounced
            # or is mid double opt-in keeps that status (PECR: they refused;
            # Pipedrive also allows each status change only once). The
            # consent record travels with the subscription; a declined
            # answer never overwrites an earlier record on the person.
            status = marketing_status
            consent = _consent_custom_fields(lead, settings) if lead.newsletter_opt_in else {}
            if status and lead.newsletter_consent_basis == "soft_opt_in":
                try:
                    current = await client.get_person_marketing_status(person_id)
                except PipedriveError as exc:
                    # Not knowing is not consent: leave the subscription alone
                    # rather than fail the whole sync (there is no retry sweep,
                    # so a failed sync is a lead Sales never see). The row
                    # keeps a trace so the subscription can be set by hand.
                    logger.warning("Could not read the marketing status of person %s for lead %s: %s. Not subscribing.", person_id, lead.id, exc)
                    note = f"soft opt-in not applied: could not read marketing status ({exc})"
                    lead.sync_error = (f"{lead.sync_error}; {note}" if lead.sync_error else note)[:2000]
                    current = "unknown"
                if current not in (None, "no_consent"):
                    status, consent = None, {}
            if lead.phone or status or consent:
                await client.update_person(
                    person_id, phone=lead.phone, marketing_status=status, custom_fields=consent or None
                )
        lead.pipedrive_person_id = person_id

    lead_id = lead.pipedrive_lead_id
    if lead_id is None:
        title = {
            "contact": f"Website enquiry - {lead.name}",
            "newsletter": f"Newsletter signup - {lead.name}",
            "cpd": f"CPD session request - {lead.name}",
            "fold": f"Fold enquiry - {lead.name}",
            "landowner": f"Landowner enquiry - {lead.name}",
        }.get(lead.form, f"Website lead - {lead.name}")
        label_ids = list(
            dict.fromkeys(
                settings.pipedrive_lead_label_ids
                + settings.pipedrive_form_label_map.get(lead.form, [])
            )
        )
        # Source stamping. origin_id = our row id: Pipedrive keeps origin_id
        # and channel on the deal a lead is converted into, so a deal can be
        # traced back to this enquiry (there is no lead id on a deal).
        # channel_id = a readable "source/medium" for the lead list and for
        # grouping in reporting; the full attribution is in the custom fields.
        lead_id = await _create_with_fallbacks(
            lambda owner, channel: client.create_lead(
                title=title,
                person_id=person_id,
                owner_id=owner,
                label_ids=label_ids or None,
                custom_fields=_lead_custom_fields(lead, settings),
                origin_id=lead.id,
                channel=channel,
                channel_id=source_label(lead.attribution, lead.first_touch),
            ),
            owner_id=owner_id, channel=settings.pipedrive_website_channel,
            lead=lead, what="lead",
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
