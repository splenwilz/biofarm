"""Soft opt-in for the newsletter (26 Nov 2026).

The contact, about, corporates, landowner and Fold forms now subscribe a
visitor unless they tick "I'd prefer not to receive these updates" (PECR reg.
22(3): details obtained during negotiations, our own similar updates, a
refusal offered at collection and in every send). The CPD form keeps an
ordinary unticked opt-in box: a CPD session request is not a negotiation
for BNG units. Signing up on a newsletter form stays express consent.

Every lead records HOW it was answered (the consent basis) and WHEN, so the
record outlives the form wording. Old forms cached in a browser still send
the old payload and are judged by the old rule: nobody is added by a rule
they never saw.
"""

import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
import respx
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient

from app.main import create_app
from app.models import Lead
from app.schemas import ContactSubmission, CpdSubmission, FoldSubmission, LandownerSubmission
from app.services.sync import _lead_custom_fields, build_note_html, newsletter_answer
from tests.conftest import make_settings
from tests.test_api import BASE, get_single_lead, mock_pipedrive_happy_path

ALEMBIC_INI = Path(__file__).parents[1] / "alembic.ini"


# ---- the answer a form gives ------------------------------------------------


class TestNewsletterAnswer:
    """(opt_in, basis) from what the form sent."""

    def test_soft_opt_in_form_box_left_unticked_subscribes(self):
        assert newsletter_answer(opt_in=None, declined=False, asked_by_default=True) == (True, "soft_opt_in")

    def test_soft_opt_in_form_box_ticked_declines(self):
        assert newsletter_answer(opt_in=None, declined=True, asked_by_default=True) == (False, "declined")

    def test_declined_wins_over_a_stale_opt_in_flag(self):
        # a form sending both: the new box is the visitor's answer
        assert newsletter_answer(opt_in=True, declined=True, asked_by_default=True) == (False, "declined")

    def test_old_radio_form_yes_is_an_express_opt_in(self):
        assert newsletter_answer(opt_in=True, declined=None, asked_by_default=True) == (True, "opt_in")

    def test_old_radio_form_no_is_declined(self):
        assert newsletter_answer(opt_in=False, declined=None, asked_by_default=True) == (False, "declined")

    def test_a_form_that_never_asked_records_nothing(self):
        # old CPD / Fold forms: no question was put, so no answer is recorded
        assert newsletter_answer(opt_in=None, declined=None, asked_by_default=False) == (False, None)

    def test_cpd_box_ticked_is_an_express_opt_in_and_unticked_is_declined(self):
        # the new CPD form sends an explicit True or False: the box was shown
        assert newsletter_answer(opt_in=True, declined=None, asked_by_default=False) == (True, "opt_in")
        assert newsletter_answer(opt_in=False, declined=None, asked_by_default=False) == (False, "declined")


class TestSchemas:
    def test_contact_landowner_and_fold_take_the_declined_box(self):
        for cls in (ContactSubmission, LandownerSubmission):
            s = cls(name="J", email="j@example.com", newsletter_declined=True)
            assert s.newsletter_declined is True
            assert cls(name="J", email="j@example.com").newsletter_declined is None
        f = FoldSubmission(name="J", email="j@example.com", habitat_bank="B", location="L", newsletter_declined=False)
        assert f.newsletter_declined is False
        assert FoldSubmission(name="J", email="j@example.com", habitat_bank="B", location="L").newsletter_declined is None

    def test_cpd_opt_in_is_absent_until_the_form_sends_it(self):
        assert CpdSubmission(name="J", email="j@example.com", company="A").newsletter_opt_in is None
        assert CpdSubmission(name="J", email="j@example.com", company="A", newsletter_opt_in=True).newsletter_opt_in is True


# ---- what each route stores -------------------------------------------------


async def _post(tmp_path, path: str, payload: dict) -> Lead:
    settings = make_settings(tmp_path, pipedrive_company_domain="", pipedrive_api_token="")
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            ac.app = app
            r = await ac.post(path, json=payload)
            assert r.status_code == 202, r.text
            return await get_single_lead(ac)


