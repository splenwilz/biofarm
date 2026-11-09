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


def test_the_heard_about_answers_each_have_a_label():
    from typing import get_args

    from app.schemas import HEARD_ABOUT_LABELS, HeardAbout
    assert set(HEARD_ABOUT_LABELS) == set(get_args(HeardAbout))
    assert all(HEARD_ABOUT_LABELS[k] for k in HEARD_ABOUT_LABELS)


def test_contact_submission_tidies_the_other_box_and_ties_it_to_other():
    from app.schemas import ContactSubmission

    base = {"name": "J", "email": "j@e.com"}
    assert ContactSubmission(**base, heard_about="other", heard_about_other="  Radio 4 ").heard_about_other == "Radio 4"
    assert ContactSubmission(**base, heard_about="other", heard_about_other="   ").heard_about_other is None
    assert ContactSubmission(**base, heard_about="other").heard_about_other is None
    # the field validator empties the box before the model validator looks at it
    assert ContactSubmission(**base, heard_about="search", heard_about_other="   ").heard_about_other is None
    with pytest.raises(ValidationError):
        ContactSubmission(**base, heard_about="search", heard_about_other="Radio 4")
    with pytest.raises(ValidationError):
        ContactSubmission(**base, heard_about_other="Radio 4")


def test_the_i_am_a_choices_cover_the_five_roles_and_each_has_a_label():
    from typing import get_args

    from app.schemas import (
        FIELD_LABELS,
        ContactSubmission,
        FieldChoice,
        NewsletterSubmission,
    )
    assert get_args(FieldChoice) == ("developer", "planning_consultant", "ecologist", "landowner", "other")
    assert set(FIELD_LABELS) == set(get_args(FieldChoice))
    assert FIELD_LABELS["planning_consultant"] == "Planning consultant"
    # the old values still work, so landowner routing and the dashboard's audience split are untouched
    assert ContactSubmission(name="J", email="j@e.com", fields=["landowner", "ecologist"]).fields == ["landowner", "ecologist"]
    assert NewsletterSubmission(name="J", email="j@e.com", field="planning_consultant").field == "planning_consultant"
    with pytest.raises(ValidationError):
        ContactSubmission(name="J", email="j@e.com", fields=["architect"])


def test_the_heard_about_answers_are_the_agreed_nine():
    from typing import get_args

    from app.schemas import HEARD_ABOUT_LABELS, HeardAbout
    assert get_args(HeardAbout) == ("search", "linkedin", "referral", "event", "newsletter", "press", "marketplace", "ai", "other")
    assert HEARD_ABOUT_LABELS["search"] == "Search engine"
    assert HEARD_ABOUT_LABELS["marketplace"] == "BNG marketplace or listing site"
    assert HEARD_ABOUT_LABELS["ai"] == "AI assistant (like ChatGPT)"
