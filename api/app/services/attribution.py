"""Turn a captured touch (UTM parameters, click ids, referrer) into the short
"source/medium" label stamped on each Pipedrive lead as its Source channel ID.

The label is for people reading the lead list and for grouping in reporting;
the full attribution still goes into the lead's custom fields and note. The
rules follow the usual analytics convention: an explicit UTM tag wins, then a
paid click id identifies the platform, then the referring site, else direct.
Last touch is used when it names a source; otherwise the first touch is, so a
return visit typed in directly keeps the campaign that first brought the
person here ("last non-direct click").
"""

from collections.abc import Mapping
from urllib.parse import urlsplit

DIRECT = "direct"
NOT_SET = "(not set)"
MAX_LABEL = 100
_MAX_PART = 48

# Clicks arriving from the site's own pages are navigation, not a referral.
SELF_HOSTS = frozenset({"biofarm.co.uk"})

# click-id parameter -> (source, medium), in priority order
_CLICK_IDS = (
    ("gclid", ("google", "cpc")),
    ("msclkid", ("bing", "cpc")),
    ("fbclid", ("facebook", "social")),
)


def _part(value: object) -> str | None:
    """A lower-cased, trimmed label part with the separator character removed;
    None when there is nothing in it."""
    if value is None:
        return None
    text = " ".join(str(value).split()).lower().replace("/", "-")
    return text[:_MAX_PART] or None


def _referrer_host(referrer: object) -> str | None:
    if not referrer:
        return None
    try:
        host = urlsplit(str(referrer).strip()).hostname or ""
    except ValueError:
        return None
    host = host.lower().removeprefix("www.")
    if not host or host in SELF_HOSTS or host.endswith(tuple(f".{h}" for h in SELF_HOSTS)):
        return None
    return host


def _label(touch: Mapping[str, object] | None) -> str | None:
    if not touch:
        return None
    source, medium = _part(touch.get("utm_source")), _part(touch.get("utm_medium"))
    if source and medium:
        return f"{source}/{medium}"
    if source:
        return source
    if medium:
        return f"{NOT_SET}/{medium}"
    for key, (src, med) in _CLICK_IDS:
        if touch.get(key):
            return f"{src}/{med}"
    host = _referrer_host(touch.get("referrer"))
    if host:
        return f"{_part(host)}/referral"
    return None


def touch_label(touch: Mapping[str, object] | None) -> str | None:
    """'source/medium' for one touch by the rules above, or None when it says
    nothing: used to read a Pipedrive record's UTM Source, UTM Medium and
    Referrer fields back when our own website record is not to hand."""
    label = _label(touch)
    return label[:MAX_LABEL] if label else None


def source_label(
    last_touch: Mapping[str, object] | None,
    first_touch: Mapping[str, object] | None,
) -> str:
    """'source/medium' for the enquiry, never empty, at most MAX_LABEL chars."""
    for touch in (last_touch, first_touch):
        label = _label(touch)
        if label:
            return label[:MAX_LABEL]
    return DIRECT
