"""
Week-over-week and month-over-month trend for Trade Analysis
(database.eod_reports_db.get_trade_analysis_trend) - recomputed from each
period's summed trade/win/loss counts, not an average of each day's own
win_rate, so a single-trade day never carries the same weight as a thirty-
trade day.
"""

import importlib
from datetime import UTC, date, datetime, timedelta

import pytest


@pytest.fixture
def store(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'eod_reports.db'}")
    import database.eod_reports_db as module

    module = importlib.reload(module)
    module.init_db()
    yield module
    module.db_session.remove()


def stats(total_trades, winning_trades, pnl, gross_profit=None, gross_loss=0.0):
    losing_trades = total_trades - winning_trades
    return {
        "total_trades": total_trades,
        "winning_trades": winning_trades,
        "losing_trades": losing_trades,
        "win_rate": round(winning_trades / total_trades * 100, 2) if total_trades else 0.0,
        "total_pnl": pnl,
        "gross_profit": gross_profit if gross_profit is not None else max(pnl, 0.0),
        "gross_loss": gross_loss,
    }


class TestTradeAnalysisTrend:
    def test_two_days_in_the_same_iso_week_merge_into_one_point(self, store):
        monday = date(2026, 11, 9)  # a Monday
        tuesday = date(2026, 11, 10)

        store.upsert_trade_analysis("u1", "zerodha", monday, stats(1, 1, 100.0), "equity_fo")
        store.upsert_trade_analysis(
            "u1",
            "zerodha",
            tuesday,
            stats(29, 14, -50.0, gross_profit=500.0, gross_loss=-550.0),
            "equity_fo",
        )

        trend = store.get_trade_analysis_trend("u1", "zerodha", period="week", periods=4)

        assert len(trend) == 1
        point = trend[0]
        assert point["periodStart"] == monday.isoformat()
        assert point["totalTrades"] == 30
        assert point["winningTrades"] == 15
        assert point["totalPnl"] == 50.0
        # Recomputed from summed counts (15/30 = 50%), not averaged from the
        # two days' own win_rates (100% and ~48.3%), which would read ~74%.
        assert point["winRate"] == 50.0

    def test_both_market_classes_the_same_day_combine_into_one_point(self, store):
        day = date(2026, 11, 10)
        store.upsert_trade_analysis("u1", "zerodha", day, stats(1, 1, 100.0), "equity_fo")
        store.upsert_trade_analysis(
            "u1",
            "zerodha",
            day,
            stats(1, 0, -40.0, gross_profit=0.0, gross_loss=-40.0),
            "commodity",
        )

        trend = store.get_trade_analysis_trend("u1", "zerodha", period="week", periods=4)

        assert len(trend) == 1
        assert trend[0]["totalTrades"] == 2
        assert trend[0]["totalPnl"] == 60.0

    def test_different_months_are_separate_points(self, store):
        store.upsert_trade_analysis(
            "u1", "zerodha", date(2026, 10, 15), stats(5, 5, 500.0), "equity_fo"
        )
        store.upsert_trade_analysis(
            "u1",
            "zerodha",
            date(2026, 11, 5),
            stats(5, 0, -500.0, gross_profit=0.0, gross_loss=-500.0),
            "equity_fo",
        )

        trend = store.get_trade_analysis_trend("u1", "zerodha", period="month", periods=6)

        assert len(trend) == 2
        assert trend[0]["label"] == "Oct 2026"
        assert trend[1]["label"] == "Nov 2026"
        assert trend[0]["winRate"] == 100.0
        assert trend[1]["winRate"] == 0.0

    def test_no_data_is_an_empty_list(self, store):
        trend = store.get_trade_analysis_trend("u1", "zerodha", period="week", periods=4)
        assert trend == []

    def test_caps_periods_to_the_most_recent_requested(self, store):
        today = datetime.now(UTC).date()
        for i in range(5):
            store.upsert_trade_analysis(
                "u1", "zerodha", today - timedelta(weeks=i * 2), stats(1, 1, 10.0), "equity_fo"
            )

        trend = store.get_trade_analysis_trend("u1", "zerodha", period="week", periods=2)

        assert len(trend) <= 2
