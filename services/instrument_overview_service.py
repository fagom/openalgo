"""
Instrument Overview Service

Everything the "Instrument" page needs for one underlying/expiry in a single
call: spot and recent daily price action, PCR and Max Pain, ATM IV with
realized vol / VRP / IV Rank, and the option chain itself. Built on top of
the chain this platform already fetches for every options tool, not a new
data source -- the point of this page is fewer round trips to see it all,
not a new way of computing any of it.

Only the ATM strike's Greeks are computed (2 legs), not the whole chain's
(up to 40+ for a 20-strike request) -- IV Smile already offers the full
per-strike curve for a trader who wants it; this page's own IV figure only
has to agree with that one at the ATM strike.
"""

from typing import Any

from database.iv_history_db import get_iv_history, record_atm_iv
from services.history_service import get_history
from services.iv_analytics_service import (
    _close_to_close_rv,
    _parkinson_rv,
    _rank_and_percentile,
)
from services.market_regime_service import (
    compute_adx,
    ema_trend_bias,
    max_pain_pull,
    synthesize_regime,
)
from services.option_chain_service import get_option_chain
from services.option_greeks_service import calculate_greeks
from utils.logging import get_logger

logger = get_logger(__name__)

#: Calendar days of daily bars fetched for the price chart. Also the window
#: realized vol is computed over (iv_analytics_service.RV_WINDOW_DAYS worth
#: of trading days comfortably fits inside it).
PRICE_CHART_LOOKBACK_DAYS = 90

#: Strikes above and below ATM fetched for the compact chain table
#: (CHAIN_WINDOW in InstrumentOverview.tsx) -- the option chain tool itself
#: already offers the full width for a trader who wants it.
CHAIN_STRIKE_COUNT = 8

#: Strikes either side of ATM priced for the regime's net-GEX reading. Deep
#: OTM strikes rarely carry enough gamma to matter and dealer hedging flow is
#: dominated by the strikes near spot anyway, so this stays far short of a
#: full-chain GEX scan (which prices every strike in the request).
GEX_WINDOW_STRIKES = 2


def _options_exchange(exchange: str) -> str:
    """NFO/BFO as the chain was requested with, derived from the underlying's own exchange."""
    exch = exchange.upper()
    if exch in ("NSE_INDEX", "NSE"):
        return "NFO"
    if exch in ("BSE_INDEX", "BSE"):
        return "BFO"
    return exch


def _pcr_and_max_pain(chain: list[dict]) -> tuple[float | None, float | None]:
    """PCR (OI) and the Max Pain strike, from a chain already in hand -- no extra fetch."""
    total_ce_oi = sum((s.get("ce") or {}).get("oi") or 0 for s in chain)
    total_pe_oi = sum((s.get("pe") or {}).get("oi") or 0 for s in chain)
    pcr = round(total_pe_oi / total_ce_oi, 2) if total_ce_oi > 0 else None

    strikes = [s["strike"] for s in chain if isinstance(s.get("strike"), (int, float))]
    if not strikes:
        return pcr, None

    best_strike, best_pain = None, None
    for candidate in strikes:
        pain = 0.0
        for s in chain:
            strike = s["strike"]
            ce_oi = (s.get("ce") or {}).get("oi") or 0
            pe_oi = (s.get("pe") or {}).get("oi") or 0
            if candidate > strike and ce_oi > 0:
                pain += (candidate - strike) * ce_oi
            if candidate < strike and pe_oi > 0:
                pain += (strike - candidate) * pe_oi
        if best_pain is None or pain < best_pain:
            best_strike, best_pain = candidate, pain

    return pcr, best_strike


def _windowed_greeks(
    chain: list[dict], atm_strike: float, spot: float, options_exchange: str
) -> tuple[float | None, float | None]:
    """ATM IV and net GEX from ONE pass over the strikes near ATM.

    Both numbers need the same thing -- each leg's Greeks -- so this prices
    every leg in the window exactly once rather than the ATM strike's two
    legs being priced twice over (once for IV, again for GEX): a Black-76
    solve plus a symbol-parse per leg is the dominant cost of this whole
    endpoint, and the ATM legs are the ones inside every window regardless
    of GEX_WINDOW_STRIKES.

    ATM IV is the average over just the ATM row (same figure IV Smile's
    atm_iv reports); net GEX is call GEX - put GEX summed across the window,
    same formula the full GEX tool uses.
    """
    strikes_sorted = sorted(s["strike"] for s in chain)
    if atm_strike not in strikes_sorted:
        return None, None
    atm_index = strikes_sorted.index(atm_strike)
    window = set(
        strikes_sorted[max(0, atm_index - GEX_WINDOW_STRIKES) : atm_index + GEX_WINDOW_STRIKES + 1]
    )

    ivs: list[float] = []
    net_gex = 0.0
    priced_any_gex = False

    for row in chain:
        if row["strike"] not in window:
            continue
        is_atm = row["strike"] == atm_strike
        for leg, sign in (("ce", 1), ("pe", -1)):
            opt = row.get(leg)
            if not opt or not opt.get("symbol"):
                continue
            oi = opt.get("oi") or 0
            ltp = opt.get("ltp") or 0
            lotsize = opt.get("lotsize") or 1
            if ltp <= 0:
                continue
            try:
                ok, greeks, _ = calculate_greeks(
                    option_symbol=opt["symbol"],
                    exchange=options_exchange,
                    spot_price=spot,
                    option_price=ltp,
                )
                if not ok or greeks.get("status") != "success":
                    continue
                if is_atm:
                    iv = greeks.get("implied_volatility", 0)
                    if iv and iv > 0:
                        ivs.append(iv)
                if oi > 0:
                    gamma = (greeks.get("greeks") or {}).get("gamma", 0) or 0
                    net_gex += sign * gamma * oi * lotsize
                    priced_any_gex = True
            except Exception:
                logger.exception(f"Error computing Greeks for {opt.get('symbol')}")

    atm_iv = round(sum(ivs) / len(ivs), 2) if ivs else None
    gex = round(net_gex, 2) if priced_any_gex else None
    return atm_iv, gex