PERSON = {"name": "Jane", "email": "jane@example.com"}


@pytest.mark.parametrize(
    "path, extra, expect_opt_in, expect_basis",
    [
        # the five soft opt-in forms, new payload
        ("/v1/leads/contact", {"newsletter_declined": False}, True, "soft_opt_in"),
        ("/v1/leads/contact", {"newsletter_declined": True}, False, "declined"),
        ("/v1/leads/landowner", {"newsletter_declined": False}, True, "soft_opt_in"),
        ("/v1/leads/landowner", {"newsletter_declined": True}, False, "declined"),
        ("/v1/leads/fold", {"habitat_bank": "B", "location": "L", "newsletter_declined": False}, True, "soft_opt_in"),
        ("/v1/leads/fold", {"habitat_bank": "B", "location": "L", "newsletter_declined": True}, False, "declined"),
        # the old radio forms still cached somewhere: judged by the old rule
        ("/v1/leads/contact", {"newsletter_opt_in": True}, True, "opt_in"),
        ("/v1/leads/contact", {"newsletter_opt_in": False}, False, "declined"),
        ("/v1/leads/landowner", {"newsletter_opt_in": True}, True, "opt_in"),
        # the old Fold form never asked
        ("/v1/leads/fold", {"habitat_bank": "B", "location": "L"}, False, None),
        # CPD: an ordinary opt-in box; the old form never asked
        ("/v1/leads/cpd", {"company": "A", "newsletter_opt_in": True}, True, "opt_in"),
        ("/v1/leads/cpd", {"company": "A", "newsletter_opt_in": False}, False, "declined"),
        ("/v1/leads/cpd", {"company": "A"}, False, None),
        # signing up is the consent
        ("/v1/leads/newsletter", {}, True, "opt_in"),
    ],
)
async def test_routes_store_the_answer_its_basis_and_the_date(tmp_path, path, extra, expect_opt_in, expect_basis):
    before = datetime.now(UTC).replace(microsecond=0)
    lead = await _post(tmp_path, path, {**PERSON, **extra})
    assert lead.newsletter_opt_in is expect_opt_in
    assert lead.newsletter_consent_basis == expect_basis
    if expect_opt_in:
        assert lead.newsletter_consent_at is not None
        assert lead.newsletter_consent_at.replace(tzinfo=UTC) >= before
    else:
        assert lead.newsletter_consent_at is None


async def test_a_declined_box_beats_a_stale_opt_in_flag_in_the_same_payload(tmp_path):
    lead = await _post(tmp_path, "/v1/leads/contact", {**PERSON, "newsletter_opt_in": True, "newsletter_declined": True})
    assert lead.newsletter_opt_in is False
    assert lead.newsletter_consent_basis == "declined"


# ---- the Pipedrive side -----------------------------------------------------


def lead(**over) -> Lead:
    base = {"form": "contact", "name": "J", "email": "j@example.com", "newsletter_opt_in": False, "attribution": None, "first_touch": None}
    base.update(over)
    return Lead(**base)


