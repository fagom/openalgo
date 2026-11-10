#!/usr/bin/env python3
"""
Migration: Daily Reports (Balance Progression, Daily Charges, Trade Analysis,
Per-Trade AI Reasoning)

Adds the tables behind the Daily Reports page and extends two of them for a
second, later EOD run:
- balance_snapshots: one EOD balance reading per user/broker/day
- daily_charges: one row per user/broker/day/market_class/segment total
- trade_analysis: one row per user/broker/day/market_class rollup
- brokerage_settings: the trader's own brokerage rate per segment
- closed_trades: one row per FIFO-matched closed trade, with its AI
  reasoning once generated

Equity/F&O settle by market close, but MCX commodities trade into the
evening, so services/eod_reports_service.py now runs twice a day
(market_class="equity_fo" at 15:40 IST, "commodity" at 23:45 IST). That needs
a market_class column on daily_charges and trade_analysis:
- daily_charges: a plain ADD COLUMN. Its existing unique constraint already
  includes `segment`, and segment names never collide across market classes
  (e.g. "equity_intraday" vs "commodity_futures"), so the constraint itself
  does not need to change.
- trade_analysis: its existing constraint is one row per (user, broker, day) -
  a second row for the same day's commodity run would violate it. SQLite
  cannot alter a UNIQUE constraint in place, so this rebuilds the table via
  the standard create-new / copy-data / drop-old / rename procedure (same
  technique as migrate_sandbox_trigger_pending.py), preserving every existing
  row (labeled market_class='equity_fo', since every row written before this
  migration came from the one pre-existing 15:40 run).

database/eod_reports_db.py's init_db() creates/extends these tables too, but
only for a database opened after this ships; this script is what reaches
deployments that upgrade with `git pull`.

This migration is idempotent - safe to run multiple times.

Usage:
    cd upgrade
    uv run migrate_eod_reports.py           # Apply migration
    uv run migrate_eod_reports.py --status  # Check status without changing anything
"""

import argparse
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

sys.path.insert(0, PROJECT_ROOT)
import _pragmas  # noqa: F401,E402
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.pool import NullPool

TABLES = (
    "balance_snapshots",
    "daily_charges",
    "trade_analysis",
    "brokerage_settings",
    "closed_trades",
)

INDEXES = {
    "ix_balance_snapshots_user_date": ("balance_snapshots", "user_id, broker, snapshot_date"),
    "ix_daily_charges_user_date": ("daily_charges", "user_id, broker, trade_date"),
    "ix_trade_analysis_user_date": ("trade_analysis", "user_id, broker, trade_date"),
    "ix_closed_trades_user_date_class": (
        "closed_trades",
        "user_id, broker, trade_date, market_class",
    ),
}

#: (table, column, type, default) added via plain ADD COLUMN - no constraint
#: change needed. See the module docstring for why daily_charges is safe this
#: way while trade_analysis is not.
ADDED_COLUMNS = (
    ("daily_charges", "market_class", "VARCHAR(20)", "'equity_fo'"),
    ("brokerage_settings", "commodity_futures", "FLOAT", "0"),
    ("brokerage_settings", "commodity_options", "FLOAT", "0"),
)


def resolve_sqlite_path(db_url):
    """Make a relative sqlite:/// path absolute against the project root."""
    prefix = "sqlite:///"
    if not db_url.startswith(prefix):
        return db_url
    path = db_url[len(prefix) :]
    if not path or path == ":memory:" or os.path.isabs(path):
        return db_url
    return prefix + os.path.join(PROJECT_ROOT, path)


def get_database_url():
    from dotenv import load_dotenv

    load_dotenv()
    return resolve_sqlite_path(os.getenv("DATABASE_URL", "sqlite:///db/openalgo.db"))


def table_exists(engine, table_name):
    return table_name in inspect(engine).get_table_names()


def index_exists(engine, table_name, index_name):
    if not table_exists(engine, table_name):
        return False
    return index_name in {idx["name"] for idx in inspect(engine).get_indexes(table_name)}


