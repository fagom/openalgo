#!/usr/bin/env python
"""
EMA 20 Pullback Screener (daily swing, MTF universe)

Finds stocks in an established uptrend that have pulled back to a rising
20 EMA and printed a bullish candle, and sends the list to Telegram with an
entry, a stop loss, two targets and a risk-based quantity. It places no
orders.

The setup, every condition required:

  Liquidity   price >= MIN_PRICE and 20-day average turnover >= MIN_TURNOVER
  Trend       close > EMA50 > EMA200, EMA20 > EMA50, EMA50 and EMA20 rising
  Strength    ADX(14) >= MIN_ADX
  Prior leg   the 60-day high was made 2..20 sessions ago (a real up-leg,
              and today is a pullback from it, not a breakout)
  Pullback    a low in the last 3 sessions came within TOUCH_ATR x ATR of EMA20
  Held        close above EMA20 today, no close below EMA50 in the last 3
  Not chased  close no more than MAX_DIST_ATR x ATR above EMA20
  Momentum    RSI(14) between RSI_MIN and RSI_MAX (cooled off, not broken)
  Trigger     green candle closing in the upper half of its range
  Rel. str.   3-month return beats NIFTY (when REQUIRE_RS is on)

Trade plan for each pick:

  Entry   buy above the trigger candle's high (a stop-buy, not at market)
  SL      the lower of (pullback low - 0.2 ATR) and (entry - 1 ATR)
  T1, T2  T1_R and T2_R times the risk
  Qty     RISK_PER_TRADE / (entry - SL), capped so the MTF margin
          (position value / leverage) stays within MAX_MARGIN_PER_TRADE

Stock universe: MTF_UNIVERSE below, maintained by hand in this file. Each
entry is a symbol and the leverage the broker's MTF list gives it. Only
stocks at MIN_LEVERAGE or above are scanned, and the list is capped at
MAX_UNIVERSE; the script refuses to run if the list grows past it, rather
than silently dropping names. ETFs are left out: this is a stock setup.

Running it: the /python page only starts and stops a script, so the timing
lives here. Once started, the script stays running and scans at each of
RUN_TIMES (09:00 and 15:45 IST) on every NSE trading day, asking the platform's
exchange calendar whether today is one, so holidays are skipped and special
sessions are not. 15:45 scans today's close; 09:00 sends that same list again
before the open. Every scan uses completed daily candles only, so a run before
the close reports the previous session.

Give it a /python schedule of about 08:55 to 16:00, Mon-Fri. A run time
missed by up to RUN_GRACE_MIN minutes (the script started late) still fires.
Each run time is recorded in RUN_LOG once it fires, so a restart never sends
the same message twice.
"""

import json
import os
import time
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
from openalgo import api, ta

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

TELEGRAM_USERNAME = "your_openalgo_login"  # OpenAlgo login name, not the Telegram handle

RUN_TIMES = ("09:00", "15:45")  # IST, on NSE trading days
RUN_GRACE_MIN = 30  # a run time missed by up to this many minutes still fires
POLL_SEC = 20  # how often the idle loop checks the clock
RUN_LOG = Path(__file__).with_name(f"{Path(__file__).stem}.runs.json")

