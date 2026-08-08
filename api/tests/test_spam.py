from app.schemas import ContactSubmission
from app.services.spam import evaluate_spam


def make(**kw):
    base = dict(name="Jane", email="jane@example.com")
    base.update(kw)
    return ContactSubmission(**base)


def test_clean_submission_passes():
    v = evaluate_spam(make(fill_ms=10_000), min_fill_seconds=3.0)
    assert not v.is_spam
    assert v.reasons == []


def test_filled_honeypot_is_spam():
    v = evaluate_spam(make(website="https://spam.example"), min_fill_seconds=3.0)
    assert v.is_spam
    assert "honeypot" in v.reasons


def test_too_fast_fill_is_spam():
    v = evaluate_spam(make(fill_ms=1_500), min_fill_seconds=3.0)
    assert v.is_spam
    assert "too_fast" in v.reasons


def test_whitespace_only_honeypot_is_still_spam():
    v = evaluate_spam(make(website="   "), min_fill_seconds=3.0)
    assert v.is_spam
    assert "honeypot" in v.reasons


def test_missing_timer_is_not_spam():
    # JS may be blocked or fail — absence of the timer must not punish real users
    v = evaluate_spam(make(), min_fill_seconds=3.0)
    assert not v.is_spam
