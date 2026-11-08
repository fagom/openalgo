"""
IV Analytics Service

Realized volatility, Variance Risk Premium, and IV Rank/Percentile for one
underlying -- the pieces IV Smile does not already compute, built on top of
its ATM IV figure.

Realized vol and VRP need nothing beyond daily OHLC history, which every
broker plugin already serves, so they work from the first call. IV Rank and
IV Percentile need a distribution of *past* IV readings, which no broker API
can supply retroactively; they are built from database.iv_history_db, one
row per trading day, growing from whatever day this feature shipped. Until
enough days have accumulated the response says so explicitly rather than
ranking today's IV against a handful of points as if it were a full year.
"""

import math
from datetime import datetime
from typing import Any

from database.iv_history_db import get_iv_history, record_atm_iv
from services.history_service import get_history
from utils.logging import get_logger

logger = get_logger(__name__)

#: Trading days of daily closes used for the realized-vol window. 20 trading
#: days is about a month -- short enough to react to a recent regime change,
#: long enough not to be dominated by one or two outlier sessions.
RV_WINDOW_DAYS = 20
#: Calendar lookback for the history request. Wider than RV_WINDOW_DAYS so
#: weekends and holidays still leave RV_WINDOW_DAYS trading days inside it.
RV_LOOKBACK_CALENDAR_DAYS = 40
TRADING_DAYS_PER_YEAR = 252
#: Below this many stored days, a rank or percentile would be reading a
#: handful of points as if they were a representative year.
MIN_DAYS_FOR_RANK = 20


def _daily_closes_and_ranges(
    underlying: str, exchange: str, api_key: str
) -> tuple[list[float], list[tuple[float, float]]]:
    """Recent daily closes, and (high, low) pairs, oldest first."""
    end = datetime.now().strftime("%Y-%m-%d")
    start_ts = datetime.now().timestamp() - RV_LOOKBACK_CALENDAR_DAYS * 86400
    start = datetime.fromtimestamp(start_ts).strftime("%Y-%m-%d")

    success, resp, _ = get_history(
        symbol=underlying,
        exchange=exchange,
        interval="D",
        start_date=start,
        end_date=end,
        api_key=api_key,
    )
    if not success or resp.get("status") != "success":
        return [], []

    bars = resp.get("data") or []
    bars = bars[-(RV_WINDOW_DAYS + 1) :]  # +1: N closes need N+1 points for N returns
    closes = [b["close"] for b in bars if b.get("close")]
    ranges = [
        (b["high"], b["low"]) for b in bars if b.get("high") and b.get("low") and b["low"] > 0
    ]
    return closes, ranges


def _close_to_close_rv(closes: list[float]) -> float | None:
    """Annualized close-to-close realized vol, in IV points (percent)."""
    if len(closes) < 2:
        return None
    log_returns = [
        math.log(closes[i] / closes[i - 1]) for i in range(1, len(closes)) if closes[i - 1] > 0
    ]
    if len(log_returns) < 2:
        return None
    mean = sum(log_returns) / len(log_returns)
    variance = sum((r - mean) ** 2 for r in log_returns) / (len(log_returns) - 1)
    return math.sqrt(variance) * math.sqrt(TRADING_DAYS_PER_YEAR) * 100


def _parkinson_rv(ranges: list[tuple[float, float]]) -> float | None:
    """Annualized Parkinson range-based realized vol, in IV points (percent).

    Uses each day's high/low instead of only its close, so it reads a wide
    intraday swing that closed flat -- a close-to-close estimator would
    read that day as zero.
    """
    if len(ranges) < 2:
        return None
    squared_log_ranges = [math.log(h / low) ** 2 for h, low in ranges if h > 0 and low > 0]
    if not squared_log_ranges:
        return None
    variance = sum(squared_log_ranges) / (4 * len(squared_log_ranges) * math.log(2))
    return math.sqrt(variance) * math.sqrt(TRADING_DAYS_PER_YEAR) * 100


def _rank_and_percentile(history: list[float], value: float) -> tuple[float | None, float | None]:
    """Where `value` sits in `history`: rank (0-100, range position) and percentile (0-100, below-it share)."""
    if len(history) < MIN_DAYS_FOR_RANK:
        return None, None
    lo, hi = min(history), max(history)
    rank = 50.0 if hi == lo else (value - lo) / (hi - lo) * 100
    below = sum(1 for h in history if h <= value)
    percentile = below / len(history) * 100
    return round(rank, 1), round(percentile, 1)


def get_iv_analytics(
    underlying: str, exchange: str, atm_iv: float | None, api_key: str
) -> dict[str, Any]:
    """Realized vol, VRP, and IV Rank/Percentile for one underlying.

    `exchange` is the underlying's own exchange (e.g. NSE_INDEX), the same
    one IV Smile already resolves options from -- not the options exchange.
    Returns an empty-ish dict with nulls on any failure; this is additive
    data for a page that already has something to show without it.
    """
    result: dict[str, Any] = {
        "realized_vol_close": None,
        "realized_vol_parkinson": None,
        "vrp": None,
        "iv_rank": None,
        "iv_percentile": None,
        "iv_history_days": 0,
    }

    if atm_iv is not None and atm_iv > 0:
        record_atm_iv(underlying, exchange, atm_iv)

    try:
        closes, ranges = _daily_closes_and_ranges(underlying, exchange, api_key)
        rv_close = _close_to_close_rv(closes)
        rv_parkinson = _parkinson_rv(ranges)
        result["realized_vol_close"] = round(rv_close, 2) if rv_close is not None else None
        result["realized_vol_parkinson"] = (
            round(rv_parkinson, 2) if rv_parkinson is not None else None
        )
        if atm_iv is not None and rv_close is not None:
            result["vrp"] = round(atm_iv - rv_close, 2)
    except Exception as e:
        logger.exception(f"Error computing realized vol for {exchange}:{underlying}: {e}")

    try:
        history = get_iv_history(underlying, exchange, exclude_date=datetime.now().date())
        result["iv_history_days"] = len(history)
        if atm_iv is not None:
            rank, percentile = _rank_and_percentile(history, atm_iv)
            result["iv_rank"] = rank
            result["iv_percentile"] = percentile
    except Exception as e:
        logger.exception(f"Error computing IV rank for {exchange}:{underlying}: {e}")

    return result
