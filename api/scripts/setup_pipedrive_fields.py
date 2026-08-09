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

# attribution key -> (Pipedrive field label, field type). referrer and
# landing_page can be up to 2048 chars, beyond varchar's 255 limit.
FIELDS = {
    "utm_source": ("UTM Source", "varchar"),
    "utm_medium": ("UTM Medium", "varchar"),
    "utm_campaign": ("UTM Campaign", "varchar"),
    "utm_term": ("UTM Term", "varchar"),
    "utm_content": ("UTM Content", "varchar"),
    "gclid": ("Google Ads Click ID", "varchar"),
    "fbclid": ("Facebook Click ID", "varchar"),
    "msclkid": ("Microsoft Click ID", "varchar"),
    "referrer": ("Referrer", "text"),
    "landing_page": ("Landing Page", "text"),
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
                        f"{field_type} — rename/delete it in Pipedrive and re-run"
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


if __name__ == "__main__":
    main()
