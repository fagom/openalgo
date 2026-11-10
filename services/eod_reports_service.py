# services/eod_reports_service.py
"""
The end-of-day job behind the Daily Reports page: one balance snapshot, one
day's charges breakdown, one day's rule-based trade analysis, and one AI
reasoning note per closed trade.

Kept out of any blueprint - this has no Flask-request assumptions, since it
runs from the scheduler thread in blueprints/python_strategy.py as well as
from the manual-refresh endpoint in blueprints/eod_reports.py.

Run twice a day, once per market class, because equity/F&O settle by market
close while MCX commodities trade into the evening:
- market_class="equity_fo" at 15:40 IST (NSE/BSE/NFO/BFO)
- market_class="commodity" at 23:45 IST (MCX/NCDEX)
Each run only ever reads/writes rows for its own market_class, so the two
never race or clobber each other for the same trading day.

Idempotent per market_class: re-running overwrites that day's rows for that
market_class (upsert/delete-replace by the user/broker/date/market_class key)
instead of duplicating, so a manual re-trigger for testing, or an APScheduler
misfire retry, is safe.
"""

from datetime import date, datetime

import pytz
from sqlalchemy import desc

from database.auth_db import Auth, get_auth_token
from database.eod_reports_db import (
    get_brokerage_settings,
    get_trade_analysis,
    replace_closed_trades,
    set_trade_reasoning,
    upsert_balance_snapshot,
    upsert_daily_charges,
    upsert_trade_analysis,
)
from services.charges.charges_calculator import aggregate_daily_charges
from services.funds_service import get_funds
from services.trade_analysis_service import compute_trade_analysis, match_fifo_trades
from services.trade_reasoning_service import analyze_trade
from services.tradebook_service import get_tradebook_with_auth
from utils.logging import get_logger

logger = get_logger(__name__)

IST = pytz.timezone("Asia/Kolkata")

#: Which exchanges belong to which market class, and therefore which EOD run
#: processes a given fill. CDS/BCD (currency derivatives) stay with equity_fo,
#: matching services/charges/statutory_rates.py's current scope.
MARKET_CLASS_EXCHANGES = {
    "equity_fo": ("NSE", "BSE", "NFO", "BFO", "CDS", "BCD"),
    "commodity": ("MCX", "NCDEX"),
}

#: The scheduled run time for each market class (blueprints/python_strategy.py's
#: CronTrigger hour/minute) - kept here too so the status check below can tell
#: the trader whether today's run has simply not happened *yet* versus it ran
#: and found nobody logged in.
MARKET_CLASS_CUTOFF = {
    "equity_fo": (15, 40),
    "commodity": (23, 45),
}


def _active_user_and_broker():
    """The currently logged-in user's name and broker, or (None, None).

    Mirrors blueprints/python_strategy.py:get_active_broker() - the most
    recent unrevoked Auth row - but is duplicated here rather than imported,
    so this reporting job has no dependency on the strategy-runner blueprint.
    """
    try:
        auth_obj = Auth.query.filter_by(is_revoked=False).order_by(desc(Auth.id)).first()
        if auth_obj:
            return auth_obj.name, auth_obj.broker
        return None, None
    except Exception:
        logger.exception("Could not resolve the active broker for the EOD reports job")
        return None, None


def _ist_today() -> date:
    return datetime.now(IST).date()


def _today_trades(auth_token: str, broker: str, market_class: str) -> list[dict]:
    """Today's tradebook fills for one market class, tagged with a sortable
    IST timestamp.

    Some brokers' tradebook windows can span more than the current trading
    day, so fills are filtered to today's IST calendar date defensively
    rather than trusting the broker to return exactly one day. Also filtered
    to this market_class's exchanges, so the 15:40 equity/F&O run and the
    23:45 commodity run each only ever see their own fills.
    """
    from blueprints.pnltracker import parse_trade_timestamp

    success, response, _status = get_tradebook_with_auth(auth_token, broker, None)
    if not success:
        logger.warning(f"Could not fetch today's tradebook for the EOD reports job: {response}")
        return []

    today = _ist_today()
    exchanges = MARKET_CLASS_EXCHANGES[market_class]
    todays_fills = []
    for trade in response.get("data") or []:
        if str(trade.get("exchange") or "").upper() not in exchanges:
            continue
        parsed = parse_trade_timestamp(trade.get("timestamp"))
        if parsed is None or parsed.date() != today:
            continue
        trade = dict(trade)
        trade["_sort_time"] = parsed.timestamp()
        todays_fills.append(trade)
    return todays_fills