def _create_table(engine, name, sqlite_sql, other_sql):
    if table_exists(engine, name):
        print(f"  [SKIP] {name} table already exists")
        return
    print(f"  [CREATE] Creating {name} table...")
    sql = sqlite_sql if "sqlite" in str(engine.url) else other_sql
    with engine.connect() as conn:
        conn.execute(text(sql))
        conn.commit()
    print(f"  [OK] {name} table created")


def create_tables(engine):
    _create_table(
        engine,
        "balance_snapshots",
        """
        CREATE TABLE balance_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id VARCHAR(80) NOT NULL,
            broker VARCHAR(50) NOT NULL,
            snapshot_date DATE NOT NULL,
            available_cash FLOAT,
            collateral FLOAT,
            utilised_debits FLOAT,
            m2m_unrealized FLOAT,
            m2m_realized FLOAT,
            net_balance FLOAT,
            raw_funds_json TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_balance_snapshot_day UNIQUE (user_id, broker, snapshot_date)
        )
        """,
        """
        CREATE TABLE balance_snapshots (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(80) NOT NULL,
            broker VARCHAR(50) NOT NULL,
            snapshot_date DATE NOT NULL,
            available_cash DOUBLE PRECISION,
            collateral DOUBLE PRECISION,
            utilised_debits DOUBLE PRECISION,
            m2m_unrealized DOUBLE PRECISION,
            m2m_realized DOUBLE PRECISION,
            net_balance DOUBLE PRECISION,
            raw_funds_json TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_balance_snapshot_day UNIQUE (user_id, broker, snapshot_date)
        )
        """,
    )

    _create_table(
        engine,
        "daily_charges",
        """
        CREATE TABLE daily_charges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id VARCHAR(80) NOT NULL,
            broker VARCHAR(50) NOT NULL,
            trade_date DATE NOT NULL,
            segment VARCHAR(30) NOT NULL,
            trade_count INTEGER NOT NULL DEFAULT 0,
            turnover FLOAT NOT NULL DEFAULT 0,
            brokerage FLOAT NOT NULL DEFAULT 0,
            stt FLOAT NOT NULL DEFAULT 0,
            stamp_duty FLOAT NOT NULL DEFAULT 0,
            exchange_txn_charge FLOAT NOT NULL DEFAULT 0,
            sebi_fee FLOAT NOT NULL DEFAULT 0,
            gst FLOAT NOT NULL DEFAULT 0,
            total_charges FLOAT NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_daily_charges_day_segment UNIQUE (user_id, broker, trade_date, segment)
        )
        """,
        """
        CREATE TABLE daily_charges (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(80) NOT NULL,
            broker VARCHAR(50) NOT NULL,
            trade_date DATE NOT NULL,
            segment VARCHAR(30) NOT NULL,
            trade_count INTEGER NOT NULL DEFAULT 0,
            turnover DOUBLE PRECISION NOT NULL DEFAULT 0,
            brokerage DOUBLE PRECISION NOT NULL DEFAULT 0,
            stt DOUBLE PRECISION NOT NULL DEFAULT 0,
            stamp_duty DOUBLE PRECISION NOT NULL DEFAULT 0,
            exchange_txn_charge DOUBLE PRECISION NOT NULL DEFAULT 0,
            sebi_fee DOUBLE PRECISION NOT NULL DEFAULT 0,
            gst DOUBLE PRECISION NOT NULL DEFAULT 0,
            total_charges DOUBLE PRECISION NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_daily_charges_day_segment UNIQUE (user_id, broker, trade_date, segment)
        )
        """,
    )

    _create_table(
        engine,
        "trade_analysis",
        """
        CREATE TABLE trade_analysis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id VARCHAR(80) NOT NULL,
            broker VARCHAR(50) NOT NULL,
            trade_date DATE NOT NULL,
            total_trades INTEGER NOT NULL DEFAULT 0,
            winning_trades INTEGER NOT NULL DEFAULT 0,
            losing_trades INTEGER NOT NULL DEFAULT 0,
            win_rate FLOAT NOT NULL DEFAULT 0,
            total_pnl FLOAT NOT NULL DEFAULT 0,
            gross_profit FLOAT NOT NULL DEFAULT 0,
            gross_loss FLOAT NOT NULL DEFAULT 0,
            profit_factor FLOAT,
            best_trade_symbol VARCHAR(60),
            best_trade_pnl FLOAT,
            worst_trade_symbol VARCHAR(60),
            worst_trade_pnl FLOAT,
            avg_win FLOAT,
            avg_loss FLOAT,
            segment_breakdown_json TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_trade_analysis_day UNIQUE (user_id, broker, trade_date)
        )
        """,
        """
        CREATE TABLE trade_analysis (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(80) NOT NULL,
            broker VARCHAR(50) NOT NULL,
            trade_date DATE NOT NULL,
            total_trades INTEGER NOT NULL DEFAULT 0,
            winning_trades INTEGER NOT NULL DEFAULT 0,
            losing_trades INTEGER NOT NULL DEFAULT 0,
            win_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
            total_pnl DOUBLE PRECISION NOT NULL DEFAULT 0,
            gross_profit DOUBLE PRECISION NOT NULL DEFAULT 0,
            gross_loss DOUBLE PRECISION NOT NULL DEFAULT 0,
            profit_factor DOUBLE PRECISION,
            best_trade_symbol VARCHAR(60),
            best_trade_pnl DOUBLE PRECISION,
            worst_trade_symbol VARCHAR(60),
            worst_trade_pnl DOUBLE PRECISION,
            avg_win DOUBLE PRECISION,
            avg_loss DOUBLE PRECISION,
            segment_breakdown_json TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_trade_analysis_day UNIQUE (user_id, broker, trade_date)
        )
        """,
    )

    _create_table(
        engine,
        "brokerage_settings",
        """
        CREATE TABLE brokerage_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id VARCHAR(80) NOT NULL UNIQUE,
            equity_delivery FLOAT NOT NULL DEFAULT 0,
            equity_intraday FLOAT NOT NULL DEFAULT 0,
            fo_futures FLOAT NOT NULL DEFAULT 0,
            fo_options FLOAT NOT NULL DEFAULT 0
        )
        """,
        """
        CREATE TABLE brokerage_settings (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(80) NOT NULL UNIQUE,
            equity_delivery DOUBLE PRECISION NOT NULL DEFAULT 0,
            equity_intraday DOUBLE PRECISION NOT NULL DEFAULT 0,
            fo_futures DOUBLE PRECISION NOT NULL DEFAULT 0,
            fo_options DOUBLE PRECISION NOT NULL DEFAULT 0
        )
        """,
    )

    _create_table(
        engine,
        "closed_trades",
        """
        CREATE TABLE closed_trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id VARCHAR(80) NOT NULL,
            broker VARCHAR(50) NOT NULL,
            trade_date DATE NOT NULL,
            market_class VARCHAR(20) NOT NULL DEFAULT 'equity_fo',
            segment VARCHAR(30) NOT NULL,
            symbol VARCHAR(60) NOT NULL,
            exchange VARCHAR(20) NOT NULL,
            product VARCHAR(20) NOT NULL,
            entry_price FLOAT NOT NULL,
            exit_price FLOAT NOT NULL,
            quantity FLOAT NOT NULL,
            pnl FLOAT NOT NULL,
            entry_time FLOAT,
            exit_time FLOAT,
            reasoning_text TEXT,
            reasoning_verdict VARCHAR(16) NOT NULL DEFAULT 'unrated',
            reasoning_model VARCHAR(120),
            reasoning_generated_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """,
        """
        CREATE TABLE closed_trades (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(80) NOT NULL,
            broker VARCHAR(50) NOT NULL,
            trade_date DATE NOT NULL,
            market_class VARCHAR(20) NOT NULL DEFAULT 'equity_fo',
            segment VARCHAR(30) NOT NULL,
            symbol VARCHAR(60) NOT NULL,
            exchange VARCHAR(20) NOT NULL,
            product VARCHAR(20) NOT NULL,
            entry_price DOUBLE PRECISION NOT NULL,
            exit_price DOUBLE PRECISION NOT NULL,
            quantity DOUBLE PRECISION NOT NULL,
            pnl DOUBLE PRECISION NOT NULL,
            entry_time DOUBLE PRECISION,
            exit_time DOUBLE PRECISION,
            reasoning_text TEXT,
            reasoning_verdict VARCHAR(16) NOT NULL DEFAULT 'unrated',
            reasoning_model VARCHAR(120),
            reasoning_generated_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """,
    )


