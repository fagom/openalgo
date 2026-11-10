"""
Market Regime Service

Pure math, no I/O: combines price-action trend strength (ADX, EMA bias),
dealer gamma positioning (net GEX sign), Max Pain pull and the IV Rank/VRP
context already on the Instrument page into one heuristic read -- "trending",
"range-bound", or "transitional" -- with the reasoning spelled out rather
than a single number asking to be trusted blind.

None of this is a signal to trade on by itself. It is four established,
independently-computed readings cross-referenced, same as a trader would do
by eye across four different tools; this just saves the tab-switching.
"""

import math
from typing import Any

#: Wilder's own period for ADX and its DI/TR smoothing.
ADX_PERIOD = 14
ADX_TRENDING = 25.0
ADX_RANGING = 20.0

EMA_FAST = 20
EMA_SLOW = 50

#: Within this % of spot, Max Pain is read as actively pinning price (a
#: range/reversion pull) rather than merely nearby.
MAX_PAIN_PIN_PCT = 0.5


def _ema_series(values: list[float], period: int) -> list[float] | None:
    """Full EMA series (same length as `values`, first `period-1` are seed-only)."""
    if len(values) < period:
        return None
    k = 2 / (period + 1)
    ema = [sum(values[:period]) / period]
    for v in values[period:]:
        ema.append(v * k + ema[-1] * (1 - k))
    return ema


def ema_trend_bias(closes: list[float]) -> tuple[str, float | None, float | None]:
    """EMA20 vs EMA50: 'up', 'down', or 'flat' (within noise), plus both EMAs."""
    fast_series = _ema_series(closes, EMA_FAST)
    slow_series = _ema_series(closes, EMA_SLOW)
    if not fast_series or not slow_series:
        return "flat", None, None

    fast, slow = fast_series[-1], slow_series[-1]
    # Within 0.1% of each other reads as flat rather than a coin-flip up/down.
    if slow == 0 or abs(fast - slow) / slow < 0.001:
        return "flat", round(fast, 2), round(slow, 2)
    return ("up" if fast > slow else "down"), round(fast, 2), round(slow, 2)


def compute_adx(
    highs: list[float], lows: list[float], closes: list[float], period: int = ADX_PERIOD
) -> float | None:
    """Wilder's ADX: trend strength (0-100+), independent of direction.

    >= ADX_TRENDING reads as trending, <= ADX_RANGING as range-bound; the
    band between is transitional -- a regime that has not committed either
    way yet.
    """
    n = len(closes)
    if n < period * 2 + 1 or len(highs) != n or len(lows) != n:
        return None

    trs: list[float] = []
    plus_dms: list[float] = []
    minus_dms: list[float] = []
    for i in range(1, n):
        tr = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        )
        up_move = highs[i] - highs[i - 1]
        down_move = lows[i - 1] - lows[i]
        plus_dm = up_move if (up_move > down_move and up_move > 0) else 0.0
        minus_dm = down_move if (down_move > up_move and down_move > 0) else 0.0
        trs.append(tr)
        plus_dms.append(plus_dm)
        minus_dms.append(minus_dm)

    def wilder_smooth(series: list[float]) -> list[float]:
        smoothed = [sum(series[:period])]
        for v in series[period:]:
            smoothed.append(smoothed[-1] - smoothed[-1] / period + v)
        return smoothed

    smoothed_tr = wilder_smooth(trs)
    smoothed_plus_dm = wilder_smooth(plus_dms)
    smoothed_minus_dm = wilder_smooth(minus_dms)

    dx_values: list[float] = []
    for tr, pdm, mdm in zip(smoothed_tr, smoothed_plus_dm, smoothed_minus_dm, strict=True):
        if tr == 0:
            continue
        plus_di = 100 * pdm / tr
        minus_di = 100 * mdm / tr
        di_sum = plus_di + minus_di
        if di_sum == 0:
            continue
        dx_values.append(100 * abs(plus_di - minus_di) / di_sum)

    if len(dx_values) < period:
        return None

    # First ADX is a simple average of the first `period` DX values, then
    # Wilder-smoothed like TR/DM above -- the standard two-stage definition.
    adx = sum(dx_values[:period]) / period
    for dx in dx_values[period:]:
        adx = (adx * (period - 1) + dx) / period
    return round(adx, 1) if not math.isnan(adx) else None


def max_pain_pull(spot: float, max_pain_strike: float) -> tuple[float, str]:
    """% distance from spot to Max Pain, and whether it reads as an active pin."""
    if spot <= 0:
        return 0.0, "unknown"
    pct = round((spot - max_pain_strike) / spot * 100, 2)
    return pct, "pinning" if abs(pct) <= MAX_PAIN_PIN_PCT else "detached"


def synthesize_regime(
    adx: float | None,
    trend_bias: str,
    net_gex: float | None,
    max_pain_pct: float,
    max_pain_state: str,
    iv_rank: float | None,
    vrp: float | None,
) -> dict[str, Any]:
    """Combine the four readings into one label and a one-line rationale.

    Each signal contributes a vote (trend / range / neutral); the label is
    whichever side has more votes, "Transitional" on a tie. The rationale
    names every signal that actually voted, so the label is never a black box.
    """
    votes = {"trend": 0, "range": 0}
    reasons: list[str] = []

    if adx is not None:
        if adx >= ADX_TRENDING:
            votes["trend"] += 1
            reasons.append(f"ADX {adx} (trending) with EMA bias {trend_bias}")
        elif adx <= ADX_RANGING:
            votes["range"] += 1
            reasons.append(f"ADX {adx} (range-bound)")
        else:
            reasons.append(f"ADX {adx} (transitional)")

    if net_gex is not None:
        if net_gex < 0:
            votes["trend"] += 1
            reasons.append("negative net GEX (dealers short gamma, moves tend to amplify)")
        elif net_gex > 0:
            votes["range"] += 1
            reasons.append("positive net GEX (dealers long gamma, moves tend to dampen)")

    if max_pain_state == "pinning":
        votes["range"] += 1
        reasons.append(f"spot within {MAX_PAIN_PIN_PCT}% of Max Pain (pinning)")
    else:
        reasons.append(f"spot {max_pain_pct:+.2f}% from Max Pain (detached)")

    if iv_rank is not None and vrp is not None:
        if iv_rank <= 20 and vrp <= 0:
            votes["trend"] += 1
            reasons.append(f"IV Rank {iv_rank} low with VRP {vrp} (compression, breakout-prone)")
        elif iv_rank >= 80 and vrp > 0:
            votes["range"] += 1
            reasons.append(f"IV Rank {iv_rank} high with VRP {vrp} (premium rich, reversion-prone)")

    if votes["trend"] > votes["range"]:
        label = "Trending" if trend_bias == "flat" else f"Trending {trend_bias}"
    elif votes["range"] > votes["trend"]:
        label = "Range-bound"
    else:
        label = "Transitional"

    return {
        "label": label,
        "votes_trend": votes["trend"],
        "votes_range": votes["range"],
        "rationale": reasons,
    }
