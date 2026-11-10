# services/trade_reasoning_service.py
"""
Per-trade AI reasoning: was this trade well-timed, based on the price action
around its entry and exit - not just whether it made money.

Price-action based rather than a manually-tagged setup, per the trader's own
choice: the model is given a short numeric summary of what the candles did
leading into the entry and after it, plus the trade's own facts, and asked to
judge the entry/exit timing. The underlying text generation
(services/agent/one_shot.py) reuses whichever model the trader configured as
their agent default, including a local Ollama model.

Nothing here raises: a trade that could not be reasoned about (broker busy,
no candle data, model unreachable) gets a trader-facing fallback note instead
of failing the EOD job or the on-demand Analyze call that asked for it.
"""

import re
from datetime import datetime

import pytz

from services.agent.one_shot import generate_text
from services.broker_busy import BrokerBusyError
from services.history_service import get_history
from utils.logging import get_logger

logger = get_logger(__name__)

IST = pytz.timezone("Asia/Kolkata")

#: How far back from the entry to pull candles, to describe the move leading
#: into it (e.g. "entered after a sharp run-up" vs "entered in a quiet range").
LOOKBACK_MINUTES = 120

#: Candle size for the price-action summary. Fine enough to describe an
#: intraday move, coarse enough to keep the candle count (and prompt size)
#: small for a day's worth of context.
INTERVAL = "5m"

VERDICT_RE = re.compile(r"verdict\s*:\s*(good|neutral|poor)", re.IGNORECASE)
VALID_VERDICTS = {"good", "neutral", "poor"}

FALLBACK_TEXT = (
    "Could not generate a reasoning note for this trade right now. "
    "Try again from the trade's Analyze button."
)


def _epoch_to_ist(value) -> datetime | None:
    if value is None:
        return None
    try:
        return datetime.fromtimestamp(float(value), tz=IST)
    except (TypeError, ValueError, OSError):
        return None


def _candle_time(raw) -> datetime | None:
    """A candle's own timestamp field, tolerant of epoch seconds or a string."""
    if raw is None:
        return None
    try:
        return datetime.fromtimestamp(float(raw), tz=IST)
    except (TypeError, ValueError, OSError):
        pass
    try:
        import pandas as pd

        parsed = pd.to_datetime(raw)
        if parsed.tzinfo is None:
            return parsed.tz_localize("UTC").tz_convert(IST).to_pydatetime()
        return parsed.tz_convert(IST).to_pydatetime()
    except Exception:
        return None


def build_context(trade: dict, auth_token: str, broker: str) -> str:
    """A short numeric summary of the price action around this trade.

    Returns an honest "price data unavailable" string on any failure, rather
    than raising - the caller can still reason from the trade's own numbers.
    """
    entry_time = _epoch_to_ist(trade.get("entry_time"))
    exit_time = _epoch_to_ist(trade.get("exit_time"))
    if entry_time is None or exit_time is None:
        return "Price data unavailable for this trade."

    day = entry_time.date().isoformat()
    try:
        success, response, _status = get_history(
            symbol=trade.get("symbol"),
            exchange=trade.get("exchange"),
            interval=INTERVAL,
            start_date=day,
            end_date=day,
            auth_token=auth_token,
            broker=broker,
            background=True,
        )
    except BrokerBusyError:
        return "Price data unavailable (the broker's data feed was busy)."
    except Exception:
        logger.warning(f"Could not fetch candles for {trade.get('symbol')}", exc_info=True)
        return "Price data unavailable for this trade."

    if not success:
        return "Price data unavailable for this trade."

    candles = response.get("data") or []
    if not candles:
        return "No intraday candles were available for this trade's symbol today."

    parsed = []
    for candle in candles:
        when = _candle_time(candle.get("timestamp"))
        if when is None:
            continue
        parsed.append((when, candle))
    parsed.sort(key=lambda row: row[0])
    if not parsed:
        return "No intraday candles were available for this trade's symbol today."

    entry_epoch = entry_time.timestamp()
    lookback_start = entry_epoch - LOOKBACK_MINUTES * 60
    before_entry = [c for when, c in parsed if when.timestamp() <= entry_epoch]
    leading = [c for when, c in parsed if lookback_start <= when.timestamp() <= entry_epoch]
    after_entry = [c for when, c in parsed if when.timestamp() >= entry_epoch]

    def _pct(a, b):
        try:
            return round((float(b) - float(a)) / float(a) * 100, 2)
        except (TypeError, ValueError, ZeroDivisionError):
            return None

    lines = []
    if leading:
        move_into_entry = _pct(leading[0].get("open"), leading[-1].get("close"))
        session_high = max((c.get("high", 0) for c in before_entry), default=None)
        session_low = min((c.get("low", 0) for c in before_entry), default=None)
        if move_into_entry is not None:
            lines.append(f"Price moved {move_into_entry:+.2f}% in the ~2 hours before entry.")
        if session_high is not None and session_low is not None:
            lines.append(
                f"Session range before entry: low {session_low}, high {session_high}; "
                f"entered at {trade.get('entry_price')}."
            )
    if after_entry:
        post_high = max((c.get("high", 0) for c in after_entry), default=None)
        post_low = min((c.get("low", 0) for c in after_entry), default=None)
        if post_high is not None and post_low is not None:
            lines.append(
                f"After entry, price ranged between {post_low} and {post_high} before exit at "
                f"{trade.get('exit_price')}."
            )

    return " ".join(lines) if lines else "Price data was thin around this trade's timestamps."