# Symbol -> MTF leverage (1 / margin %), from the broker's MTF approved list.
# The 100 highest-leverage stocks on that list, 4.27x and above (roughly the
# NIFTY 100); ETFs excluded. The next names down are PFC, RECLTD and DLF at 4.26x.
# To swap a name, replace a line here with another stock at 3x or above.
MTF_UNIVERSE = {
    "ALKEM": 4.55,
    "APOLLOHOSP": 4.55,
    "ASIANPAINT": 4.55,
    "AXISBANK": 4.55,
    "BAJAJ-AUTO": 4.55,
    "BAJAJFINSV": 4.55,
    "BHARTIARTL": 4.55,
    "BRITANNIA": 4.55,
    "CIPLA": 4.55,
    "COALINDIA": 4.55,
    "COLPAL": 4.55,
    "DABUR": 4.55,
    "DIVISLAB": 4.55,
    "DRREDDY": 4.55,
    "FEDERALBNK": 4.55,
    "GODREJCP": 4.55,
    "GRASIM": 4.55,
    "HAVELLS": 4.55,
    "HDFCBANK": 4.55,
    "HDFCLIFE": 4.55,
    "HINDUNILVR": 4.55,
    "ICICIBANK": 4.55,
    "ICICIGI": 4.55,
    "ITC": 4.55,
    "KOTAKBANK": 4.55,
    "LUPIN": 4.55,
    "MARICO": 4.55,
    "MARUTI": 4.55,
    "UNITDSPR": 4.55,
    "NESTLEIND": 4.55,
    "NTPC": 4.55,
    "PAGEIND": 4.55,
    "PIDILITIND": 4.55,
    "POWERGRID": 4.55,
    "RELIANCE": 4.55,
    "SBILIFE": 4.55,
    "SBIN": 4.55,
    "SHREECEM": 4.55,
    "SUNPHARMA": 4.55,
    "TATACONSUM": 4.55,
    "TITAN": 4.55,
    "TORNTPHARM": 4.55,
    "ULTRACEMCO": 4.55,
    "WIPRO": 4.55,
    "ZYDUSLIFE": 4.55,
    "JSWSTEEL": 4.55,
    "ONGC": 4.55,
    "TATAPOWER": 4.55,
    "LICI": 4.55,
    "DMART": 4.55,
    "EICHERMOT": 4.44,
    "HCLTECH": 4.44,
    "HEROMOTOCO": 4.44,
    "IOC": 4.44,
    "LT": 4.44,
    "SBICARD": 4.44,
    "TCS": 4.44,
    "TVSMOTOR": 4.44,
    "AUROPHARMA": 4.35,
    "BAJFINANCE": 4.35,
    "BEL": 4.35,
    "BOSCHLTD": 4.35,
    "BPCL": 4.35,
    "CONCOR": 4.35,
    "CROMPTON": 4.35,
    "CUMMINSIND": 4.35,
    "GAIL": 4.35,
    "GLENMARK": 4.35,
    "ICICIPRULI": 4.35,
    "INFY": 4.35,
    "M&M": 4.35,
    "MPHASIS": 4.35,
    "PETRONET": 4.35,
    "PIIND": 4.35,
    "SRF": 4.35,
    "TECHM": 4.35,
    "ASTRAL": 4.35,
    "INDHOTEL": 4.35,
    "OBEROIRLTY": 4.35,
    "TATASTEEL": 4.35,
    "IDFCFIRSTB": 4.35,
    "TMPV": 4.35,
    "NMDC": 4.35,
    "BANKBARODA": 4.35,
    "PNB": 4.35,
    "CANBK": 4.35,
    "HINDALCO": 4.35,
    "NHPC": 4.35,
    "FORTIS": 4.35,
    "VBL": 4.35,
    "APLAPOLLO": 4.35,
    "JINDALSTEL": 4.35,
    "JIOFIN": 4.35,
    "MANKIND": 4.35,
    "MFSL": 4.35,
    "NYKAA": 4.35,
    "ABB": 4.33,
    "JUBLFOOD": 4.28,
    "NAUKRI": 4.27,
    "LTM": 4.27,
}
MIN_LEVERAGE = 3.0
MAX_UNIVERSE = 100
EXCHANGE = "NSE"
BENCHMARK = ("NIFTY", "NSE_INDEX")
HISTORY_SOURCE = "api"  # "db" reads from Historify: much faster, no broker rate limits
REQUEST_GAP_SEC = 0.35  # pause between history calls to respect broker limits
LOOKBACK_DAYS = 420  # calendar days, enough for a settled 200 EMA

MIN_PRICE = 50.0
MIN_TURNOVER = 10_00_00_000  # Rs 10 crore average daily traded value
MIN_ADX = 20.0
TOUCH_ATR = 0.25
MAX_DIST_ATR = 1.0
RSI_MIN, RSI_MAX = 40.0, 65.0
REQUIRE_RS = True

