"""
A trader's thesis for a scalping order, captured live in the terminal's
persistent note box (database.scalping_db.record_order_note), survives a
write/read round trip.
"""

import importlib

import pytest


@pytest.fixture
def store(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'scalping.db'}")
    import database.scalping_db as module

    module = importlib.reload(module)
    module.init_db()
    yield module
    module.db_session.remove()


class TestRecordOrderNote:
    def test_round_trips_a_note(self, store):
        ok = store.record_order_note(
            user_id="u1",
            broker="zerodha",
            symbol="NIFTY28MAR2420800CE",
            exchange="NFO",
            product="MIS",
            action="BUY",
            quantity=50,
            note_text="IV crush fading, playing for a bounce off VWAP",
        )
        assert ok is True

        rows = store.db_session.query(store.ScalpingOrderNote).all()
        assert len(rows) == 1
        row = rows[0]
        assert row.user_id == "u1"
        assert row.symbol == "NIFTY28MAR2420800CE"
        assert row.note_text == "IV crush fading, playing for a bounce off VWAP"

    def test_truncates_an_overlong_note_rather_than_failing(self, store):
        ok = store.record_order_note(
            user_id="u1",
            broker="zerodha",
            symbol="INFY",
            exchange="NSE",
            product="MIS",
            action="SELL",
            quantity=1,
            note_text="x" * 1000,
        )
        assert ok is True
        row = store.db_session.query(store.ScalpingOrderNote).first()
        assert len(row.note_text) == 500