def reasoning_prompt(trade: dict, price_context: str) -> str:
    return (
        "You are reviewing one closed trade for a retail trader, using only the price "
        "action described below - you were not given the trader's strategy or rules.\n\n"
        f"Symbol: {trade.get('symbol')} ({trade.get('exchange')}, {trade.get('product')})\n"
        f"Quantity: {trade.get('quantity')}\n"
        f"Entry price: {trade.get('entry_price')}\n"
        f"Exit price: {trade.get('exit_price')}\n"
        f"Realized PnL: {trade.get('pnl')}\n\n"
        f"Price action: {price_context}\n\n"
        "In 2-4 sentences, assess whether the entry and exit look well-timed given that "
        "price action (e.g. chasing an extended move, entering into resistance, exiting into "
        "weakness or strength, leaving profit on the table) - not just whether it made money. "
        "End your answer with exactly one line in this format, nothing after it:\n"
        "VERDICT: good|neutral|poor"
    )


def _parse_verdict(text: str) -> tuple[str, str]:
    """(cleaned reasoning text with the VERDICT line removed, verdict label)."""
    match = VERDICT_RE.search(text)
    verdict = match.group(1).lower() if match else "unrated"
    if verdict not in VALID_VERDICTS:
        verdict = "unrated"
    cleaned = VERDICT_RE.sub("", text).strip()
    # Drop a trailing "VERDICT:" label line even if the regex above missed the
    # value (e.g. the model answered just "VERDICT:" with nothing after it).
    cleaned = re.sub(r"(?im)^\s*verdict\s*:.*$", "", cleaned).strip()
    return cleaned, verdict


def analyze_trade(trade: dict, auth_token: str, broker: str) -> dict:
    """{"reasoning_text", "verdict", "model"} for one closed trade.

    Always returns a usable dict - never raises - so a batch loop in
    services/eod_reports_service.py or a single on-demand request in
    blueprints/eod_reports.py can treat every trade the same way.
    """
    price_context = build_context(trade, auth_token, broker)
    prompt = reasoning_prompt(trade, price_context)
    raw_text = generate_text(prompt)

    if not raw_text:
        return {"reasoning_text": FALLBACK_TEXT, "verdict": "unrated", "model": None}

    cleaned, verdict = _parse_verdict(raw_text)
    if not cleaned:
        cleaned = FALLBACK_TEXT
        verdict = "unrated"

    from services.agent import builder

    try:
        model_label = builder.resolve_model(None).display_name
    except Exception:
        model_label = None

    return {"reasoning_text": cleaned, "verdict": verdict, "model": model_label}
