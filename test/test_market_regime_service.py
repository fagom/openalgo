"""
Tests for services/market_regime_service.py. Pure math, no I/O: ADX and EMA
bias are checked against synthetic series with a known shape (a steady
trend vs. flat chop), not a single hand-computed reference value, since
Wilder's two-stage smoothing has no simple closed form to hand-verify
against -- the property that matters is that a real trend scores high and
real chop scores low.
"""

from services.market_regime_service import (
    ADX_RANGING,
    ADX_TRENDING,
    compute_adx,
    ema_trend_bias,
    max_pain_pull,
    synthesize_regime,
)


def _trending_series(n=60, step=10.0, start=100.0, rng=3.0):
    """A steady uptrend: every bar makes a new high, true range stays small."""
    closes = [start + i * step for i in range(n)]
    highs = [c + rng for c in closes]
    lows = [c - rng for c in closes]
    return highs, lows, closes


def _choppy_series(n=60, start=100.0, swing=5.0):
    """Oscillates around a flat centre -- no net direction, highs and lows alternate."""
    closes = [start + (swing if i % 2 == 0 else -swing) for i in range(n)]
    highs = [c + 1.0 for c in closes]
    lows = [c - 1.0 for c in closes]
    return highs, lows, closes


def test_adx_reads_high_on_a_steady_trend():
    highs, lows, closes = _trending_series()
    adx = compute_adx(highs, lows, closes)
    assert adx is not None
    assert adx >= ADX_TRENDING


def test_adx_reads_low_on_flat_chop():
    highs, lows, closes = _choppy_series()
    adx = compute_adx(highs, lows, closes)
    assert adx is not None
    assert adx <= ADX_RANGING


def test_adx_is_none_with_too_little_history():
    highs, lows, closes = _trending_series(n=10)
    assert compute_adx(highs, lows, closes) is None


def test_ema_bias_up_on_a_steady_uptrend():
    _, _, closes = _trending_series(n=60)
    bias, fast, slow = ema_trend_bias(closes)
    assert bias == "up"
    assert fast is not None and slow is not None
    assert fast > slow


def test_ema_bias_flat_when_price_never_moved():
    closes = [100.0] * 60
    bias, _, _ = ema_trend_bias(closes)
    assert bias == "flat"


def test_ema_bias_none_with_too_little_history():
    bias, fast, slow = ema_trend_bias([100.0] * 10)
    assert bias == "flat"
    assert fast is None
    assert slow is None


def test_max_pain_pull_pins_within_half_percent():
    # Spot above Max Pain reads positive: (spot - max_pain) / spot.
    pct, state = max_pain_pull(spot=10000, max_pain_strike=9960)  # +0.4%
    assert state == "pinning"
    assert pct == 0.4


def test_max_pain_pull_detached_beyond_half_percent():
    pct, state = max_pain_pull(spot=10000, max_pain_strike=9800)  # +2.0%
    assert state == "detached"
    assert pct == 2.0


def test_synthesize_regime_labels_trending_up_when_trend_signals_dominate():
    result = synthesize_regime(
        adx=30.0,
        trend_bias="up",
        net_gex=-500.0,
        max_pain_pct=-3.0,
        max_pain_state="detached",
        iv_rank=None,
        vrp=None,
    )
    assert result["label"] == "Trending up"
    assert result["votes_trend"] > result["votes_range"]


def test_synthesize_regime_labels_range_bound_when_range_signals_dominate():
    result = synthesize_regime(
        adx=12.0,
        trend_bias="flat",
        net_gex=500.0,
        max_pain_pct=0.1,
        max_pain_state="pinning",
        iv_rank=90.0,
        vrp=3.0,
    )
    assert result["label"] == "Range-bound"
    assert result["votes_range"] > result["votes_trend"]


def test_synthesize_regime_is_transitional_on_a_tie():
    result = synthesize_regime(
        adx=22.0,  # neither trending nor ranging: casts no vote
        trend_bias="flat",
        net_gex=None,  # casts no vote
        max_pain_pct=0.1,
        max_pain_state="pinning",  # 1 range vote
        iv_rank=None,
        vrp=None,
    )
    # Only Max Pain voted (range), ADX/GEX/IV abstained -- not a tie in this
    # case, so pin one more to force an actual tie and check the label.
    tied = synthesize_regime(
        adx=None,
        trend_bias="flat",
        net_gex=None,
        max_pain_pct=0.1,
        max_pain_state="detached",
        iv_rank=None,
        vrp=None,
    )
    assert tied["votes_trend"] == tied["votes_range"] == 0
    assert tied["label"] == "Transitional"
    assert result["label"] == "Range-bound"