def get_instrument_overview(
    underlying: str, exchange: str, expiry_date: str, api_key: str
) -> tuple[bool, dict[str, Any], int]:
    """Everything the Instrument page shows, for one underlying/expiry."""
    try:
        success, chain_response, status_code = get_option_chain(
            underlying=underlying,
            exchange=exchange,
            expiry_date=expiry_date,
            strike_count=CHAIN_STRIKE_COUNT,
            api_key=api_key,
        )
        if not success:
            return False, chain_response, status_code

        chain = chain_response.get("chain", [])
        spot = chain_response.get("underlying_ltp")
        atm_strike = chain_response.get("atm_strike")
        underlying_symbol = chain_response.get("underlying_symbol", underlying)
        underlying_exchange = chain_response.get("underlying_exchange", exchange)
        options_exchange = _options_exchange(underlying_exchange)

        pcr, max_pain_strike = _pcr_and_max_pain(chain)
        atm_iv = net_gex = None
        if spot and atm_strike:
            atm_iv, net_gex = _windowed_greeks(chain, atm_strike, spot, options_exchange)

        # One daily-history fetch, shared by the price chart, realized vol and
        # the regime's trend signals (ADX, EMA bias) -- the reason this page
        # exists is to not pay for this call three times over.
        daily_bars: list[dict] = []
        realized_vol_close = realized_vol_parkinson = vrp = None
        adx = None
        trend_bias = "flat"
        try:
            success_h, hist_resp, _ = get_history(
                symbol=underlying_symbol,
                exchange=underlying_exchange,
                interval="D",
                start_date=_days_ago(PRICE_CHART_LOOKBACK_DAYS),
                end_date=_today(),
                api_key=api_key,
            )
            if success_h and hist_resp.get("status") == "success":
                daily_bars = hist_resp.get("data") or []
                closes = [b["close"] for b in daily_bars if b.get("close")]
                highs = [b["high"] for b in daily_bars if b.get("high")]
                lows = [b["low"] for b in daily_bars if b.get("low")]
                ranges = [
                    (b["high"], b["low"])
                    for b in daily_bars
                    if b.get("high") and b.get("low") and b["low"] > 0
                ]
                rv_close = _close_to_close_rv(closes[-21:])
                rv_parkinson = _parkinson_rv(ranges[-21:])
                realized_vol_close = round(rv_close, 2) if rv_close is not None else None
                realized_vol_parkinson = (
                    round(rv_parkinson, 2) if rv_parkinson is not None else None
                )
                if atm_iv is not None and rv_close is not None:
                    vrp = round(atm_iv - rv_close, 2)
                adx = compute_adx(highs, lows, closes)
                trend_bias, _ema_fast, _ema_slow = ema_trend_bias(closes)
        except Exception:
            logger.exception(
                f"Error fetching daily history for {underlying_exchange}:{underlying_symbol}"
            )

        iv_rank = iv_percentile = None
        iv_history_days = 0
        try:
            if atm_iv is not None and atm_iv > 0:
                record_atm_iv(underlying_symbol, underlying_exchange, atm_iv)
            history = get_iv_history(underlying_symbol, underlying_exchange)
            iv_history_days = len(history)
            if atm_iv is not None:
                iv_rank, iv_percentile = _rank_and_percentile(history, atm_iv)
        except Exception:
            logger.exception(
                f"Error computing IV rank for {underlying_exchange}:{underlying_symbol}"
            )

        max_pain_pct, max_pain_state = (
            max_pain_pull(spot, max_pain_strike)
            if spot and max_pain_strike is not None
            else (0.0, "unknown")
        )
        regime = synthesize_regime(
            adx=adx,
            trend_bias=trend_bias,
            net_gex=net_gex,
            max_pain_pct=max_pain_pct,
            max_pain_state=max_pain_state,
            iv_rank=iv_rank,
            vrp=vrp,
        )

        return (
            True,
            {
                "status": "success",
                "underlying": chain_response.get("underlying", underlying),
                "underlying_symbol": underlying_symbol,
                "underlying_exchange": underlying_exchange,
                "spot_price": spot,
                "atm_strike": atm_strike,
                "expiry_date": expiry_date,
                "pcr": pcr,
                "max_pain_strike": max_pain_strike,
                "max_pain_pct": max_pain_pct,
                "max_pain_state": max_pain_state,
                "atm_iv": atm_iv,
                "realized_vol_close": realized_vol_close,
                "realized_vol_parkinson": realized_vol_parkinson,
                "vrp": vrp,
                "iv_rank": iv_rank,
                "iv_percentile": iv_percentile,
                "iv_history_days": iv_history_days,
                "adx": adx,
                "trend_bias": trend_bias,
                "net_gex": net_gex,
                "regime": regime,
                "daily_bars": daily_bars,
                "chain": chain,
            },
            200,
        )

    except Exception as e:
        logger.exception(f"Error in get_instrument_overview: {e}")
        return (
            False,
            {"status": "error", "message": "Error fetching instrument overview"},
            500,
        )


def _today() -> str:
    from datetime import datetime

    return datetime.now().strftime("%Y-%m-%d")


def _days_ago(days: int) -> str:
    from datetime import datetime

    return datetime.fromtimestamp(datetime.now().timestamp() - days * 86400).strftime("%Y-%m-%d")
