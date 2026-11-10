#!/usr/bin/env python3
"""
Migration: iv_history table

Adds iv_history to the main database: one row per (underlying, exchange,
trading day), recording that day's ATM implied volatility whenever the IV
Smile tool is opened for it. This is what IV Rank and IV Percentile are
computed from -- there is no broker API that returns a year of past options
IV, so the history has to be built by the platform itself starting from
whenever this table was added.

This is a new table, so there is nothing to backfill. The app creates it at
startup too; this script is what reaches installs that upgrade with
`git pull` and migrate_all.py before restarting.

This migration is idempotent - safe to run multiple times.

Usage:
    cd upgrade
    uv run migrate_iv_history.py           # Apply migration
    uv run migrate_iv_history.py --status  # Check status without changing anything
"""

import argparse
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

sys.path.insert(0, PROJECT_ROOT)
# Register the app's SQLite pragmas on this process's engines, so a migration
# waits the same 15s for a write lock the running app does instead of the
# sqlite3 default of 5s (GitHub issue #1726).
import _pragmas  # noqa: F401,E402
from dotenv import load_dotenv

load_dotenv(os.path.join(PROJECT_ROOT, ".env"))


def _resolve_sqlite_path(db_url: str) -> str:
    """A relative ``sqlite:///`` URL resolves against the CWD, which is
    ``upgrade/`` for the documented invocation -- make it absolute against
    the project root instead, or a bare `uv run migrate_iv_history.py`
    would silently create and migrate ``upgrade/db/openalgo.db``, empty,
    rather than the database the app actually opens."""
    prefix = "sqlite:///"
    if not db_url.startswith(prefix):
        return db_url
    path = db_url[len(prefix) :]
    if not path or path == ":memory:" or os.path.isabs(path):
        return db_url
    return prefix + os.path.join(PROJECT_ROOT, path)


# The database module builds its engine from DATABASE_URL at import, so the
# resolved absolute path must be in place before anything imports it.
os.environ["DATABASE_URL"] = _resolve_sqlite_path(
    os.getenv("DATABASE_URL", "sqlite:///db/openalgo.db")
)

from sqlalchemy import inspect  # noqa: E402

from utils.logging import get_logger  # noqa: E402

logger = get_logger(__name__)

TABLE = "iv_history"


def table_exists() -> bool:
    from database.iv_history_db import engine

    return TABLE in inspect(engine).get_table_names()


def migrate() -> bool:
    from database.iv_history_db import init_db

    try:
        init_db()
        return table_exists()
    except Exception as e:
        logger.error(f"Error creating {TABLE}: {e}")
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Create the iv_history table")
    parser.add_argument(
        "--status", action="store_true", help="Report what would change without changing it"
    )
    args = parser.parse_args()

    if args.status:
        exists = table_exists()
        logger.info(f"{TABLE}: {'present' if exists else 'missing'}")
        return 0

    logger.info("=" * 60)
    logger.info("OpenAlgo IV History Migration")
    logger.info("=" * 60)

    if table_exists():
        logger.info(f"Table {TABLE} already exists. Nothing to do.")
        return 0

    if migrate():
        logger.info(f"Created table: {TABLE}")
        return 0

    logger.error("Migration failed! Check error messages above.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
