"""
Tests for the pure math in services/iv_analytics_service.py: the two
realized-vol estimators and the rank/percentile read against stored IV
history. No broker, no database -- each function is checked against a
hand-computed value or an exact hand-worked case.
"""

from services.iv_analytics_service import (
    MIN_DAYS_FOR_RANK,
    _close_to_close_rv,
    _parkinson_rv,
    _rank_and_percentile,
)


def test_close_to_close_rv_matches_hand_computation():
    closes = [100, 102, 101, 103, 105]
    rv = _close_to_close_rv(closes)
    assert abs(rv - 23.3384) < 0.01


def test_close_to_close_rv_needs_at_least_two_returns():
    assert _close_to_close_rv([100]) is None
    assert _close_to_close_rv([100, 101]) is None  # one return, variance undefined
    assert _close_to_close_rv([]) is None


def test_parkinson_rv_matches_hand_computation():
    ranges = [(101, 99), (103, 100), (102, 100), (104, 101), (106, 103)]
    rv = _parkinson_rv(ranges)
    assert abs(rv - 24.6658) < 0.01


def test_parkinson_rv_needs_at_least_two_days():
    assert _parkinson_rv([(101, 99)]) is None
    assert _parkinson_rv([]) is None


def test_rank_and_percentile_below_minimum_history_is_none():
    short_history = [15.0] * (MIN_DAYS_FOR_RANK - 1)
    rank, percentile = _rank_and_percentile(short_history, 15.0)
    assert rank is None
    assert percentile is None


def test_rank_and_percentile_at_the_top_of_its_range():
    history = list(range(MIN_DAYS_FOR_RANK))  # 0..19
    rank, percentile = _rank_and_percentile([float(h) for h in history], 19.0)
    assert rank == 100.0
    assert percentile == 100.0


def test_rank_and_percentile_at_the_bottom_of_its_range():
    history = [float(h) for h in range(MIN_DAYS_FOR_RANK)]  # 0..19
    rank, percentile = _rank_and_percentile(history, 0.0)
    assert rank == 0.0
    # The value itself counts as "at or below," so a bottom reading does
    # not score a 0 percentile -- it is at or below 1 of 20 points.
    assert percentile == 5.0


def test_rank_and_percentile_flat_history_has_no_range_to_rank_within():
    history = [15.0] * MIN_DAYS_FOR_RANK
    rank, percentile = _rank_and_percentile(history, 15.0)
    assert rank == 50.0  # no hi/lo spread: neither rich nor cheap is defined
    assert percentile == 100.0
