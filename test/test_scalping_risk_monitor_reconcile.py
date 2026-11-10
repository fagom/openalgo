"""
An SL/target row left behind by an order the broker accepted but later
rejected (nothing else in the system ever retracts it - see the module
docstring on ScalpingRiskMonitor._drop_flat_rows) is cleared once its leg's
real position book shows zero quantity, instead of sitting "protected"
forever and blocking a broker switch (utils/broker_switch.py).
"""

import importlib

import pytest


@pytest.fixture
def modules(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'scalping.db'}")
    import database.scalping_db as db_module
    import services.scalping_risk_monitor_service as monitor_module

    db_module = importlib.reload(db_module)
    db_module.init_db()
    monitor_module = importlib.reload(monitor_module)
    yield db_module, monitor_module
    db_module.db_session.remove()


def sl_row(**over):
    base = {
        "symbol": "NIFTY28MAR2420800CE",
        "exchange": "NFO",
        "product": "MIS",
        "mode": "live",
        "side": "BUY",
        "entry_price": 100.0,
        "quantity": 50,
        "initial_sl": 90.0,
        "is_active": True,
    }
    base.update(over)
    return base


def positionbook(entries):
    return True, {"status": "success", "data": entries}, 200


class TestDropFlatRows:
    def test_clears_a_row_with_no_live_position_behind_it(self, modules, monkeypatch):
        db, monitor_module = modules
        db.upsert_sl_state(sl_row())

        monitor = monitor_module.ScalpingRiskMonitor()
        monkeypatch.setattr(monitor, "_resolve_auth", lambda: ("key", None, None))
        monkeypatch.setattr(
            "services.positionbook_service.get_positionbook", lambda **kw: positionbook([])
        )

        kept = monitor._drop_flat_rows(db.get_active_sl_states(mode="live"))

        assert kept == []
        assert db.get_active_sl_states(mode="live") == []

    def test_keeps_a_row_with_a_live_position_behind_it(self, modules, monkeypatch):
        db, monitor_module = modules
        db.upsert_sl_state(sl_row())

        monitor = monitor_module.ScalpingRiskMonitor()
        monkeypatch.setattr(monitor, "_resolve_auth", lambda: ("key", None, None))
        monkeypatch.setattr(
            "services.positionbook_service.get_positionbook",
            lambda **kw: positionbook(
                [
                    {
                        "symbol": "NIFTY28MAR2420800CE",
                        "exchange": "NFO",
                        "product": "MIS",
                        "quantity": 50,
                    }
                ]
            ),
        )

        rows = db.get_active_sl_states(mode="live")
        kept = monitor._drop_flat_rows(rows)

        assert len(kept) == 1
        assert len(db.get_active_sl_states(mode="live")) == 1

    def test_a_positionbook_failure_leaves_rows_untouched(self, modules, monkeypatch):
        db, monitor_module = modules
        db.upsert_sl_state(sl_row())

        monitor = monitor_module.ScalpingRiskMonitor()
        monkeypatch.setattr(monitor, "_resolve_auth", lambda: ("key", None, None))
        monkeypatch.setattr(
            "services.positionbook_service.get_positionbook",
            lambda **kw: (False, {"message": "broker busy"}, 503),
        )

        rows = db.get_active_sl_states(mode="live")
        kept = monitor._drop_flat_rows(rows)

        assert len(kept) == 1
        assert len(db.get_active_sl_states(mode="live")) == 1

    def test_no_auth_leaves_rows_untouched(self, modules, monkeypatch):
        db, monitor_module = modules
        db.upsert_sl_state(sl_row())

        monitor = monitor_module.ScalpingRiskMonitor()
        monkeypatch.setattr(monitor, "_resolve_auth", lambda: None)

        rows = db.get_active_sl_states(mode="live")
        kept = monitor._drop_flat_rows(rows)

        assert len(kept) == 1
