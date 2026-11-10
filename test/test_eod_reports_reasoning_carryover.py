"""
A closed trade that reappears unchanged across EOD reruns keeps its prior AI
reasoning instead of losing it (and getting silently re-billed to the agent
model for a note it already has).

replace_closed_trades deletes and reinserts a day's closed_trades on every
run - a mid-day manual Refresh followed by the scheduled 15:40/23:45 IST run,
or two reruns, must not throw away reasoning that services/eod_reports_
service.py already generated and paid for.
"""

import importlib

import pytest


@pytest.fixture
def store(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'eod_reports.db'}")
    import database.eod_reports_db as module

    module = importlib.reload(module)
    module.init_db()
    yield module
    module.db_session.remove()


def trade(**over):
    base = {
        "segment": "equity",
        "symbol": "INFY",
        "exchange": "NSE",
        "product": "MIS",
        "entry_price": 1500.0,
        "exit_price": 1510.0,
        "quantity": 10,
        "pnl": 100.0,
        "entry_time": 1700000000.0,
        "exit_time": 1700003600.0,
    }
    base.update(over)
    return base


class TestReasoningSurvivesARerun:
    def test_unchanged_trade_keeps_its_reasoning(self, store):
        from datetime import date

        rows = store.replace_closed_trades(
            "u1", "zerodha", date(2026, 11, 10), "equity_fo", [trade()]
        )
        assert len(rows) == 1
        store.set_trade_reasoning(
            rows[0].id,
            {"reasoning_text": "Entered into strength", "verdict": "good", "model": "gpt"},
        )

        # Rerun with the exact same fills, as a manual Refresh followed by the
        # scheduled job (or two reruns) would recompute.
        rows_again = store.replace_closed_trades(
            "u1", "zerodha", date(2026, 11, 10), "equity_fo", [trade()]
        )

        assert len(rows_again) == 1
        assert rows_again[0].reasoning_text == "Entered into strength"
        assert rows_again[0].reasoning_verdict == "good"

    def test_a_genuinely_new_trade_has_no_reasoning_to_carry(self, store):
        from datetime import date

        rows = store.replace_closed_trades(
            "u1", "zerodha", date(2026, 11, 10), "equity_fo", [trade()]
        )
        store.set_trade_reasoning(
            rows[0].id, {"reasoning_text": "note", "verdict": "good", "model": "gpt"}
        )

        # A different trade (different entry/exit time) alongside the old one.
        rows_again = store.replace_closed_trades(
            "u1",
            "zerodha",
            date(2026, 11, 10),
            "equity_fo",
            [trade(), trade(entry_time=1700010000.0, exit_time=1700013600.0)],
        )

        by_entry_time = {r.entry_time: r for r in rows_again}
        assert by_entry_time[1700000000.0].reasoning_text == "note"
        assert by_entry_time[1700010000.0].reasoning_text is None

    def test_a_trade_that_stopped_appearing_does_not_leak_its_reasoning(self, store):
        from datetime import date

        rows = store.replace_closed_trades(
            "u1", "zerodha", date(2026, 11, 10), "equity_fo", [trade()]
        )
        store.set_trade_reasoning(
            rows[0].id, {"reasoning_text": "note", "verdict": "good", "model": "gpt"}
        )

        # The corrected FIFO match no longer includes this trade at all.
        rows_again = store.replace_closed_trades(
            "u1", "zerodha", date(2026, 11, 10), "equity_fo", []
        )

        assert rows_again == []
        assert store.get_closed_trades("u1", "zerodha", date(2026, 11, 10), "equity_fo") == []
