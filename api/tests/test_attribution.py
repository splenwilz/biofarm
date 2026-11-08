"""source_label(): the short "source/medium" string stamped on every Pipedrive
lead as its Source channel ID, so the team (and the dashboard) can read where
an enquiry came from without opening the note."""

import pytest

from app.services.attribution import source_label, touch_label

# ---- one touch ---------------------------------------------------------------

@pytest.mark.parametrize(
    ("touch", "expected"),
    [
        ({"utm_source": "bing", "utm_medium": "cpc"}, "bing/cpc"),
        ({"utm_source": "newsletter"}, "newsletter"),
        ({"utm_medium": "email"}, "(not set)/email"),
        # click ids identify the platform when no UTM was carried
        ({"gclid": "EAIaIQob"}, "google/cpc"),
        ({"msclkid": "9206b90d"}, "bing/cpc"),
        ({"fbclid": "IwAR"}, "facebook/social"),
        # referrer host, without scheme, www., port or path
        ({"referrer": "https://www.google.com/"}, "google.com/referral"),
        ({"referrer": "https://Bing.COM:443/search?q=bng"}, "bing.com/referral"),
        ({"referrer": "android-app://com.linkedin.android/"}, "com.linkedin.android/referral"),
        # nothing usable
        ({}, "direct"),
        (None, "direct"),
        ({"landing_page": "/contact"}, "direct"),
        ({"referrer": "not a url"}, "direct"),
        ({"referrer": ""}, "direct"),
    ],
)
def test_single_touch_labels(touch, expected):
    assert source_label(touch, None) == expected


def test_utm_beats_click_id_beats_referrer():
    touch = {
        "utm_source": "linkedin",
        "utm_medium": "paid-social",
        "gclid": "x",
        "referrer": "https://www.google.com/",
    }
    assert source_label(touch, None) == "linkedin/paid-social"
    assert source_label({"gclid": "x", "referrer": "https://www.google.com/"}, None) == "google/cpc"


def test_values_are_normalised():
    # case, surrounding whitespace, and a slash inside a value (it is the separator)
    assert source_label({"utm_source": "  Google ", "utm_medium": "CPC"}, None) == "google/cpc"
    assert source_label({"utm_source": "a/b", "utm_medium": "c"}, None) == "a-b/c"
    assert source_label({"utm_source": "   ", "gclid": "x"}, None) == "google/cpc"


def test_self_referral_is_not_a_source():
    # a visitor navigating from one biofarm.co.uk page to another is not a referral
    assert source_label({"referrer": "https://www.biofarm.co.uk/stories"}, None) == "direct"
    assert source_label({"referrer": "https://biofarm.co.uk/"}, {"gclid": "x"}) == "google/cpc"


def test_label_is_bounded():
    label = source_label({"utm_source": "s" * 500, "utm_medium": "m" * 500}, None)
    assert len(label) <= 100
    assert "/" in label


# ---- last touch, then first touch ---------------------------------------------

def test_last_touch_wins_when_it_has_a_source():
    last = {"utm_source": "newsletter", "utm_medium": "email"}
    first = {"gclid": "x"}
    assert source_label(last, first) == "newsletter/email"


def test_direct_last_touch_falls_back_to_first_touch():
    # last non-direct click: a return visit typed in directly keeps the
    # campaign that first brought the person to the site
    assert source_label({}, {"utm_source": "bing", "utm_medium": "cpc"}) == "bing/cpc"
    assert source_label(None, {"referrer": "https://t.co/abc"}) == "t.co/referral"
    assert source_label(None, None) == "direct"
    assert source_label({}, {}) == "direct"


def test_touch_label_is_the_same_rule_for_one_touch_without_the_direct_fallback():
    """The mirror reads a lead's UTM Source, UTM Medium and Referrer fields back
    through the same rules; nothing known gives None, not "direct", so the
    dashboard can still say the source was not tracked."""
    assert touch_label({"utm_source": "bing", "utm_medium": "cpc"}) == "bing/cpc"
    assert touch_label({"utm_source": "Google", "utm_medium": None}) == "google"
    assert touch_label({"referrer": "https://www.google.com/"}) == "google.com/referral"
    assert touch_label({"referrer": "https://www.biofarm.co.uk/contact"}) is None
    assert touch_label({}) is None
    assert touch_label(None) is None