class TestNewsletterSignUpLeadField:
    """The team's "Newsletter Sign Up" lead field (Opted In / Opted Out)."""

    def test_soft_opt_in_writes_opted_in_unless_a_soft_opt_in_option_exists(self, tmp_path):
        s = make_settings(tmp_path, pipedrive_newsletter_field="newshash", pipedrive_newsletter_option_map={"opted_in": 1120, "opted_out": 1121})
        assert _lead_custom_fields(lead(newsletter_opt_in=True, newsletter_consent_basis="soft_opt_in"), s) == {"newshash": 1120}
        s3 = make_settings(tmp_path, pipedrive_newsletter_field="newshash", pipedrive_newsletter_option_map={"opted_in": 1120, "opted_out": 1121, "soft_opt_in": 1300})
        assert _lead_custom_fields(lead(newsletter_opt_in=True, newsletter_consent_basis="soft_opt_in"), s3) == {"newshash": 1300}
        assert _lead_custom_fields(lead(newsletter_opt_in=True, newsletter_consent_basis="opt_in"), s3) == {"newshash": 1120}

    def test_declined_writes_opted_out_on_any_form_that_asked(self, tmp_path):
        s = make_settings(tmp_path, pipedrive_newsletter_field="newshash", pipedrive_newsletter_option_map={"opted_in": 1120, "opted_out": 1121})
        for form in ("contact", "landowner", "fold", "cpd"):
            assert _lead_custom_fields(lead(form=form, newsletter_opt_in=False, newsletter_consent_basis="declined"), s) == {"newshash": 1121}

    def test_a_form_that_never_asked_writes_nothing(self, tmp_path):
        s = make_settings(tmp_path, pipedrive_newsletter_field="newshash", pipedrive_newsletter_option_map={"opted_in": 1120, "opted_out": 1121})
        for form in ("fold", "cpd"):
            assert _lead_custom_fields(lead(form=form, newsletter_opt_in=False, newsletter_consent_basis=None), s) == {}

    def test_rows_from_before_the_basis_existed_keep_the_old_reading(self, tmp_path):
        s = make_settings(tmp_path, pipedrive_newsletter_field="newshash", pipedrive_newsletter_option_map={"opted_in": 1120, "opted_out": 1121})
        assert _lead_custom_fields(lead(form="contact", newsletter_opt_in=False, newsletter_consent_basis=None), s) == {"newshash": 1121}
        assert _lead_custom_fields(lead(form="landowner", newsletter_opt_in=True, newsletter_consent_basis=None), s) == {"newshash": 1120}


class TestNote:
    def test_the_note_says_how_and_when_the_newsletter_was_answered(self):
        when = datetime(2026, 11, 26, 9, 30, tzinfo=UTC)
        assert "<p><b>Newsletter</b>: added by soft opt-in on 26 Nov 2026 (the “I’d prefer not” box was left unticked)</p>" in build_note_html(
            lead(newsletter_opt_in=True, newsletter_consent_basis="soft_opt_in", newsletter_consent_at=when)
        )
        assert "<p><b>Newsletter</b>: opted in on 26 Nov 2026</p>" in build_note_html(
            lead(newsletter_opt_in=True, newsletter_consent_basis="opt_in", newsletter_consent_at=when)
        )
        assert "<p><b>Newsletter</b>: declined</p>" in build_note_html(lead(newsletter_opt_in=False, newsletter_consent_basis="declined"))
        assert "Newsletter" not in build_note_html(lead(form="cpd", newsletter_opt_in=False, newsletter_consent_basis=None))


CONSENT_FIELDS = dict(
    pipedrive_newsletter_consent_field="consenthash",
    pipedrive_newsletter_consent_option_map={"opt_in": 1, "soft_opt_in": 2, "declined": 3},
    pipedrive_newsletter_consent_date_field="consentdatehash",
)


async def _run(settings, path: str, payload: dict):
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            ac.app = app
            r = await ac.post(path, json=payload)
            assert r.status_code == 202, r.text
            lead_id = r.json()["id"]
    return lead_id


def _existing_person(person_id: int, marketing_status: str | None):
    respx.get(f"{BASE}/api/v2/persons/search").mock(
        return_value=httpx.Response(200, json={"success": True, "data": {"items": [{"item": {"id": person_id}}]}})
    )
    data = {"id": person_id, "name": "Jane"}
    if marketing_status is not None:
        data["marketing_status"] = marketing_status
    get = respx.get(f"{BASE}/api/v2/persons/{person_id}").mock(return_value=httpx.Response(200, json={"success": True, "data": data}))
    patch = respx.patch(f"{BASE}/api/v2/persons/{person_id}").mock(return_value=httpx.Response(200, json={"success": True, "data": data}))
    return get, patch


