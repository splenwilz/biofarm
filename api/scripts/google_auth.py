"""One-off: sign in to Google once and print the refresh token the dashboard will
use for Google Ads, GA4 (Analytics Data API) and Search Console. No reporting here.

What it does
  1. Reads GOOGLE_CLIENT_SECRETS_FILE from the environment or api/.env: the path to
     the Desktop-app OAuth client JSON downloaded from the "Biofarm reporting"
     Cloud project. That file is never committed (see .gitignore).
  2. Runs the installed-app flow: opens the browser for a Google sign-in, catches
     the redirect on a local port, asks for offline access so a refresh token comes
     back, and forces the consent screen so Google issues one even if this account
     has approved the client before.
  3. Checks every requested scope was actually granted (the consent screen lets a
     user untick some), then prints the three values to put in the environment.

Run from api/ (no project dependency added for a one-off; uv fetches the library
into a throwaway environment):

    uv run --with google-auth-oauthlib python scripts/google_auth.py

Sign in with the Gmail that has read-only access to Biofarm's Ads, GA4 and
Search Console. The token is printed once; it is not written anywhere.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = [
    "https://www.googleapis.com/auth/adwords",
    "https://www.googleapis.com/auth/analytics.readonly",
    "https://www.googleapis.com/auth/webmasters.readonly",
]

API_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = API_DIR / ".env"


def read_env_var(name: str) -> str | None:
    """The process environment wins; otherwise a plain KEY=VALUE line in api/.env."""
    if os.environ.get(name):
        return os.environ[name]
    if not ENV_FILE.exists():
        return None
    for raw in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        if key.strip() == name:
            return value.strip().strip("'\"") or None
    return None


def main() -> int:
    secrets_path = read_env_var("GOOGLE_CLIENT_SECRETS_FILE")
    if not secrets_path:
        print(
            "GOOGLE_CLIENT_SECRETS_FILE is not set. Put the downloaded OAuth client JSON\n"
            "somewhere outside git (e.g. api/secrets/google-client.json) and add to api/.env:\n"
            "    GOOGLE_CLIENT_SECRETS_FILE=secrets/google-client.json",
            file=sys.stderr,
        )
        return 2

    secrets_file = Path(secrets_path)
    if not secrets_file.is_absolute():
        secrets_file = API_DIR / secrets_file
    if not secrets_file.exists():
        print(f"Client secrets file not found: {secrets_file}", file=sys.stderr)
        return 2

    client = json.loads(secrets_file.read_text(encoding="utf-8"))
    if "installed" not in client:
        print(
            "This JSON is not a Desktop-app OAuth client (no 'installed' key). The flow\n"
            "below needs the Desktop type; a Web client would redirect to the wrong place.",
            file=sys.stderr,
        )
        return 2

    flow = InstalledAppFlow.from_client_secrets_file(str(secrets_file), scopes=SCOPES)
    print("Opening the browser for Google sign-in. Use the Gmail with the read-only grants.")
    credentials = flow.run_local_server(
        port=0,  # any free port; Google allows loopback redirects for Desktop clients
        access_type="offline",  # ask for a refresh token, not just a short-lived access token
        prompt="consent",  # force the consent screen so the refresh token is issued again
        open_browser=True,
    )

    granted = set(credentials.scopes or [])
    missing = [s for s in SCOPES if s not in granted]
    if missing:
        print("\nSign-in finished but these scopes were NOT granted (unticked on the consent screen?):")
        for s in missing:
            print(f"  - {s}")
        print("Run again and leave every box ticked.", file=sys.stderr)
        return 1

    if not credentials.refresh_token:
        print(
            "\nGoogle returned no refresh token. That happens when the consent screen was\n"
            "skipped. Remove this app's access at https://myaccount.google.com/permissions\n"
            "and run again.",
            file=sys.stderr,
        )
        return 1

    print("\nAll three scopes granted. Set these in api/.env locally and in the Render service's")
    print("environment. They are shown once and not saved anywhere by this script.\n")
    print(f"GOOGLE_CLIENT_ID={credentials.client_id}")
    print(f"GOOGLE_CLIENT_SECRET={credentials.client_secret}")
    print(f"GOOGLE_REFRESH_TOKEN={credentials.refresh_token}")
    print(
        "\nKeep these out of chat, tickets and commits. The refresh token stays valid while\n"
        "it is used (it lapses after six months unused) and until the Gmail revokes the app,\n"
        "so one sign-in is enough - PROVIDED the OAuth consent screen's publishing status is\n"
        "'In production'. While it is 'Testing', Google expires the token after 7 days."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
