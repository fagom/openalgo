"""
A closed trade shows the trader's own thesis, typed live into the scalping
terminal's note box, matched up by symbol/exchange/product and timing since
nothing in this system carries an orderid to join on exactly
(database.eod_reports_db._attach_thesis_notes).
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


class TestThesisNotesAttachToClosedTrades:
    def test_a_note_written_during_the_trade_attaches(self, modules):
        eod, scalping = modules

        scalping.record_order_note(
            user_id="u1",
            broker="zerodha",
            symbol="NIFTY28MAR2420800CE",
            exchange="NFO",
            product="MIS",
            action="BUY",
            quantity=50,
            note_text="IV crush fading, playing for a bounce off VWAP",
        )
        # Written 100s into the trade -- well inside [entry_time, exit_time].
        row = scalping.db_session.query(scalping.ScalpingOrderNote).first()
        row.created_at = datetime.fromtimestamp(1_700_000_100.0, tz=UTC).replace(tzinfo=None)
        scalping.db_session.commit()

        eod.replace_closed_trades("u1", "zerodha", date(2026, 11, 10), "equity_fo", [trade()])
        trades = eod.get_closed_trades("u1", "zerodha", date(2026, 11, 10), "equity_fo")

        assert len(trades) == 1
        assert trades[0]["thesisNotes"] == ["IV crush fading, playing for a bounce off VWAP"]

    def test_a_note_for_a_different_symbol_does_not_attach(self, modules):
        eod, scalping = modules

        scalping.record_order_note(
            user_id="u1",
            broker="zerodha",
            symbol="BANKNIFTY28MAR2448000PE",
            exchange="NFO",
            product="MIS",
            action="SELL",
            quantity=25,
            note_text="unrelated trade",
        )
        row = scalping.db_session.query(scalping.ScalpingOrderNote).first()
        row.created_at = datetime.fromtimestamp(1_700_000_100.0, tz=UTC).replace(tzinfo=None)
        scalping.db_session.commit()

        eod.replace_closed_trades("u1", "zerodha", date(2026, 11, 10), "equity_fo", [trade()])
        trades = eod.get_closed_trades("u1", "zerodha", date(2026, 11, 10), "equity_fo")

        assert trades[0]["thesisNotes"] == []

    def test_a_note_long_before_the_trade_does_not_attach(self, modules):
        eod, scalping = modules

        scalping.record_order_note(
            user_id="u1",
            broker="zerodha",
            symbol="NIFTY28MAR2420800CE",
            exchange="NFO",
            product="MIS",
            action="BUY",
            quantity=50,
            note_text="a much earlier, unrelated note",
        )
        row = scalping.db_session.query(scalping.ScalpingOrderNote).first()
        # An hour before entry_time -- outside even the matching buffer.
        row.created_at = datetime.fromtimestamp(1_700_000_000.0 - 3600, tz=UTC).replace(tzinfo=None)
        scalping.db_session.commit()

        eod.replace_closed_trades("u1", "zerodha", date(2026, 11, 10), "equity_fo", [trade()])
        trades = eod.get_closed_trades("u1", "zerodha", date(2026, 11, 10), "equity_fo")

        assert trades[0]["thesisNotes"] == []

    def test_no_notes_at_all_is_an_empty_list_not_an_error(self, modules):
        eod, _scalping = modules

        eod.replace_closed_trades("u1", "zerodha", date(2026, 11, 10), "equity_fo", [trade()])
        trades = eod.get_closed_trades("u1", "zerodha", date(2026, 11, 10), "equity_fo")

        assert trades[0]["thesisNotes"] == []