def add_columns(engine):
    """Plain ADD COLUMN for the columns that need no constraint change."""
    for table_name, column_name, column_type, default in ADDED_COLUMNS:
        if not table_exists(engine, table_name):
            continue
        existing = {col["name"] for col in inspect(engine).get_columns(table_name)}
        if column_name in existing:
            print(f"  [SKIP] {table_name}.{column_name} already exists")
            continue
        print(f"  [ADD] {table_name}.{column_name}...")
        with engine.connect() as conn:
            conn.execute(
                text(
                    f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type} "
                    f"NOT NULL DEFAULT {default}"
                )
            )
            conn.commit()
        print(f"  [OK] {table_name}.{column_name} added")


def rebuild_trade_analysis_for_market_class(engine):
    """Add market_class to trade_analysis and widen its unique constraint.

    SQLite cannot alter a UNIQUE constraint in place, so this rebuilds the
    table: create the new shape, copy every existing row in as
    market_class='equity_fo' (the only market class any pre-existing row can
    be - this column did not exist before this migration), drop the old
    table, rename the new one into place. Postgres can alter the constraint
    directly, so it takes a simpler path.
    """
    if not table_exists(engine, "trade_analysis"):
        return
    existing = {col["name"] for col in inspect(engine).get_columns("trade_analysis")}
    if "market_class" in existing:
        print("  [SKIP] trade_analysis already has market_class")
        return

    print("  [REBUILD] Widening trade_analysis for market_class...")

    if "sqlite" not in str(engine.url):
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE trade_analysis ADD COLUMN market_class VARCHAR(20)"))
            conn.execute(
                text(
                    "UPDATE trade_analysis SET market_class = 'equity_fo' "
                    "WHERE market_class IS NULL"
                )
            )
            conn.execute(text("ALTER TABLE trade_analysis ALTER COLUMN market_class SET NOT NULL"))
            conn.execute(text("ALTER TABLE trade_analysis DROP CONSTRAINT uq_trade_analysis_day"))
            conn.execute(
                text(
                    "ALTER TABLE trade_analysis ADD CONSTRAINT uq_trade_analysis_day "
                    "UNIQUE (user_id, broker, trade_date, market_class)"
                )
            )
            conn.commit()
        print("  [OK] trade_analysis widened for market_class")
        return

    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE trade_analysis RENAME TO trade_analysis_old"))

        conn.execute(
            text(
                """
                CREATE TABLE trade_analysis (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id VARCHAR(80) NOT NULL,
                    broker VARCHAR(50) NOT NULL,
                    trade_date DATE NOT NULL,
                    market_class VARCHAR(20) NOT NULL DEFAULT 'equity_fo',
                    total_trades INTEGER NOT NULL DEFAULT 0,
                    winning_trades INTEGER NOT NULL DEFAULT 0,
                    losing_trades INTEGER NOT NULL DEFAULT 0,
                    win_rate FLOAT NOT NULL DEFAULT 0,
                    total_pnl FLOAT NOT NULL DEFAULT 0,
                    gross_profit FLOAT NOT NULL DEFAULT 0,
                    gross_loss FLOAT NOT NULL DEFAULT 0,
                    profit_factor FLOAT,
                    best_trade_symbol VARCHAR(60),
                    best_trade_pnl FLOAT,
                    worst_trade_symbol VARCHAR(60),
                    worst_trade_pnl FLOAT,
                    avg_win FLOAT,
                    avg_loss FLOAT,
                    segment_breakdown_json TEXT,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT uq_trade_analysis_day
                        UNIQUE (user_id, broker, trade_date, market_class)
                )
                """
            )
        )

        conn.execute(
            text(
                """
                INSERT INTO trade_analysis (
                    id, user_id, broker, trade_date, market_class, total_trades,
                    winning_trades, losing_trades, win_rate, total_pnl, gross_profit,
                    gross_loss, profit_factor, best_trade_symbol, best_trade_pnl,
                    worst_trade_symbol, worst_trade_pnl, avg_win, avg_loss,
                    segment_breakdown_json, created_at
                )
                SELECT
                    id, user_id, broker, trade_date, 'equity_fo', total_trades,
                    winning_trades, losing_trades, win_rate, total_pnl, gross_profit,
                    gross_loss, profit_factor, best_trade_symbol, best_trade_pnl,
                    worst_trade_symbol, worst_trade_pnl, avg_win, avg_loss,
                    segment_breakdown_json, created_at
                FROM trade_analysis_old
                """
            )
        )

        conn.execute(text("DROP TABLE trade_analysis_old"))
        conn.commit()
    print("  [OK] trade_analysis widened for market_class")


