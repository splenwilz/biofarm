"""Pull Google Ads, GA4 and Search Console into the daily tables (read-only; see app/google).

Usage:
    uv run python scripts/import_google.py              # the trailing window (35 days), or a backfill if the tables are empty
    uv run python scripts/import_google.py --days 480   # re-read this many days ending yesterday
    uv run python scripts/import_google.py --dry-run    # read and count, write nothing

Reads DATABASE_URL, GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN
and the source ids (GOOGLE_ADS_CUSTOMER_ID, GA4_PROPERTY_ID, SEARCH_CONSOLE_SITE_URL)
from the environment or .env. Secrets are never printed. Exit code 1 when every
source failed (the run row in google_import_runs records the error); a run
where one source failed exits 0 with the failure named on stderr. Exit code 3
when another import is still running (the web app runs one on its timer).
"""

import argparse
import asyncio
import logging
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # run from anywhere; `app` is the project package

import httpx
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.config import Settings
from app.db import make_engine
from app.google.auth import GoogleAuthError, GoogleToken
from app.google.http import GoogleApiError
from app.google.importer import GoogleImportInProgress, build_sources, run_google_import


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--days", type=int, default=None, help="days to re-read ending yesterday (default: the configured window, or the backfill when the tables are empty)")
    parser.add_argument("--dry-run", action="store_true", help="read and count, write nothing")
    parser.add_argument("--log-level", default="INFO", choices=["DEBUG", "INFO", "WARNING", "ERROR"])
    return parser.parse_args(argv)


async def dry_run(settings: Settings, days: int) -> int:
    end = datetime.now(UTC).date() - timedelta(days=1)
    start = end - timedelta(days=days - 1)
    async with httpx.AsyncClient() as http:
        token = GoogleToken(http, client_id=settings.google_client_id or "", client_secret=settings.google_client_secret.get_secret_value(), refresh_token=settings.google_refresh_token.get_secret_value())
        sources = build_sources(http, token, settings)
        for name, pull in (("google_ads", sources.ads and sources.ads.campaign_daily), ("ga4 channels", sources.ga4 and sources.ga4.sessions_by_channel),
                           ("ga4 sources", sources.ga4 and sources.ga4.sessions_by_source), ("ga4 key events", sources.ga4 and sources.ga4.key_events_by_name),
                           ("search_console", sources.gsc and sources.gsc.daily)):
            if pull is None:
                print(f"{name}: not configured")
                continue
            rows = await pull(start, end)
            print(f"{name}: {len(rows)} rows for {start} to {end}")
    return 0


async def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(level=args.log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    settings = Settings()
    if not settings.google_enabled:
        print("Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN and at least one of GOOGLE_ADS_CUSTOMER_ID, GA4_PROPERTY_ID, SEARCH_CONSOLE_SITE_URL", file=sys.stderr)
        return 2
    try:
        if args.dry_run:
            return await dry_run(settings, args.days or settings.google_import_window_days)
        engine = make_engine(settings.database_url)
        try:
            async with engine.connect() as conn:
                has_tables = await conn.run_sync(lambda sync_conn: inspect(sync_conn).has_table("google_import_runs"))
            if not has_tables:
                print("The Google tables are missing: run `uv run alembic upgrade head` first", file=sys.stderr)
                return 2
            sessions = async_sessionmaker(engine, expire_on_commit=False)
            window = args.days or settings.google_import_window_days
            backfill = args.days or settings.google_backfill_days
            async with httpx.AsyncClient() as http:
                token = GoogleToken(http, client_id=settings.google_client_id or "", client_secret=settings.google_client_secret.get_secret_value(), refresh_token=settings.google_refresh_token.get_secret_value())
                result = await run_google_import(sessions, build_sources(http, token, settings), window_days=window, backfill_days=backfill)
        finally:
            await engine.dispose()
    except (GoogleAuthError, GoogleApiError) as exc:
        print(f"import failed: {exc}", file=sys.stderr)
        return 1
    except GoogleImportInProgress as exc:
        print(f"not started: {exc} (the web app may be running one on its timer)", file=sys.stderr)
        return 3
    print(f"{result.status}: {result.window_start} to {result.window_end}: " + ", ".join(f"{k}={'failed' if v is None else v}" for k, v in result.counts.items()))
    for note in result.notes:
        print(f"note: {note}", file=sys.stderr)
    if result.error:
        print(result.error, file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
