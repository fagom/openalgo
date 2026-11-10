# services/charges/statutory_rates.py
"""
India statutory trading cost rates, as a data table.

No broker API used in this project returns a clean STT/stamp-duty/exchange-fee
breakdown per trade (services/tradebook_service.py's broker-agnostic output
carries only symbol/exchange/product/action/quantity/average_price/trade_value,
never a charges figure), so the daily charges report computes these from the
trade itself rather than from anything a broker reports.

Rates below are the best-known baseline for FY2025-26. STT and stamp duty move
by government notification (the Finance Act 2024 raised the F&O STT on options
and futures sell-side, effective 1 Oct 2024), so re-verify against the current
NSE/SEBI circular before relying on this for anything but an estimate, and
update only the constants below when a rate changes - nothing else in this
module should need to change.
"""

SEGMENT_EQUITY_DELIVERY = "equity_delivery"
SEGMENT_EQUITY_INTRADAY = "equity_intraday"
SEGMENT_FO_FUTURES = "fo_futures"
SEGMENT_FO_OPTIONS = "fo_options"
SEGMENT_COMMODITY_FUTURES = "commodity_futures"
SEGMENT_COMMODITY_OPTIONS = "commodity_options"

ALL_SEGMENTS = (
    SEGMENT_EQUITY_DELIVERY,
    SEGMENT_EQUITY_INTRADAY,
    SEGMENT_FO_FUTURES,
    SEGMENT_FO_OPTIONS,
    SEGMENT_COMMODITY_FUTURES,
    SEGMENT_COMMODITY_OPTIONS,
)

#: One entry per segment. ``stt_buy``/``stt_sell``, ``stamp_buy``/``stamp_sell``
#: are turnover fractions applied on the relevant side only (stamp duty is
#: buy-side only on every segment here; STT is sell-side only except equity
#: delivery, which is charged on both sides). ``txn`` is the exchange
#: transaction charge (NSE rate; BSE equity has its own ``txn_bse``), ``sebi``
#: is the SEBI turnover fee, flat across segments.
RATES = {
    SEGMENT_EQUITY_DELIVERY: {
        "stt_buy": 0.001,
        "stt_sell": 0.001,
        "stamp_buy": 0.00015,
        "stamp_sell": 0.0,
        "txn_nse": 0.0000297,
        "txn_bse": 0.0000375,
        "sebi": 0.000001,
    },
    SEGMENT_EQUITY_INTRADAY: {
        "stt_buy": 0.0,
        "stt_sell": 0.00025,
        "stamp_buy": 0.00003,
        "stamp_sell": 0.0,
        "txn_nse": 0.0000297,
        "txn_bse": 0.0000375,
        "sebi": 0.000001,
    },
    SEGMENT_FO_FUTURES: {
        "stt_buy": 0.0,
        "stt_sell": 0.0002,
        "stamp_buy": 0.00002,
        "stamp_sell": 0.0,
        "txn_nse": 0.0000173,
        "txn_bse": 0.0000173,
        "sebi": 0.000001,
    },
    SEGMENT_FO_OPTIONS: {
        "stt_buy": 0.0,
        "stt_sell": 0.001,
        "stamp_buy": 0.00003,
        "stamp_sell": 0.0,
        "txn_nse": 0.0003503,
        "txn_bse": 0.0003503,
        "sebi": 0.000001,
    },
    # Commodities (MCX) are taxed with CTT (Commodity Transaction Tax), not
    # STT, and MCX's own exchange transaction charge differs from NSE's -
    # reusing the F&O rates here would misstate both. Stored under the same
    # "stt_*" keys since charges_calculator.py applies them identically
    # (a turnover-fraction sell-side tax); only the rate values differ.
    SEGMENT_COMMODITY_FUTURES: {
        "stt_buy": 0.0,
        "stt_sell": 0.0001,  # CTT: 0.01% on sell-side turnover (non-agri futures)
        "stamp_buy": 0.00002,
        "stamp_sell": 0.0,
        "txn_nse": 0.000021,  # MCX exchange transaction charge
        "sebi": 0.000001,
    },
    SEGMENT_COMMODITY_OPTIONS: {
        "stt_buy": 0.0,
        "stt_sell": 0.0005,  # CTT: 0.05% on sell-side premium turnover
        "stamp_buy": 0.00003,
        "stamp_sell": 0.0,
        "txn_nse": 0.0005,  # MCX exchange transaction charge on options premium
        "sebi": 0.000001,
    },
}

#: GST applies to brokerage + exchange transaction charge + SEBI fee only,
#: never to STT or stamp duty (those are themselves taxes/duties, not a taxable
#: supply of service).
GST_RATE = 0.18

#: Default brokerage when the trader has not configured a rate for a segment.
#: Most retail brokers charge nothing for API-placed equity delivery trades and
#: a small flat fee per executed order for intraday/F&O, but the exact number
#: is plan-specific and not discoverable from any broker response - so this
#: default is zero rather than a guess, and the Daily Charges tab lets the
#: trader enter their own plan's numbers.
DEFAULT_BROKERAGE_SETTINGS = {
    SEGMENT_EQUITY_DELIVERY: 0.0,
    SEGMENT_EQUITY_INTRADAY: 0.0,
    SEGMENT_FO_FUTURES: 0.0,
    SEGMENT_FO_OPTIONS: 0.0,
    SEGMENT_COMMODITY_FUTURES: 0.0,
    SEGMENT_COMMODITY_OPTIONS: 0.0,
}


def classify_segment(exchange: str, product: str, symbol: str) -> str:
    """The statutory-rate segment a trade belongs to.

    Equity delivery and intraday are told apart by the normalized product code
    OpenAlgo already uses everywhere else (CNC vs MIS/NRML on NSE/BSE).
    Futures and options are told apart by the symbol suffix in OpenAlgo's own
    documented format (CLAUDE.md "Symbol Format"): options end in CE/PE,
    futures end in FUT. That is broker-agnostic by construction, unlike an
    instrument-type lookup that would depend on the master contract being
    loaded for that symbol.
    """
    exchange = (exchange or "").upper()
    product = (product or "").upper()
    symbol = (symbol or "").upper()

    if exchange in ("MCX", "NCDEX"):
        if symbol.endswith("CE") or symbol.endswith("PE"):
            return SEGMENT_COMMODITY_OPTIONS
        return SEGMENT_COMMODITY_FUTURES

    # CDS/BCD (currency derivatives) are out of scope for now and keep the
    # F&O-bucket approximation below rather than a third set of rates.
    if exchange in ("NFO", "BFO", "CDS", "BCD"):
        if symbol.endswith("CE") or symbol.endswith("PE"):
            return SEGMENT_FO_OPTIONS
        if symbol.endswith("FUT"):
            return SEGMENT_FO_FUTURES
        # Ambiguous derivative symbol: do not under-count statutory dues
        # silently. Futures-style (lower) rates are the closer of the two, so
        # fall back there rather than to the options rate.
        return SEGMENT_FO_FUTURES

    if exchange in ("NSE", "BSE"):
        if product == "CNC":
            return SEGMENT_EQUITY_DELIVERY
        return SEGMENT_EQUITY_INTRADAY

    # Unknown exchange: treat as equity intraday, the lowest-charge equity
    # bucket, rather than silently skipping the trade.
    return SEGMENT_EQUITY_INTRADAY
