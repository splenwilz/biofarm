"""Pull the Pipedrive account into the mirror tables (read-only; see app/mirror).

Usage:
    uv run python scripts/import_pipedrive.py            # changes since the last good run
    uv run python scripts/import_pipedrive.py --full     # everything, changelogs and marketing histories included
    uv run python scripts/import_pipedrive.py --dry-run  # read and count, write nothing

Reads DATABASE_URL and the BIOFARM_PIPEDRIVE_* settings from the environment
(or .env). The token is never printed. Exit code 1 when Pipedrive could not be
read; the run row in pd_import_runs records the error. Exit code 3 when
another import is still running (the web app may be running one on its timer).
"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # run from anywhere; `app` is the project package

from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.config import Settings
from app.db import make_engine
from app.mirror.importer import ImportInProgress, run_import
from app.mirror.reader import MirrorError, PipedriveReader


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--full", action="store_true", help="re-read everything, not only what changed since the last good run")
    parser.add_argument("--dry-run", action="store_true", help="read and count, write nothing")
    parser.add_argument("--log-level", default="INFO", choices=["DEBUG", "INFO", "WARNING", "ERROR"])
    return parser.parse_args(argv)


async def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(level=args.log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    settings = Settings()
    domain, token = settings.pipedrive_company_domain, settings.pipedrive_api_token.get_secret_value()
    if not domain or not token:
        print("Set BIOFARM_PIPEDRIVE_COMPANY_DOMAIN and BIOFARM_PIPEDRIVE_API_TOKEN", file=sys.stderr)
        return 2
    engine = make_engine(settings.database_url)  # same SQLite pragmas as the web app, so neither blocks the other for long
    try:
        async with engine.connect() as conn:
            has_tables = await conn.run_sync(lambda sync_conn: inspect(sync_conn).has_table("pd_import_runs"))
        if not has_tables:
            print("The mirror tables are missing: run `uv run alembic upgrade head` first", file=sys.stderr)
            return 2
        sessions = async_sessionmaker(engine, expire_on_commit=False)
        async with PipedriveReader(company_domain=domain, api_token=token) as reader:
            counts = await run_import(sessions, reader, full=args.full, dry_run=args.dry_run)
    except MirrorError as exc:
        print(f"import failed: {exc}", file=sys.stderr)
        return 1
    except ImportInProgress as exc:
        print(f"not started: {exc}", file=sys.stderr)
        return 3
    finally:
        await engine.dispose()
    for name, value in counts.as_dict().items():
        print(f"{name:14} {value}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