ENTRY_BUFFER_PCT = 0.10
MAX_RISK_PCT = 7.0  # skip setups whose stop is further than this from entry
T1_R, T2_R = 1.5, 3.0
RISK_PER_TRADE = 5_000  # Rs lost if the stop is hit
MAX_MARGIN_PER_TRADE = 50_000  # Rs of your own money per position (value / leverage)
ENTRY_VALID_SESSIONS = 2
TIME_STOP_SESSIONS = 10

TOP_N = 15
TICK = 0.05
IST = ZoneInfo("Asia/Kolkata")
MIN_BARS = 220


# ---------------------------------------------------------------------------
# Analysis (pure: no I/O, so it can be tested on synthetic data)
# ---------------------------------------------------------------------------


def round_up(x, tick=TICK):
    return round(float(np.ceil(round(x / tick, 6)) * tick), 2)


def round_down(x, tick=TICK):
    return round(float(np.floor(round(x / tick, 6)) * tick), 2)


def pct_return(close, bars):
    close = np.asarray(close, dtype=float)
    if len(close) <= bars or close[-bars - 1] <= 0:
        return None
    return close[-1] / close[-bars - 1] - 1


def evaluate(symbol, df, bench_ret_3m=None, leverage=1.0):
    """Return a trade plan dict if the last completed bar is a setup, else None."""
    return screen(symbol, df, bench_ret_3m, leverage)[0]


