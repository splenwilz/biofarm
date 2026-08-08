"""One-off bootstrap: create the attribution custom fields in Pipedrive and
print the JSON for the BIOFARM_PIPEDRIVE_LEAD_FIELD_MAP env var.

Leads inherit deal custom fields, so these are created via the Deal Fields API.

Usage:
    PIPEDRIVE_COMPANY_DOMAIN=biofarm PIPEDRIVE_API_TOKEN=xxx \
        uv run python scripts/setup_pipedrive_fields.py
"""

import json
import os
import sys

import httpx

FIELDS = {
    "utm_source": "UTM Source",
    "utm_medium": "UTM Medium",
    "utm_campaign": "UTM Campaign",
    "utm_term": "UTM Term",
    "utm_content": "UTM Content",
    "gclid": "Google Ads Click ID",
    "referrer": "Referrer",
    "landing_page": "Landing Page",
}


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
        for field in resp.json().get("data") or []:
            if field.get("field_name"):
                existing[field["field_name"]] = field["field_code"]

        field_map: dict[str, str] = {}
        for attr_key, label in FIELDS.items():
            if label in existing:
                field_map[attr_key] = existing[label]
                print(f"exists  {label}: {existing[label]}")
                continue
            resp = client.post(
                f"{base}/api/v2/dealFields",
                json={"field_name": label, "field_type": "varchar"},
            )
            resp.raise_for_status()
            key = resp.json()["data"]["field_code"]
            field_map[attr_key] = key
            print(f"created {label}: {key}")

    print("\nSet this on the Render service:")
    print(f"BIOFARM_PIPEDRIVE_LEAD_FIELD_MAP={json.dumps(field_map)}")


if __name__ == "__main__":
    main()
