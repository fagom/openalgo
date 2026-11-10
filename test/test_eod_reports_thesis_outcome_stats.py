"""
Whether a closed trade's outcome differs depending on whether the trader
typed a thesis into the scalping terminal before firing it
(database.eod_reports_db.get_thesis_outcome_stats) - a plain split of the
trader's own numbers, not an AI judgment.
"""

import importlib
from datetime import UTC, date, datetime

import pytest


@pytest.fixture
def modules(tmp_path, monkeypatch):
    db_path = tmp_path / "shared.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    import database.eod_reports_db as eod_module
    import database.scalping_db as scalping_module

    scalping_module = importlib.reload(scalping_module)
    scalping_module.init_db()
    eod_module = importlib.reload(eod_module)
    eod_module.init_db()
    yield eod_module, scalping_module
    eod_module.db_session.remove()
    scalping_module.db_session.remove()


def trade(**over):
    base = {
        "segment": "fo_options",
        "symbol": "NIFTY28MAR2420800CE",
        "exchange": "NFO",
        "product": "MIS",
        "entry_price": 100.0,
        "exit_price": 120.0,
        "quantity": 50,
        "pnl": 1000.0,
        "entry_time": 1_700_000_000.0,
        "exit_time": 1_700_000_600.0,
    }
    base.update(over)
    return base


def _note_at(scalping, symbol, exchange, product, epoch):
    scalping.record_order_note(
        user_id="u1",
        broker="zerodha",
        symbol=symbol,
        exchange=exchange,
        product=product,
        action="BUY",
        quantity=50,
        note_text="my thesis",
    )
    row = (
        scalping.db_session.query(scalping.ScalpingOrderNote)
        .order_by(scalping.ScalpingOrderNote.id.desc())
        .first()
    )
    row.created_at = datetime.fromtimestamp(epoch, tz=UTC).replace(tzinfo=None)
    scalping.db_session.commit()


class TestThesisOutcomeStats:
    def test_splits_trades_by_whether_a_thesis_was_attached(self, modules):
        eod, scalping = modules

        # Trade 1: has a thesis, wins.
        eod.replace_closed_trades(
            "u1", "zerodha", date(2026, 11, 10), "equity_fo", [trade(pnl=1000.0)]
        )
        _note_at(scalping, "NIFTY28MAR2420800CE", "NFO", "MIS", 1_700_000_100.0)

        # Trade 2: no thesis, loses. Different symbol/day to avoid collision.
        eod.replace_closed_trades(
            "u1",
            "zerodha",
            date(2026, 11, 11),
            "equity_fo",
            [
                trade(
                    symbol="BANKNIFTY28MAR2448000PE",
                    pnl=-500.0,
                    entry_time=1_700_100_000.0,
                    exit_time=1_700_100_600.0,
                )
            ],
        )

        stats = eod.get_thesis_outcome_stats("u1", "zerodha", days=30)

        assert stats["withThesis"]["tradeCount"] == 1
        assert stats["withThesis"]["winRate"] == 100.0
        assert stats["withThesis"]["totalPnl"] == 1000.0

        assert stats["withoutThesis"]["tradeCount"] == 1
        assert stats["withoutThesis"]["winRate"] == 0.0
        assert stats["withoutThesis"]["totalPnl"] == -500.0

    def test_empty_buckets_when_there_are_no_trades(self, modules):
        eod, _scalping = modules

        stats = eod.get_thesis_outcome_stats("u1", "zerodha", days=30)

        assert stats["withThesis"]["tradeCount"] == 0
        assert stats["withThesis"]["winRate"] == 0.0
        assert stats["withoutThesis"]["tradeCount"] == 0

    def test_verdict_breakdown_counts_unrated_trades(self, modules):
        eod, _scalping = modules

        eod.replace_closed_trades("u1", "zerodha", date(2026, 11, 10), "equity_fo", [trade()])

        stats = eod.get_thesis_outcome_stats("u1", "zerodha", days=30)

        assert stats["withoutThesis"]["verdictBreakdown"]["unrated"] == 1
        assert stats["withoutThesis"]["verdictBreakdown"]["good"] == 0
