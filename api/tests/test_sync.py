from app.models import Lead
from app.services.sync import _lead_custom_fields
from tests.conftest import make_settings


def lead(**over) -> Lead:
    base = {"form": "contact", "name": "J", "email": "j@example.com", "newsletter_opt_in": False, "attribution": None, "first_touch": None}
    base.update(over)
    return Lead(**base)


NEWSLETTER = {"pipedrive_newsletter_field": "newshash", "pipedrive_newsletter_option_map": {"opted_in": 1120, "opted_out": 1121}}


class TestNewsletterSignUpField:
    """The old Pipedrive embeds wrote the "Newsletter Sign Up" lead field (an
    option field: Opted In / Opted Out) on every submission of a form that
    asked. Ours do the same, so the team's Pipedrive filters keep working."""

    def test_a_ticked_box_is_opted_in_and_an_unticked_one_opted_out(self, tmp_path):
        s = make_settings(tmp_path, **NEWSLETTER)
        assert _lead_custom_fields(lead(form="contact", newsletter_opt_in=True), s) == {"newshash": 1120}
        assert _lead_custom_fields(lead(form="contact", newsletter_opt_in=False), s) == {"newshash": 1121}
        assert _lead_custom_fields(lead(form="landowner", newsletter_opt_in=True), s) == {"newshash": 1120}
        assert _lead_custom_fields(lead(form="landowner", newsletter_opt_in=False), s) == {"newshash": 1121}
        assert _lead_custom_fields(lead(form="newsletter", newsletter_opt_in=True), s) == {"newshash": 1120}

    def test_forms_that_never_ask_write_nothing(self, tmp_path):
        s = make_settings(tmp_path, **NEWSLETTER)
        assert _lead_custom_fields(lead(form="cpd"), s) == {}
        assert _lead_custom_fields(lead(form="fold"), s) == {}

    def test_nothing_is_written_until_the_field_is_configured(self, tmp_path):
        assert _lead_custom_fields(lead(newsletter_opt_in=True), make_settings(tmp_path)) == {}
        half = make_settings(tmp_path, pipedrive_newsletter_field="newshash", pipedrive_newsletter_option_map={"opted_in": 1120})
        assert _lead_custom_fields(lead(newsletter_opt_in=True), half) == {"newshash": 1120}
        assert _lead_custom_fields(lead(newsletter_opt_in=False), half) == {}

    def test_sits_beside_the_attribution_fields(self, tmp_path):
        s = make_settings(tmp_path, pipedrive_lead_field_map={"utm_source": "srchash"}, **NEWSLETTER)
        out = _lead_custom_fields(lead(newsletter_opt_in=True, attribution={"utm_source": "google"}), s)
        assert out == {"srchash": "google", "newshash": 1120}