def create_indexes(engine):
    for index_name, (table_name, columns) in INDEXES.items():
        if not table_exists(engine, table_name):
            continue
        if index_exists(engine, table_name, index_name):
            print(f"  [SKIP] {index_name} already exists")
            continue
        print(f"  [CREATE] Creating {index_name}...")
        with engine.connect() as conn:
            conn.execute(text(f"CREATE INDEX {index_name} ON {table_name} ({columns})"))
            conn.commit()
        print(f"  [OK] {index_name} created")
    return True


def status(engine):
    print()
    print("Daily Reports migration status")
    print("-" * 46)

    applied = True
    for name in TABLES:
        present = table_exists(engine, name)
        print(f"  {name:<34} {'present' if present else 'MISSING'}")
        applied = applied and present

    for table_name, column_name, _type, _default in ADDED_COLUMNS:
        present = table_exists(engine, table_name) and column_name in {
            col["name"] for col in inspect(engine).get_columns(table_name)
        }
        label = f"{table_name}.{column_name}"
        print(f"  {label:<34} {'present' if present else 'MISSING'}")
        applied = applied and present

    trade_analysis_widened = table_exists(engine, "trade_analysis") and "market_class" in {
        col["name"] for col in inspect(engine).get_columns("trade_analysis")
    }
    print(
        f"  {'trade_analysis.market_class':<34} {'present' if trade_analysis_widened else 'MISSING'}"
    )
    applied = applied and trade_analysis_widened

    for index_name, (table_name, _columns) in INDEXES.items():
        present = index_exists(engine, table_name, index_name)
        print(f"  {index_name:<34} {'present' if present else 'MISSING'}")
        applied = applied and present

    print("-" * 46)
    print("All changes applied." if applied else "Migration needed.")
    return applied


def main():
    parser = argparse.ArgumentParser(description="Daily Reports tables migration")
    parser.add_argument(
        "--status", action="store_true", help="Report status without changing anything"
    )
    args = parser.parse_args()

    print()
    print("Daily Reports Migration")
    print("-" * 46)

    try:
        db_url = get_database_url()
        print(f"Database: {db_url.split('://')[0]}://...")

        engine = (
            create_engine(db_url, poolclass=NullPool)
            if "sqlite" in db_url
            else create_engine(db_url)
        )

        if args.status:
            return 0 if status(engine) else 1

        print()
        print("Creating tables...")
        create_tables(engine)

        print()
        print("Widening existing tables...")
        rebuild_trade_analysis_for_market_class(engine)
        add_columns(engine)

        print()
        print("Creating indexes...")
        create_indexes(engine)

        print()
        print("[OK] Daily Reports migration completed successfully!")
        return 0

    except Exception as e:
        print(f"\n[ERROR] Migration failed: {e}")
        import traceback

        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
