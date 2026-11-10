# services/trade_analysis_service.py
"""
Rule-based (not AI/LLM) end-of-day trade analysis.

A tradebook lists executed fills, not closed round-trips, so "today's trade
performance" first requires matching buys against sells per symbol with FIFO
lot matching - standard and deterministic, not statistical. The functions
below then compute plain arithmetic over the resulting closed trades: win
rate, profit factor, best/worst trade. No model call anywhere in this module.
"""

from collections import deque
from typing import Any


def match_fifo_trades(fills: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Closed round-trips from a list of fills, oldest-lot-first.

    ``fills`` are the broker-agnostic trade rows from
    services/tradebook_service.py, each expected to carry symbol, exchange,
    product, action, quantity, average_price and a parsed ``_sort_time`` (a
    sortable key the caller attaches - see services/eod_reports_service.py).
    Grouped by (symbol, exchange, product): two fills with the same symbol
    under different products (e.g. CNC vs MIS) are different positions and
    must not be matched against each other.
    """
    groups: dict[tuple, list[dict[str, Any]]] = {}
    for fill in fills:
        key = (fill.get("symbol"), fill.get("exchange"), fill.get("product"))
        groups.setdefault(key, []).append(fill)

    closed: list[dict[str, Any]] = []
    for (symbol, exchange, product), group_fills in groups.items():
        ordered = sorted(group_fills, key=lambda f: f.get("_sort_time") or 0)
        queue: deque[dict[str, Any]] = deque()  # each: {qty (signed), price, time}

        for fill in ordered:
            side = str(fill.get("action") or "").upper()
            sign = 1 if side == "BUY" else -1
            qty = abs(float(fill.get("quantity") or 0))
            price = float(fill.get("average_price") or 0)
            time = fill.get("_sort_time")

            remaining = qty * sign
            while remaining != 0 and queue and (queue[0]["qty"] > 0) != (remaining > 0):
                lot = queue[0]
                matched = min(abs(lot["qty"]), abs(remaining))
                lot_sign = 1 if lot["qty"] > 0 else -1
                # Realized PnL for the matched quantity: the long leg's entry
                # is whichever side opened first (the queued lot), the short
                # leg is this fill, so PnL is (exit - entry) * qty in the
                # direction of the original (queued) position.
                pnl = (price - lot["price"]) * matched * lot_sign
                closed.append(
                    {
                        "symbol": symbol,
                        "exchange": exchange,
                        "product": product,
                        "entry_price": lot["price"],
                        "exit_price": price,
                        "quantity": matched,
                        "pnl": round(pnl, 2),
                        "entry_time": lot["time"],
                        "exit_time": time,
                    }
                )
                lot["qty"] -= matched * lot_sign
                remaining -= matched * (1 if remaining > 0 else -1)
                if lot["qty"] == 0:
                    queue.popleft()

            if remaining != 0:
                queue.append({"qty": remaining, "price": price, "time": time})

    return closed


def _segment_for(trade: dict[str, Any]) -> str:
    from services.charges.statutory_rates import classify_segment

    return classify_segment(trade.get("exchange"), trade.get("product"), trade.get("symbol"))


def compute_trade_analysis(
    closed_trades: list[dict[str, Any]], total_charges: float = 0.0
) -> dict[str, Any]:
    """The day's stat summary from its closed round-trips.

    ``total_charges`` (the day's statutory charges + brokerage grand total,
    from aggregate_daily_charges) is subtracted from gross PnL to report a
    net-of-costs total, since that is the number that actually matters to a
    trader deciding whether the day was profitable.
    """
    total_trades = len(closed_trades)
    wins = [t for t in closed_trades if t["pnl"] > 0]
    losses = [t for t in closed_trades if t["pnl"] < 0]
    winning_trades = len(wins)
    losing_trades = len(losses)

    gross_profit = round(sum(t["pnl"] for t in wins), 2)
    gross_loss = round(abs(sum(t["pnl"] for t in losses)), 2)
    gross_pnl = round(sum(t["pnl"] for t in closed_trades), 2)

    win_rate = round(winning_trades / total_trades, 4) if total_trades else 0.0
    profit_factor = round(gross_profit / gross_loss, 2) if gross_loss > 0 else None
    avg_win = round(gross_profit / winning_trades, 2) if winning_trades else None
    avg_loss = round(gross_loss / losing_trades, 2) if losing_trades else None

    best_trade = max(closed_trades, key=lambda t: t["pnl"], default=None)
    worst_trade = min(closed_trades, key=lambda t: t["pnl"], default=None)

    segment_breakdown: dict[str, dict[str, Any]] = {}
    for trade in closed_trades:
        segment = _segment_for(trade)
        bucket = segment_breakdown.setdefault(segment, {"trade_count": 0, "pnl": 0.0, "wins": 0})
        bucket["trade_count"] += 1
        bucket["pnl"] = round(bucket["pnl"] + trade["pnl"], 2)
        if trade["pnl"] > 0:
            bucket["wins"] += 1
    for bucket in segment_breakdown.values():
        bucket["win_rate"] = round(bucket["wins"] / bucket["trade_count"], 4)
        del bucket["wins"]

    return {
        "total_trades": total_trades,
        "winning_trades": winning_trades,
        "losing_trades": losing_trades,
        "win_rate": win_rate,
        "gross_pnl": gross_pnl,
        "total_pnl": round(gross_pnl - (total_charges or 0.0), 2),
        "gross_profit": gross_profit,
        "gross_loss": gross_loss,
        "profit_factor": profit_factor,
        "avg_win": avg_win,
        "avg_loss": avg_loss,
        "best_trade_symbol": best_trade["symbol"] if best_trade else None,
        "best_trade_pnl": best_trade["pnl"] if best_trade else None,
        "worst_trade_symbol": worst_trade["symbol"] if worst_trade else None,
        "worst_trade_pnl": worst_trade["pnl"] if worst_trade else None,
        "segment_breakdown": segment_breakdown,
    }