def _snapshot_balance(user_id: str, broker: str, auth_token: str, today: date) -> dict | None:
    success, response, _status = get_funds(auth_token=auth_token, broker=broker)
    if not success:
        logger.warning(f"Could not fetch funds for the EOD balance snapshot: {response}")
        return None

    funds = response.get("data") or {}

    def _num(*keys):
        for key in keys:
            value = funds.get(key)
            if value is not None:
                try:
                    return float(value)
                except (TypeError, ValueError):
                    continue
        return None

    available_cash = _num("availablecash", "available_cash")
    collateral = _num("collateral")
    utilised_debits = _num("utiliseddebits", "utilised_debits")
    m2m_unrealized = _num("m2munrealized", "m2m_unrealized")
    m2m_realized = _num("m2mrealized", "m2m_realized")
    net_balance = (available_cash or 0.0) + (collateral or 0.0)

    import json

    return upsert_balance_snapshot(
        user_id,
        broker,
        today,
        {
            "available_cash": available_cash,
            "collateral": collateral,
            "utilised_debits": utilised_debits,
            "m2m_unrealized": m2m_unrealized,
            "m2m_realized": m2m_realized,
            "net_balance": net_balance,
            "raw_funds_json": json.dumps(funds),
        },
    )


def run_eod_report_job(market_class: str = "equity_fo") -> dict:
    """Run today's balance snapshot, charges breakdown, trade analysis and
    per-trade AI reasoning for one market class.

    Returns a small summary dict for the manual-refresh endpoint to echo back;
    logs and returns early (no exception raised) when nobody is logged in, so
    the scheduler never sees a failure for a day nobody traded.
    """
    if market_class not in MARKET_CLASS_EXCHANGES:
        logger.warning(f"EOD reports job: unknown market_class {market_class!r}, skipping")
        return {"status": "skipped", "reason": "unknown_market_class"}

    user_id, broker = _active_user_and_broker()
    if not user_id or not broker:
        logger.warning("EOD reports job: no logged-in broker session, skipping today's run")
        return {"status": "skipped", "reason": "not_logged_in"}

    auth_token = get_auth_token(user_id)
    if not auth_token:
        logger.warning(f"EOD reports job: no valid auth token for {broker}, skipping today's run")
        return {"status": "skipped", "reason": "no_auth_token"}

    today = _ist_today()

    balance = _snapshot_balance(user_id, broker, auth_token, today)
    todays_trades = _today_trades(auth_token, broker, market_class)

    brokerage_settings = get_brokerage_settings(user_id)
    by_segment = aggregate_daily_charges(todays_trades, brokerage_settings)
    upsert_daily_charges(user_id, broker, today, by_segment, market_class)
    total_charges = round(sum(seg["total_charges"] for seg in by_segment.values()), 2)

    closed_trades = match_fifo_trades(todays_trades)
    stats = compute_trade_analysis(closed_trades, total_charges)
    analysis = upsert_trade_analysis(user_id, broker, today, stats, market_class)

    # Persist each closed trade, then reason about the ones that don't
    # already have reasoning carried over from a prior run of this same day
    # (replace_closed_trades matches by symbol/exchange/product/qty/entry/
    # exit) - a mid-day manual Refresh followed by the scheduled run, or two
    # scheduled runs, must not re-bill the AI model for a trade it already
    # reasoned about. One trade's failure (caught inside analyze_trade, never
    # raised) must never cost the rest of the day's trades their reasoning.
    trade_rows = replace_closed_trades(user_id, broker, today, market_class, closed_trades)
    for row in trade_rows:
        if row.reasoning_text:
            continue
        try:
            trade_for_reasoning = {
                "symbol": row.symbol,
                "exchange": row.exchange,
                "product": row.product,
                "quantity": row.quantity,
                "entry_price": row.entry_price,
                "exit_price": row.exit_price,
                "pnl": row.pnl,
                "entry_time": row.entry_time,
                "exit_time": row.exit_time,
            }
            result = analyze_trade(trade_for_reasoning, auth_token, broker)
            set_trade_reasoning(row.id, result)
        except Exception:
            logger.exception(f"Could not generate reasoning for closed trade {row.id}")

    logger.info(
        f"EOD reports job ({market_class}) completed for {broker} on {today.isoformat()}: "
        f"{len(todays_trades)} fill(s), {stats['total_trades']} closed trade(s)"
    )
    return {
        "status": "ok",
        "date": today.isoformat(),
        "market_class": market_class,
        "broker": broker,
        "balance": balance,
        "charges_segments": list(by_segment.keys()),
        "trade_analysis": analysis,
        "closed_trades": len(trade_rows),
    }


def report_status(user_id: str, broker: str) -> dict:
    """Whether today's report has been generated for each market class, for
    the Daily Reports page's "no report yet" banner.

    ``due`` is true once that market class's scheduled run time
    (MARKET_CLASS_CUTOFF) has passed for today IST; ``generated`` is true once
    a trade_analysis row exists for today. due-and-not-generated is the
    trader's actionable case - most likely they were logged out when the
    scheduled job ran - everything else (not due yet, or already generated)
    needs no banner.
    """
    now = datetime.now(IST)
    today = now.date()
    status = {}
    for market_class, (hour, minute) in MARKET_CLASS_CUTOFF.items():
        due = (now.hour, now.minute) >= (hour, minute)
        generated = get_trade_analysis(user_id, broker, today, market_class) is not None
        status[market_class] = {"due": due, "generated": generated}
    return status
