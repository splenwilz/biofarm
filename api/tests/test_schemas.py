import pytest
from pydantic import ValidationError

from app.schemas import Attribution, ContactSubmission, NewsletterSubmission


def test_minimal_contact_submission():
    s = ContactSubmission(name="Jane Doe", email="jane@example.com")
    assert s.name == "Jane Doe"
    assert s.website == ""  # honeypot defaults empty
    assert s.fields == []
    assert s.newsletter_opt_in is False


def test_invalid_email_rejected():
    with pytest.raises(ValidationError):
        ContactSubmission(name="Jane", email="not-an-email")


def test_blank_name_rejected():
    with pytest.raises(ValidationError):
        ContactSubmission(name="   ", email="jane@example.com")


def test_name_is_stripped():
    s = ContactSubmission(name="  Jane  ", email="jane@example.com")
    assert s.name == "Jane"


def test_unknown_field_value_rejected():
    with pytest.raises(ValidationError):
        ContactSubmission(name="J", email="j@e.com", fields=["alien"])


def test_message_length_capped():
    with pytest.raises(ValidationError):
        ContactSubmission(name="J", email="j@e.com", message="x" * 5001)


def test_extra_keys_ignored():
    s = ContactSubmission(name="J", email="j@e.com", totally_unknown="x")
    assert not hasattr(s, "totally_unknown")


def test_full_contact_submission_with_attribution():
    s = ContactSubmission(
        name="Jane",
        email="jane@example.com",
        phone="+44 1234 567890",
        fields=["developer", "other"],
        message="Hello",
        newsletter_opt_in=True,
        page="/contact",
        fill_ms=12000,
        ga_client_id="123.456",
        ga_session_id="789",
        attribution=Attribution(utm_source="newsletter", gclid="abc"),
        first_touch=Attribution(utm_source="google", referrer="https://g.co"),
    )
    assert s.attribution.utm_source == "newsletter"
    assert s.first_touch.referrer == "https://g.co"


def test_fields_list_length_capped():
    with pytest.raises(ValidationError):
        ContactSubmission(name="J", email="j@e.com", fields=["developer"] * 11)


def test_newsletter_submission_single_field():
    s = NewsletterSubmission(name="J", email="j@e.com", field="landowner")
    assert s.field == "landowner"
    with pytest.raises(ValidationError):
        NewsletterSubmission(name="J", email="j@e.com", field="alien")
