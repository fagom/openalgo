"""
report_status tells the Daily Reports page whether today's run for a market
class is simply not due yet, or is due and silently missing (the "you
probably weren't logged in" banner case) versus already generated.
"""

import importlib
from datetime import date, datetime

import pytest


@pytest.fixture
def modules(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'eod_reports.db'}")
    import database.eod_reports_db as db_module
    import services.eod_reports_service as service_module

    db_module = importlib.reload(db_module)
    db_module.init_db()
    service_module = importlib.reload(service_module)
    yield db_module, service_module
    db_module.db_session.remove()


def _freeze_at(monkeypatch, service_module, hour, minute):
    class _FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 11, 10, hour, minute, tzinfo=tz)

    monkeypatch.setattr(service_module, "datetime", _FrozenDatetime)


class TestReportStatus:
    def test_not_due_yet_is_never_flagged_missing(self, modules, monkeypatch):
        _db, service = modules
        _freeze_at(monkeypatch, service, 10, 0)  # before either cutoff

        status = service.report_status("u1", "zerodha")

        assert status["equity_fo"] == {"due": False, "generated": False}
        assert status["commodity"] == {"due": False, "generated": False}

    def test_due_and_ungenerated_is_the_missing_case(self, modules, monkeypatch):
        _db, service = modules
        _freeze_at(monkeypatch, service, 16, 0)  # past equity_fo's 15:40, before commodity's 23:45

        status = service.report_status("u1", "zerodha")

        assert status["equity_fo"] == {"due": True, "generated": False}
        assert status["commodity"] == {"due": False, "generated": False}

    def test_due_and_generated_is_not_missing(self, modules, monkeypatch):
        db, service = modules
        db.upsert_trade_analysis("u1", "zerodha", date(2026, 11, 10), {}, "equity_fo")
        _freeze_at(monkeypatch, service, 16, 0)

        status = service.report_status("u1", "zerodha")

        assert status["equity_fo"] == {"due": True, "generated": True}