@respx.mock
async def test_a_new_person_is_subscribed_with_the_consent_record(tmp_path):
    settings = make_settings(tmp_path, **CONSENT_FIELDS)
    routes = mock_pipedrive_happy_path()
    await _run(settings, "/v1/leads/contact", {**PERSON, "newsletter_declined": False})
    body = json.loads(routes["person"].calls.last.request.content)
    assert body["marketing_status"] == "subscribed"
    assert body["custom_fields"]["consenthash"] == 2
    assert body["custom_fields"]["consentdatehash"] == datetime.now(UTC).strftime("%Y-%m-%d")


@respx.mock
async def test_a_new_person_who_declined_is_not_subscribed_but_the_answer_is_recorded(tmp_path):
    settings = make_settings(tmp_path, **CONSENT_FIELDS)
    routes = mock_pipedrive_happy_path()
    await _run(settings, "/v1/leads/contact", {**PERSON, "newsletter_declined": True})
    body = json.loads(routes["person"].calls.last.request.content)
    assert "marketing_status" not in body
    assert body["custom_fields"]["consenthash"] == 3
    assert "consentdatehash" not in body["custom_fields"]


@respx.mock
async def test_without_the_consent_fields_configured_nothing_extra_is_sent(tmp_path):
    settings = make_settings(tmp_path)
    routes = mock_pipedrive_happy_path()
    await _run(settings, "/v1/leads/contact", {**PERSON, "newsletter_declined": False})
    body = json.loads(routes["person"].calls.last.request.content)
    assert body["marketing_status"] == "subscribed"
    assert "custom_fields" not in body


@respx.mock
async def test_soft_opt_in_subscribes_an_existing_person_only_from_no_consent(tmp_path):
    settings = make_settings(tmp_path, **CONSENT_FIELDS)
    mock_pipedrive_happy_path()
    get, patch = _existing_person(42, "no_consent")
    await _run(settings, "/v1/leads/landowner", {**PERSON, "newsletter_declined": False})
    assert get.called
    body = json.loads(patch.calls.last.request.content)
    assert body["marketing_status"] == "subscribed"
    assert body["custom_fields"]["consenthash"] == 2
    assert body["custom_fields"]["consentdatehash"] == datetime.now(UTC).strftime("%Y-%m-%d")


@pytest.mark.parametrize("status", ["unsubscribed", "bounced", "archived", "pending_consent", "subscribed"])
@respx.mock
async def test_soft_opt_in_never_overrides_a_person_who_already_answered(tmp_path, status):
    settings = make_settings(tmp_path, **CONSENT_FIELDS)
    mock_pipedrive_happy_path()
    get, patch = _existing_person(42, status)
    await _run(settings, "/v1/leads/contact", {**PERSON, "phone": "0123", "newsletter_declined": False})
    assert get.called
    bodies = [json.loads(c.request.content) for c in patch.calls]
    assert all("marketing_status" not in b for b in bodies), bodies
    assert all("custom_fields" not in b for b in bodies), bodies
    assert bodies and bodies[0]["phones"][0]["value"] == "0123"  # the phone still lands


@respx.mock
async def test_soft_opt_in_treats_a_person_with_no_status_as_no_consent(tmp_path):
    settings = make_settings(tmp_path)
    mock_pipedrive_happy_path()
    _get, patch = _existing_person(42, None)
    await _run(settings, "/v1/leads/contact", {**PERSON, "newsletter_declined": False})
    assert json.loads(patch.calls.last.request.content)["marketing_status"] == "subscribed"


@respx.mock
async def test_an_express_opt_in_on_an_existing_person_still_subscribes_without_looking(tmp_path):
    settings = make_settings(tmp_path, **CONSENT_FIELDS)
    mock_pipedrive_happy_path()
    get, patch = _existing_person(42, "unsubscribed")
    await _run(settings, "/v1/leads/newsletter", PERSON)
    assert not get.called
    body = json.loads(patch.calls.last.request.content)
    assert body["marketing_status"] == "subscribed"
    assert body["custom_fields"]["consenthash"] == 1


