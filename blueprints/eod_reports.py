# blueprints/eod_reports.py
"""
JSON API for the Daily Reports page: balance progression, daily charges,
trade analysis, and per-trade AI reasoning. Read-only except for the
brokerage-rate settings the trader enters themselves, the page's own Refresh
button, and the per-trade Analyze button.
"""

from datetime import date, datetime

from flask import Blueprint, jsonify, request, session

from database.auth_db import get_auth_token
from database.eod_reports_db import (
    get_balance_progression,
    get_brokerage_settings,
    get_closed_trade,
    get_closed_trades,
    get_daily_charges,
    get_pnl_calendar,
    get_trade_analysis,
    set_brokerage_settings,
    set_trade_reasoning,
)
from utils.logging import get_logger
from utils.session import check_session_validity

logger = get_logger(__name__)

eod_reports_bp = Blueprint("eod_reports_bp", __name__, url_prefix="/eod-reports/api")

VALID_MARKET_CLASSES = ("equity_fo", "commodity")


def _session_user_broker():
    return session.get("user"), session.get("broker")


def _parse_date(value: str | None) -> date:
    if not value:
        return datetime.now().date()
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return datetime.now().date()


def _parse_market_class(value: str | None) -> str:
    return value if value in VALID_MARKET_CLASSES else "equity_fo"


@eod_reports_bp.route("/balance-progression")
@check_session_validity
def balance_progression():
    user_id, broker = _session_user_broker()
    if not user_id or not broker:
        return jsonify({"status": "error", "message": "Not logged in to a broker"}), 400
    days = request.args.get("days", 90)
    return jsonify({"status": "success", "data": get_balance_progression(user_id, broker, days)})


@eod_reports_bp.route("/pnl-calendar")
@check_session_validity
def pnl_calendar():
    user_id, broker = _session_user_broker()
    if not user_id or not broker:
        return jsonify({"status": "error", "message": "Not logged in to a broker"}), 400
    days = request.args.get("days", 400)
    return jsonify({"status": "success", "data": get_pnl_calendar(user_id, broker, days)})


@eod_reports_bp.route("/daily-charges")
@check_session_validity
def daily_charges():
    user_id, broker = _session_user_broker()
    if not user_id or not broker:
        return jsonify({"status": "error", "message": "Not logged in to a broker"}), 400
    trade_date = _parse_date(request.args.get("date"))
    market_class = _parse_market_class(request.args.get("market_class"))
    rows = get_daily_charges(user_id, broker, trade_date, market_class)
    return jsonify({"status": "success", "date": trade_date.isoformat(), "data": rows})


@eod_reports_bp.route("/trade-analysis")
@check_session_validity
def trade_analysis():
    user_id, broker = _session_user_broker()
    if not user_id or not broker:
        return jsonify({"status": "error", "message": "Not logged in to a broker"}), 400
    trade_date = _parse_date(request.args.get("date"))
    market_class = _parse_market_class(request.args.get("market_class"))
    data = get_trade_analysis(user_id, broker, trade_date, market_class)
    return jsonify({"status": "success", "date": trade_date.isoformat(), "data": data})


@eod_reports_bp.route("/trades")
@check_session_validity
def trades():
    user_id, broker = _session_user_broker()
    if not user_id or not broker:
        return jsonify({"status": "error", "message": "Not logged in to a broker"}), 400
    trade_date = _parse_date(request.args.get("date"))
    market_class = _parse_market_class(request.args.get("market_class"))
    rows = get_closed_trades(user_id, broker, trade_date, market_class)
    return jsonify({"status": "success", "date": trade_date.isoformat(), "data": rows})


@eod_reports_bp.route("/trades/<int:trade_id>/analyze", methods=["POST"])
@check_session_validity
def analyze_trade_now(trade_id: int):
    """Generate (or regenerate) one closed trade's AI reasoning on demand.

    Synchronous: a local model can take a while, so the frontend shows a
    spinner for the duration rather than this returning early.
    """
    from services.trade_reasoning_service import analyze_trade

    user_id, broker = _session_user_broker()
    if not user_id or not broker:
        return jsonify({"status": "error", "message": "Not logged in to a broker"}), 400

    row = get_closed_trade(user_id, broker, trade_id)
    if row is None:
        return jsonify({"status": "error", "message": "That trade could not be found."}), 404

    auth_token = get_auth_token(user_id)
    if not auth_token:
        return (
            jsonify(
                {"status": "error", "message": "Your broker session has expired. Log in again."}
            ),
            400,
        )

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
    updated = set_trade_reasoning(row.id, result)
    if updated is None:
        return (
            jsonify({"status": "error", "message": "Could not save this trade's reasoning."}),
            500,
        )
    return jsonify({"status": "success", "data": updated})


@eod_reports_bp.route("/brokerage-settings", methods=["GET"])
@check_session_validity
def brokerage_settings_get():
    user_id, _broker = _session_user_broker()
    if not user_id:
        return jsonify({"status": "error", "message": "Not logged in"}), 400
    return jsonify({"status": "success", "data": get_brokerage_settings(user_id)})


@eod_reports_bp.route("/brokerage-settings", methods=["POST"])
@check_session_validity
def brokerage_settings_post():
    user_id, _broker = _session_user_broker()
    if not user_id:
        return jsonify({"status": "error", "message": "Not logged in"}), 400
    saved = set_brokerage_settings(user_id, request.get_json(silent=True) or {})
    if saved is None:
        return (
            jsonify(
                {
                    "status": "error",
                    "message": "Could not save brokerage rates. Try again in a moment.",
                }
            ),
            500,
        )
    return jsonify({"status": "success", "data": saved})


# The page's own Refresh button: recompute today's balance/charges/trade
# analysis/reasoning on demand, writing the same rows the scheduled job for
# that market class would (15:40 IST for equity_fo, 23:45 IST for commodity).
# Idempotent per market_class (see services/eod_reports_service.py), so
# refreshing mid-day and letting the scheduled job run later both just
# overwrite today's rows for that market class with the latest numbers.
@eod_reports_bp.route("/refresh", methods=["POST"])
@check_session_validity
def refresh_now():
    from services.eod_reports_service import run_eod_report_job

    market_class = _parse_market_class((request.get_json(silent=True) or {}).get("market_class"))
    result = run_eod_report_job(market_class)
    if result.get("status") != "ok":
        reason = result.get("reason")
        message = (
            "You need to be logged in to a broker before this can be refreshed."
            if reason in ("not_logged_in", "no_auth_token")
            else "Could not refresh today's reports. Try again in a moment."
        )
        return jsonify({"status": "error", "message": message}), 400
    return jsonify(result)
