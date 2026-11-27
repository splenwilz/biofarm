"""One-off bootstrap: create the attribution custom fields in Pipedrive and
print the JSON for the BIOFARM_PIPEDRIVE_LEAD_FIELD_MAP env var, plus the
BIOFARM_PIPEDRIVE_NEWSLETTER_* and BIOFARM_PIPEDRIVE_HEARD_ABOUT_* values
read from the team's existing "Newsletter Sign Up" and "How they heard"
fields (never created here - the old web forms and Sales made them).

Leads inherit deal custom fields, so these are created via the Deal Fields API.

Usage:
    PIPEDRIVE_COMPANY_DOMAIN=biofarm PIPEDRIVE_API_TOKEN=xxx \
        uv run python scripts/setup_pipedrive_fields.py
"""

import json
import os
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # run from anywhere; `app` is the project package

from app.schemas import HEARD_ABOUT_LABELS  # noqa: E402

# attribution key -> (Pipedrive field label, field type). referrer and
# landing_page can be up to 2048 chars, beyond varchar's 255 limit.
FIELDS = {
    "utm_source": ("UTM Source", "varchar"),
    "utm_medium": ("UTM Medium", "varchar"),
    "utm_campaign": ("UTM Campaign", "varchar"),
    "utm_term": ("UTM Term", "varchar"),
    "utm_content": ("UTM Content", "varchar"),
    "gclid": ("Google Ads Click ID", "varchar"),
    "gbraid": ("Google Ads gbraid", "varchar"),
    "wbraid": ("Google Ads wbraid", "varchar"),
    "fbclid": ("Facebook Click ID", "varchar"),
    "msclkid": ("Microsoft Click ID", "varchar"),
    "referrer": ("Referrer", "text"),
    "landing_page": ("Landing Page", "text"),
}


NEWSLETTER_FIELD = "Newsletter Sign Up"
NEWSLETTER_OPTIONS = {"Opted In": "opted_in", "Opted Out": "opted_out"}


def newsletter_settings(fields: list[dict]) -> list[str]:
    """The env lines for the Newsletter Sign Up field, from GET /dealFields
    data, or one line saying why there are none."""
    field = next((f for f in fields if f.get("field_name") == NEWSLETTER_FIELD), None)
    if field is None:
        return [f"{NEWSLETTER_FIELD} field not found in Pipedrive; leave BIOFARM_PIPEDRIVE_NEWSLETTER_FIELD unset"]
    labels = {o.get("label"): o.get("id") for o in field.get("options") or []}
    option_map = {key: labels[label] for label, key in NEWSLETTER_OPTIONS.items() if label in labels}
    if len(option_map) != len(NEWSLETTER_OPTIONS):
        found = ", ".join(str(label) for label in labels) or "none"
        return [
            (
                f"{NEWSLETTER_FIELD} field {field['field_code']} has no 'Opted In' / 'Opted Out' options "
                f"(found: {found}); set the option map by hand"
            )
        ]
    return [
        f"BIOFARM_PIPEDRIVE_NEWSLETTER_FIELD={field['field_code']}",
        f"BIOFARM_PIPEDRIVE_NEWSLETTER_OPTION_MAP={json.dumps(option_map)}",
    ]


HEARD_ABOUT_FIELD = "How they heard"


def heard_about_settings(fields: list[dict]) -> list[str]:
    """The env lines for the "How they heard" field Sales added on 17 Nov
    2026, matching its options to the contact form's answers by the labels
    the form shows (schemas.HEARD_ABOUT_LABELS), or one line saying why there
    are none. An option the field lacks is named: that answer stays in the note."""
    field = next((f for f in fields if f.get("field_name") == HEARD_ABOUT_FIELD), None)
    if field is None:
        return [f"{HEARD_ABOUT_FIELD} field not found in Pipedrive; leave BIOFARM_PIPEDRIVE_HEARD_ABOUT_FIELD unset"]
    labels = {o.get("label"): o.get("id") for o in field.get("options") or []}
    option_map = {key: labels[label] for key, label in HEARD_ABOUT_LABELS.items() if label in labels}
    lines = [
        f"BIOFARM_PIPEDRIVE_HEARD_ABOUT_FIELD={field['field_code']}",
        f"BIOFARM_PIPEDRIVE_HEARD_ABOUT_OPTION_MAP={json.dumps(option_map)}",
    ]
    missing = [label for key, label in HEARD_ABOUT_LABELS.items() if key not in option_map]
    if missing:
        found = ", ".join(str(label) for label in labels) or "none"
        lines.append(f"{HEARD_ABOUT_FIELD} field {field['field_code']} has no option labelled {', '.join(repr(m) for m in missing)} (found: {found}); those answers stay in the note only")
    return lines


def main() -> None:
    domain = os.environ.get("PIPEDRIVE_COMPANY_DOMAIN")
    token = os.environ.get("PIPEDRIVE_API_TOKEN")
    if not domain or not token:
        sys.exit("Set PIPEDRIVE_COMPANY_DOMAIN and PIPEDRIVE_API_TOKEN")

    base = f"https://{domain}.pipedrive.com"
    headers = {"x-api-token": token}
    with httpx.Client(headers=headers, timeout=30) as client:
        existing = {}
        resp = client.get(f"{base}/api/v2/dealFields", params={"limit": 500})
        resp.raise_for_status()
        all_fields = resp.json().get("data") or []
        for field in all_fields:
            if field.get("field_name"):
                existing[field["field_name"]] = (
                    field["field_code"],
                    field.get("field_type"),
                )

        field_map: dict[str, str] = {}
        for attr_key, (label, field_type) in FIELDS.items():
            if label in existing:
                code, existing_type = existing[label]
                if existing_type and existing_type != field_type:
                    # e.g. Referrer created as varchar (255) but we need text
                    print(
                        f"SKIP    {label}: exists as {existing_type}, wanted "
                        f"{field_type} - rename/delete it in Pipedrive and re-run"
                    )
                    continue
                field_map[attr_key] = code
                print(f"exists  {label}: {code}")
                continue
            resp = client.post(
                f"{base}/api/v2/dealFields",
                json={"field_name": label, "field_type": field_type},
            )
            resp.raise_for_status()
            key = resp.json()["data"]["field_code"]
            field_map[attr_key] = key
            print(f"created {label}: {key}")

    print("\nSet this on the Render service:")
    print(f"BIOFARM_PIPEDRIVE_LEAD_FIELD_MAP={json.dumps(field_map)}")
    for line in newsletter_settings(all_fields) + heard_about_settings(all_fields):
        print(line)


if __name__ == "__main__":
    main()
