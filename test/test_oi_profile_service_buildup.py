"""
Tests for the OI buildup classification in services/oi_profile_service.py.

Pure function, no broker or I/O: the four-quadrant read of a leg's price
move against its OI move.
"""

from services.oi_profile_service import _buildup_tag


def test_long_buildup_price_up_oi_up():
    assert _buildup_tag(price_change=1.5, oi_change=500) == "Long Buildup"


def test_short_buildup_price_down_oi_up():
    assert _buildup_tag(price_change=-1.5, oi_change=500) == "Short Buildup"


def test_short_covering_price_up_oi_down():
    assert _buildup_tag(price_change=1.5, oi_change=-500) == "Short Covering"


def test_long_unwinding_price_down_oi_down():
    assert _buildup_tag(price_change=-1.5, oi_change=-500) == "Long Unwinding"


def test_flat_price_has_no_reading():
    # A flat leg says nothing about who is positioning, so it is None, not a
    # default quadrant -- a caller that shows None as "Long Buildup" is
    # showing the wrong corner, not a neutral blank.
    assert _buildup_tag(price_change=0, oi_change=500) is None


def test_flat_oi_has_no_reading():
    assert _buildup_tag(price_change=1.5, oi_change=0) is None


def test_both_flat_has_no_reading():
    assert _buildup_tag(price_change=0, oi_change=0) is None
