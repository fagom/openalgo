# services/charges/charges_calculator.py
"""
Applies services.charges.statutory_rates to tradebook rows.

Input is the broker-agnostic trade shape every consumer of
services/tradebook_service.py already relies on: symbol, exchange, product,
action (BUY/SELL), quantity, average_price, trade_value. Pure computation, no
DB/IO, so it is the same for every broker and easy to unit-test against
hand-computed fixtures.
"""

from typing import Any

from services.charges.statutory_rates import GST_RATE, RATES, classify_segment


def _turnover(trade: dict[str, Any]) -> float:
    """What the statutory percentages apply to.

    ``trade_value`` is already quantity times price times the instrument's
    quotation multiplier (services/tradebook_service.py's broker adapters
    compute it that way, e.g. Zerodha's ``_trade_value``), so it is used
    directly rather than re-deriving quantity*price here, which would be wrong
    for contracts quoted per a multiple unit (MCX GOLDGUINEA and similar).
    """
    value = trade.get("trade_value")
    if value is None:
        value = float(trade.get("quantity") or 0) * float(trade.get("average_price") or 0)
    try:
        return abs(float(value))
    except (TypeError, ValueError):
        return 0.0


def compute_trade_charges(
    trade: dict[str, Any], brokerage_settings: dict[str, float] | None = None
) -> dict[str, Any]:
    """The statutory charges and brokerage for one executed fill.

    Returns a flat dict of the components the Daily Charges tab renders,
    plus ``segment``/``side``/``turnover`` for grouping and auditing.
    """
    brokerage_settings = brokerage_settings or {}
    side = str(trade.get("action") or "").upper()
    exchange = trade.get("exchange") or ""
    product = trade.get("product") or ""
    symbol = trade.get("symbol") or ""

    segment = classify_segment(exchange, product, symbol)
    rates = RATES[segment]
    turnover = _turnover(trade)
    is_buy = side == "BUY"

    stt = turnover * (rates["stt_buy"] if is_buy else rates["stt_sell"])
    stamp_duty = turnover * (rates["stamp_buy"] if is_buy else rates["stamp_sell"])
    txn_rate = rates["txn_bse"] if str(exchange).upper() == "BSE" else rates["txn_nse"]
    exchange_txn_charge = turnover * txn_rate
    sebi_fee = turnover * rates["sebi"]
    brokerage = float(brokerage_settings.get(segment, 0.0) or 0.0)

    gst = GST_RATE * (brokerage + exchange_txn_charge + sebi_fee)
    total_charges = stt + stamp_duty + exchange_txn_charge + sebi_fee + brokerage + gst

    return {
        "segment": segment,
        "side": side,
        "symbol": symbol,
        "turnover": round(turnover, 2),
        "brokerage": round(brokerage, 2),
        "stt": round(stt, 2),
        "stamp_duty": round(stamp_duty, 2),
        "exchange_txn_charge": round(exchange_txn_charge, 2),
        "sebi_fee": round(sebi_fee, 2),
        "gst": round(gst, 2),
        "total_charges": round(total_charges, 2),
    }


_SUM_FIELDS = (
    "turnover",
    "brokerage",
    "stt",
    "stamp_duty",
    "exchange_txn_charge",
    "sebi_fee",
    "gst",
    "total_charges",
)


def aggregate_daily_charges(
    trades: list[dict[str, Any]], brokerage_settings: dict[str, float] | None = None
) -> dict[str, dict[str, Any]]:
    """Per-segment charge totals for a day's trades.

    Returns ``{segment: {trade_count, turnover, brokerage, stt, ...}}`` - one
    entry per segment actually traded that day, which is exactly what the
    ``daily_charges`` table stores one row per.
    """
    by_segment: dict[str, dict[str, Any]] = {}
    for trade in trades:
        charged = compute_trade_charges(trade, brokerage_settings)
        segment = charged["segment"]
        bucket = by_segment.setdefault(
            segment, {"segment": segment, "trade_count": 0, **dict.fromkeys(_SUM_FIELDS, 0.0)}
        )
        bucket["trade_count"] += 1
        for field in _SUM_FIELDS:
            bucket[field] = round(bucket[field] + charged[field], 2)
    return by_segment
