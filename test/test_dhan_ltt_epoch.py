"""Dhan live-feed last-trade-time units.

Dhan stamps ``ltt`` as IST wall-clock encoded as a UTC epoch, so the raw value
runs exactly 5h30m ahead of true time. Measured against the live feed, NIFTY's
ltt minus the wall clock was +5.50h.

The /trading chart buckets each tick by its ltt. An uncorrected value put the
first tick in a bucket 5.5 hours in the future, so every chart opened with a
fresh candle beside a bar that was still forming. The adapter now publishes a
true epoch, and these pin the conversion.
"""

import time

import websocket_proxy  # noqa: F401  # loads adapters in the order the app does
from broker.dhan.streaming.dhan_adapter import (
    IST_OFFSET_SECONDS,
    DhanWebSocketAdapter,
    _ltt_to_epoch,
)


def test_shifted_ltt_becomes_true_epoch():
    now = int(time.time())
    assert _ltt_to_epoch(now + IST_OFFSET_SECONDS) == now


def test_missing_or_invalid_ltt_reports_zero():
    # Zero means "no exchange time", so the consumer falls back to its own clock.
    for raw in (None, 0, "", "abc", -5, IST_OFFSET_SECONDS):
        assert _ltt_to_epoch(raw) == 0


def test_normalized_packets_carry_the_true_epoch():
    adapter = DhanWebSocketAdapter.__new__(DhanWebSocketAdapter)
    now = int(time.time())
    for kind in ("ticker", "quote", "full"):
        packet = {"type": kind, "ltp": 100.0, "ltt": now + IST_OFFSET_SECONDS}
        out = adapter._normalize_5depth_data(packet, "RELIANCE", "NSE")
        assert out["ltt"] == now, kind