def screen(symbol, df, bench_ret_3m=None, leverage=1.0):
    """Return (plan, None) for a setup, or (None, reason) naming the first check it failed."""
    if df is None or len(df) < MIN_BARS:
        return None, "not enough history"

    o = df["open"].to_numpy(dtype=float)
    h = df["high"].to_numpy(dtype=float)
    lo = df["low"].to_numpy(dtype=float)
    c = df["close"].to_numpy(dtype=float)
    v = df["volume"].to_numpy(dtype=float)

    close = c[-1]
    turnover = float(np.mean(c[-20:] * v[-20:]))
    if close < MIN_PRICE or turnover < MIN_TURNOVER:
        return None, "illiquid"

    e20 = np.asarray(ta.ema(c, 20), dtype=float)
    e50 = np.asarray(ta.ema(c, 50), dtype=float)
    e200 = np.asarray(ta.ema(c, 200), dtype=float)
    atr = np.asarray(ta.atr(h, lo, c, 14), dtype=float)
    rsi = np.asarray(ta.rsi(c, 14), dtype=float)
    adx = np.asarray(ta.adx(h, lo, c, 14)[2], dtype=float)
    atr_now, rsi_now, adx_now = atr[-1], rsi[-1], adx[-1]
    if not np.isfinite([atr_now, rsi_now, adx_now, e200[-1]]).all() or atr_now <= 0:
        return None, "not enough history"

    # Trend
    if not (close > e50[-1] > e200[-1] and e20[-1] > e50[-1]):
        return None, "not in an uptrend"
    if e50[-1] <= e50[-11] or e20[-1] <= e20[-6]:
        return None, "uptrend flattening"
    if adx_now < MIN_ADX:
        return None, "trend too weak (ADX)"

    # Prior up-leg: the 60-day high is recent, but not today
    bars_since_high = 59 - int(np.argmax(h[-60:]))
    if bars_since_high < 2:
        return None, "at a new high, not a pullback"
    if bars_since_high > 20:
        return None, "no recent up-move"

    # Pullback to EMA20 that held
    if not np.any(lo[-3:] <= e20[-3:] + TOUCH_ATR * atr[-3:]):
        return None, "not pulled back to 20 EMA"
    if close < e20[-1] or np.any(c[-3:] < e50[-3:]):
        return None, "pullback did not hold"
    dist_atr = (close - e20[-1]) / atr_now
    if dist_atr > MAX_DIST_ATR:
        return None, "too far above 20 EMA"
    if not RSI_MIN <= rsi_now <= RSI_MAX:
        return None, "RSI out of range"

    # Trigger candle
    rng = h[-1] - lo[-1]
    if rng <= 0:
        return None, "no bullish candle"
    close_pos = (close - lo[-1]) / rng
    if not (close > o[-1] and close_pos >= 0.5):
        return None, "no bullish candle"

    # Relative strength vs benchmark
    rs = None
    stock_ret = pct_return(c, 63)
    if bench_ret_3m is not None and stock_ret is not None:
        rs = stock_ret - bench_ret_3m
        if REQUIRE_RS and rs < 0:
            return None, "lagging NIFTY"

    # Trade plan
    entry = round_up(h[-1] * (1 + ENTRY_BUFFER_PCT / 100))
    pullback_low = float(lo[-3:].min())
    sl = round_down(min(pullback_low - 0.2 * atr_now, entry - atr_now))
    risk = entry - sl
    if risk <= 0:
        return None, "stop too wide"
    risk_pct = risk / entry * 100
    if risk_pct > MAX_RISK_PCT:
        return None, "stop too wide"
    qty = int(min(RISK_PER_TRADE // risk, MAX_MARGIN_PER_TRADE * leverage // entry))
    if qty < 1:
        return None, "position too small"

    vol_dryup = float(v[-4:-1].mean() / v[-21:-1].mean()) if v[-21:-1].mean() > 0 else 1.0

    # Ranking: stronger trend, tighter to the EMA, quieter pullback, better candle, leadership
    score = (
        min(adx_now, 40) / 40 * 30
        + max(0.0, 1 - dist_atr / MAX_DIST_ATR) * 25
        + float(np.clip((1.2 - vol_dryup) / 0.7, 0, 1)) * 15
        + close_pos * 10
        + (float(np.clip((rs + 0.05) / 0.30, 0, 1)) * 20 if rs is not None else 10)
    )

    plan = {
        "symbol": symbol,
        "asof": df.index[-1],
        "close": round(float(close), 2),
        "entry": entry,
        "sl": sl,
        "t1": round_up(entry + T1_R * risk),
        "t2": round_up(entry + T2_R * risk),
        "risk_pct": round(float(risk_pct), 1),
        "qty": qty,
        "value": round(qty * entry),
        "leverage": leverage,
        "margin": round(qty * entry / leverage),
        "high_60": round(float(h[-60:].max()), 2),
        "adx": round(float(adx_now), 1),
        "rsi": round(float(rsi_now), 1),
        "dist_atr": round(float(dist_atr), 2),
        "vol_dryup": round(vol_dryup, 2),
        "rs": None if rs is None else round(float(rs) * 100, 1),
        "score": round(score),
    }
    return plan, None


# ---------------------------------------------------------------------------
# I/O
# ---------------------------------------------------------------------------


def load_universe():
    """Symbols at MIN_LEVERAGE or above, with their leverage. Refuses an oversized list."""
    universe = {sym: lev for sym, lev in MTF_UNIVERSE.items() if lev >= MIN_LEVERAGE}
    if len(universe) > MAX_UNIVERSE:
        raise ValueError(
            f"MTF_UNIVERSE has {len(universe)} stocks at {MIN_LEVERAGE}x or above; "
            f"the limit is {MAX_UNIVERSE}. Remove some before running."
        )
    return universe


def fetch_history(client, symbol, exchange, start, end):
    for attempt in range(2):
        try:
            df = client.history(
                symbol=symbol,
                exchange=exchange,
                interval="D",
                start_date=str(start),
                end_date=str(end),
                source=HISTORY_SOURCE,
            )
        except Exception as e:
            df = {"message": str(e)}
        if hasattr(df, "columns"):
            return df, None
        if attempt == 0:
            time.sleep(2)
    return None, (df or {}).get("message", "no data")


def completed_bars(df, now):
    """Drop today's candle if the session has not closed yet."""
    if df is None or df.empty:
        return df
    last = df.index[-1]
    if last.date() == now.date() and (now.hour, now.minute) < (15, 35):
        return df.iloc[:-1]
    return df


def md_escape(text):
    for ch in ("_", "*", "`", "["):
        text = text.replace(ch, "\\" + ch)
    return text


def fmt_rs(x):
    return f"{x:,.2f}".rstrip("0").rstrip(".")


def format_breakdown(rejected):
    """'not in an uptrend 41, no bullish candle 5' -- most common first."""
    return ", ".join(f"{why} {n}" for why, n in rejected.most_common())


def build_messages(picks, scanned, failed, asof, market_note, rejected=None):
    header = [
        f"*EMA20 Pullback Screener*  setups from the {asof:%d %b %Y} close",
        f"Scanned {scanned}, setups {len(picks)}" + (f", no data {failed}" if failed else ""),
        market_note,
    ]
    if rejected:
        header.append(f"Skipped: {md_escape(format_breakdown(rejected))}")

    blocks = []
    if not picks:
        blocks.append("No setups today.")
    for n, p in enumerate(picks, 1):
        rs = f" | RS {p['rs']:+.1f}%" if p["rs"] is not None else ""
        blocks.append(
            f"{n}. *{md_escape(p['symbol'])}*  (score {p['score']}, close {fmt_rs(p['close'])})\n"
            f"Buy above {fmt_rs(p['entry'])} | SL {fmt_rs(p['sl'])} ({p['risk_pct']}%)\n"
            f"T1 {fmt_rs(p['t1'])} | T2 {fmt_rs(p['t2'])} | 60d high {fmt_rs(p['high_60'])}\n"
            f"Qty {p['qty']} (Rs {p['value']:,}) | MTF {p['leverage']}x, margin Rs {p['margin']:,}\n"
            f"ADX {p['adx']} | RSI {p['rsi']}{rs}"
        )
    footer = (
        f"Entry valid {ENTRY_VALID_SESSIONS} sessions; skip if it opens below SL or above T1. "
        f"Book half at T1 and move SL to entry. Exit if T1 is not reached in "
        f"{TIME_STOP_SESSIONS} sessions (MTF interest)."
    )

    messages, current = [], "\n".join(header)
    for block in blocks + [footer]:
        if len(current) + len(block) + 2 > 3800:
            messages.append(current)
            current = ""
        current += ("\n\n" if current else "") + block
    messages.append(current)
    return messages


def scan(client, universe, now):
    """One full scan, sent to Telegram. Returns True if Telegram accepted every part."""
    start, end = (now - timedelta(days=LOOKBACK_DAYS)).date(), now.date()
    print(f"[{now:%H:%M:%S}] scanning {len(universe)} MTF stocks at {MIN_LEVERAGE}x or above")

    bench_ret, market_note = None, "Market filter unavailable."
    bdf, err = fetch_history(client, BENCHMARK[0], BENCHMARK[1], start, end)
    bdf = completed_bars(bdf, now)
    if bdf is not None and len(bdf) >= 64:
        bc = bdf["close"].to_numpy(dtype=float)
        bench_ret = pct_return(bc, 63)
        above = bc[-1] > np.asarray(ta.ema(bc, 50), dtype=float)[-1]
        market_note = (
            f"{BENCHMARK[0]} above its 50 EMA: conditions supportive."
            if above
            else f"{BENCHMARK[0]} below its 50 EMA: weak market, consider half size."
        )
    else:
        print(f"benchmark unavailable: {err}")

    results, failed, rejected = [], 0, Counter()
    for i, (sym, leverage) in enumerate(universe.items(), 1):
        df, err = fetch_history(client, sym, EXCHANGE, start, end)
        if df is None:
            failed += 1
            print(f"{sym}: skipped ({err})")
        else:
            try:
                plan, why = screen(sym, completed_bars(df, now), bench_ret, leverage)
            except Exception as e:
                plan, why = None, "analysis failed"
                print(f"{sym}: analysis failed ({e})")
            if why:
                rejected[why] += 1
                print(f"{sym}: {why}")
            if plan:
                results.append(plan)
                print(f"{sym}: SETUP score {plan['score']} entry {plan['entry']} sl {plan['sl']}")
        if i % 10 == 0:
            print(f"progress {i}/{len(universe)}")
        time.sleep(REQUEST_GAP_SEC)

    # Drop stale series (suspended or not yet updated) so every pick is from the same session
    asof = max((r["asof"] for r in results), default=None)
    if asof is None and bdf is not None and len(bdf):
        asof = bdf.index[-1]
    stale = [r for r in results if r["asof"] != asof]
    if stale:
        rejected["stale data"] += len(stale)
    results = [r for r in results if r["asof"] == asof]
    picks = sorted(results, key=lambda r: r["score"], reverse=True)[:TOP_N]

    delivered = True
    for msg in build_messages(picks, len(universe), failed, asof or now, market_note, rejected):
        resp = client.telegram(username=TELEGRAM_USERNAME, message=msg, priority=5)
        print(f"telegram: {resp}")
        delivered &= isinstance(resp, dict) and resp.get("status") == "success"
    if rejected:
        print(f"skipped: {format_breakdown(rejected)}")
    print(
        f"done: {len(picks)} setups, "
        + (
            "sent to Telegram"
            if delivered
            else "but Telegram did not accept the message (see above)"
        )
    )
    return delivered


def load_run_log():
    try:
        return set(json.loads(RUN_LOG.read_text()))
    except (OSError, ValueError):
        return set()


def save_run_log(done):
    # Keys start with the date, so sorting keeps the most recent; a few weeks is plenty.
    try:
        RUN_LOG.write_text(json.dumps(sorted(done)[-60:]))
    except OSError as e:
        print(f"could not record the run ({e}); a restart today may repeat it")


def due_run(now, done):
    """The run time that is due now and has not fired today, as 'YYYY-MM-DD HH:MM', else None."""
    for t in RUN_TIMES:
        hour, minute = map(int, t.split(":"))
        slot = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        key = f"{now:%Y-%m-%d} {t}"
        if key not in done and slot <= now < slot + timedelta(minutes=RUN_GRACE_MIN):
            return key
    return None


def next_run(now):
    """When the next run time falls, for the log. Holidays are only known on the day."""
    for days in range(8):
        day = now + timedelta(days=days)
        for t in sorted(RUN_TIMES):
            hour, minute = map(int, t.split(":"))
            slot = day.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if slot > now and slot.weekday() < 5:
                return slot
    return None


def is_trading_day(client, day):
    """Ask the platform's exchange calendar; fall back to Mon-Fri if it cannot answer."""
    try:
        resp = client.timings(date=str(day))
        if isinstance(resp, dict) and resp.get("status") == "success":
            return any(row.get("exchange") == EXCHANGE for row in resp.get("data") or [])
        print(f"market calendar unavailable ({resp}); assuming Mon-Fri")
    except Exception as e:
        print(f"market calendar unavailable ({e}); assuming Mon-Fri")
    return day.weekday() < 5


def main():
    api_key = os.getenv("OPENALGO_API_KEY")
    if not api_key:
        print("OPENALGO_API_KEY is not set. Run this script from the /python page.")
        return 1
    client = api(api_key=api_key, host=os.getenv("HOST_SERVER", "http://127.0.0.1:5000"))
    try:
        universe = load_universe()
    except ValueError as e:
        print(e)
        return 1

    done = load_run_log()
    now = datetime.now(IST).replace(tzinfo=None)
    print(f"[{now:%H:%M:%S}] screener running; scans at {', '.join(RUN_TIMES)} IST on trading days")
    waiting_for = None

    while True:
        now = datetime.now(IST).replace(tzinfo=None)
        key = due_run(now, done)
        if key:
            if not is_trading_day(client, now.date()):
                print(f"[{now:%H:%M:%S}] NSE is closed today; skipping the {key[-5:]} scan")
            else:
                try:
                    scan(client, universe, now)
                except Exception as e:
                    print(f"[{now:%H:%M:%S}] scan failed: {e}")
                    try:
                        client.telegram(
                            username=TELEGRAM_USERNAME,
                            message=(
                                f"EMA20 Pullback Screener: the {key[-5:]} scan did not finish. "
                                "Open the strategy's log on the /python page to see why. "
                                "The next scheduled scan will run as normal."
                            ),
                            priority=7,
                        )
                    except Exception as e2:
                        print(f"could not send the failure notice either: {e2}")
            # Recorded even when it failed: a retry could send a half-finished list twice.
            done.add(key)
            save_run_log(done)

        upcoming = next_run(now)
        if upcoming and upcoming != waiting_for:
            waiting_for = upcoming
            print(f"[{now:%H:%M:%S}] next scan {upcoming:%a %d %b %H:%M} IST")
        time.sleep(POLL_SEC)


if __name__ == "__main__":
    raise SystemExit(main())