@respx.mock
async def test_a_declined_answer_leaves_an_existing_person_alone(tmp_path):
    settings = make_settings(tmp_path, **CONSENT_FIELDS)
    mock_pipedrive_happy_path()
    get, patch = _existing_person(42, "no_consent")
    await _run(settings, "/v1/leads/contact", {**PERSON, "newsletter_declined": True})
    assert not get.called
    assert not patch.called


@respx.mock
async def test_a_failed_status_lookup_leaves_the_subscription_alone_and_still_files_the_lead(tmp_path):
    """Not knowing is not consent, and a lead must still reach Sales: the
    sync goes on without subscribing, and the row says why."""
    settings = make_settings(tmp_path)
    routes = mock_pipedrive_happy_path()
    get, patch = _existing_person(42, "no_consent")
    get.mock(return_value=httpx.Response(500, json={"success": False}))
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            ac.app = app
            r = await ac.post("/v1/leads/contact", json={**PERSON, "phone": "0123", "newsletter_declined": False})
            assert r.status_code == 202
    async with app.state.sessionmaker() as session:
        from sqlalchemy import select
        stored = (await session.execute(select(Lead))).scalars().one()
    assert stored.sync_status == "synced"
    assert "soft opt-in not applied" in (stored.sync_error or "")
    assert routes["lead"].called and routes["note"].called
    bodies = [json.loads(c.request.content) for c in patch.calls]
    assert bodies and all("marketing_status" not in b for b in bodies)  # the phone still lands, the status does not


# ---- settings ---------------------------------------------------------------


def test_consent_settings_parse_and_warn_when_half_set(monkeypatch, caplog):
    from app.config import Settings

    monkeypatch.setenv("BIOFARM_PIPEDRIVE_NEWSLETTER_CONSENT_OPTION_MAP", '{"opt_in": "1", "soft_opt_in": 2, "declined": 3}')
    s = Settings(_env_file=None)
    assert s.pipedrive_newsletter_consent_option_map == {"opt_in": 1, "soft_opt_in": 2, "declined": 3}
    assert "BIOFARM_PIPEDRIVE_NEWSLETTER_CONSENT_OPTION_MAP is set but BIOFARM_PIPEDRIVE_NEWSLETTER_CONSENT_FIELD is not" in caplog.text


def test_a_soft_opt_in_option_on_the_sign_up_field_is_optional(monkeypatch, caplog):
    from app.config import Settings

    monkeypatch.setenv("BIOFARM_PIPEDRIVE_NEWSLETTER_FIELD", "a" * 40)
    monkeypatch.setenv("BIOFARM_PIPEDRIVE_NEWSLETTER_OPTION_MAP", '{"opted_in": 1120, "opted_out": 1121}')
    s = Settings(_env_file=None)
    assert s.pipedrive_newsletter_option_map == {"opted_in": 1120, "opted_out": 1121}
    assert "lacks" not in caplog.text
    monkeypatch.setenv("BIOFARM_PIPEDRIVE_NEWSLETTER_OPTION_MAP", '{"opted_in": 1120, "opted_out": 1121, "soft_opt_in": 1300}')
    assert Settings(_env_file=None).pipedrive_newsletter_option_map["soft_opt_in"] == 1300


# ---- migration --------------------------------------------------------------


def test_consent_columns_come_and_go_with_their_migration(tmp_path, monkeypatch):
    db_path = tmp_path / "mig.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    cfg = Config(str(ALEMBIC_INI))
    command.upgrade(cfg, "head")

    def cols() -> set[str]:
        return {row[1] for row in sqlite3.connect(db_path).execute("PRAGMA table_info(leads)")}

    assert {"newsletter_consent_basis", "newsletter_consent_at"} <= cols()
    command.downgrade(cfg, "b2c4d6e8f0a1")
    assert not ({"newsletter_consent_basis", "newsletter_consent_at"} & cols())
    command.upgrade(cfg, "head")
    assert {"newsletter_consent_basis", "newsletter_consent_at"} <= cols()
