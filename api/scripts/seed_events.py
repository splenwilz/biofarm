"""Seed the marketing_events table with the events Pipedrive's history shows
(see app/reporting/event_seed.py), so the dashboard's Events page starts with
them and Vix only adds costs.

Usage:
    uv run python scripts/seed_events.py                 # insert what is missing
    uv run python scripts/seed_events.py --dry-run       # say what would change
    uv run python scripts/seed_events.py --update-match  # also refresh match rules and dates of existing seed events

Reads DATABASE_URL and the BIOFARM_PIPEDRIVE_* settings (lead label names are
resolved to ids with one read-only GET). Costs, attendees and notes already
entered are never touched.
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.config import Settings
from app.db import make_engine
from app.mirror.reader import MirrorError, PipedriveReader
from app.reporting.event_seed import apply_seed


async def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--update-match", action="store_true")
    args = parser.parse_args(argv)
    settings = Settings()
    domain, token = settings.pipedrive_company_domain, settings.pipedrive_api_token.get_secret_value()
    if not domain or not token:
        print("Set BIOFARM_PIPEDRIVE_COMPANY_DOMAIN and BIOFARM_PIPEDRIVE_API_TOKEN", file=sys.stderr)
        return 2
    try:
        async with PipedriveReader(company_domain=domain, api_token=token) as reader:
            labels = {row["name"]: row["id"] for row in (await reader.get("/api/v1/leadLabels")).get("data") or []}
    except MirrorError as exc:
        print(f"could not read lead labels: {exc}", file=sys.stderr)
        return 1
    engine = make_engine(settings.database_url)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            result = await apply_seed(session, labels, update_match=args.update_match, dry_run=args.dry_run)
    finally:
        await engine.dispose()
    verb = "would create" if args.dry_run else "created"
    print(f"{verb}: {len(result.created)}  updated: {len(result.updated)}  unchanged: {len(result.unchanged)}")
    for name in result.created:
        print(f"  + {name}")
    for name in result.updated:
        print(f"  ~ {name}")
    for item in result.unknown_labels:
        print(f"  ! lead label not found in Pipedrive: {item}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
