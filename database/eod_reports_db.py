# database/eod_reports_db.py
"""
Daily Reports: balance progression, charges breakdown, trade analysis.

Balance/funds and the tradebook are otherwise always live broker calls with
nothing persisted (see services/funds_service.py, services/tradebook_service.py),
so there is no history to chart and no way to look back at a day's costs or
performance once it has passed. These three tables are written once a day by
the EOD job in services/eod_reports_service.py, starting from the day this
feature is deployed - there is no historical backfill.

Mirrors database/alert_log_db.py:
- SQLite via the canonical engine factory (NullPool, closed immediately)
- scoped_session registered in utils/db_sessions.py for FD hygiene

Rows are scoped by ``user_id`` and ``broker`` for consistency with other
tables, though OpenAlgo is single-user per deployment.
"""

import json
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import Column, Date, DateTime, Float, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import scoped_session, sessionmaker

from database.engine_factory import create_db_engine
from utils.logging import get_logger

logger = get_logger(__name__)

engine = create_db_engine()

db_session = scoped_session(sessionmaker(autocommit=False, autoflush=False, bind=engine))
Base = declarative_base()
Base.query = db_session.query_property()


def _utc_now():
    return datetime.now(UTC).replace(tzinfo=None)


class BalanceSnapshot(Base):
    """One EOD balance reading per user/broker/day."""

    __tablename__ = "balance_snapshots"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(80), nullable=False)
    broker = Column(String(50), nullable=False)
    snapshot_date = Column(Date, nullable=False)
    available_cash = Column(Float, nullable=True)
    collateral = Column(Float, nullable=True)
    utilised_debits = Column(Float, nullable=True)
    m2m_unrealized = Column(Float, nullable=True)
    m2m_realized = Column(Float, nullable=True)
    #: available_cash + collateral - the single number the progression chart
    #: plots. Stored rather than derived at read time so a chart read is one
    #: query with no reconstruction of what counted at the time.
    net_balance = Column(Float, nullable=True)
    #: The full broker funds response, kept for forensics when a trader asks
    #: why a given day's number looks off and the normalized fields are not
    #: enough to answer.
    raw_funds_json = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utc_now)

    __table_args__ = (
        UniqueConstraint("user_id", "broker", "snapshot_date", name="uq_balance_snapshot_day"),
        Index("ix_balance_snapshots_user_date", "user_id", "broker", "snapshot_date"),
    )

    def to_dict(self):
        return {
            "date": self.snapshot_date.isoformat() if self.snapshot_date else None,
            "availableCash": self.available_cash,
            "collateral": self.collateral,
            "utilisedDebits": self.utilised_debits,
            "m2mUnrealized": self.m2m_unrealized,
            "m2mRealized": self.m2m_realized,
            "netBalance": self.net_balance,
        }


class DailyCharges(Base):
    """One row per (user, broker, day, market_class, segment) charges total."""

    __tablename__ = "daily_charges"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(80), nullable=False)
    broker = Column(String(50), nullable=False)
    trade_date = Column(Date, nullable=False)
    #: "equity_fo" or "commodity" - which of the two EOD runs wrote this row
    #: (services/eod_reports_service.py), so the 15:40 equity/F&O run and the
    #: 23:45 commodity run never touch each other's rows for the same day.
    market_class = Column(String(20), nullable=False, default="equity_fo")
    segment = Column(String(30), nullable=False)
    trade_count = Column(Integer, nullable=False, default=0)
    turnover = Column(Float, nullable=False, default=0.0)
    brokerage = Column(Float, nullable=False, default=0.0)
    stt = Column(Float, nullable=False, default=0.0)
    stamp_duty = Column(Float, nullable=False, default=0.0)
    exchange_txn_charge = Column(Float, nullable=False, default=0.0)
    sebi_fee = Column(Float, nullable=False, default=0.0)
    gst = Column(Float, nullable=False, default=0.0)
    total_charges = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime, nullable=False, default=_utc_now)

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "broker",
            "trade_date",
            "market_class",
            "segment",
            name="uq_daily_charges_day_segment",
        ),
        Index("ix_daily_charges_user_date", "user_id", "broker", "trade_date"),
    )

    def to_dict(self):
        return {
            "marketClass": self.market_class,
            "segment": self.segment,
            "tradeCount": self.trade_count,
            "turnover": self.turnover,
            "brokerage": self.brokerage,
            "stt": self.stt,
            "stampDuty": self.stamp_duty,
            "exchangeTxnCharge": self.exchange_txn_charge,
            "sebiFee": self.sebi_fee,
            "gst": self.gst,
            "totalCharges": self.total_charges,
        }


class TradeAnalysis(Base):
    """One row per (user, broker, day, market_class) trade-performance summary."""

    __tablename__ = "trade_analysis"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(80), nullable=False)
    broker = Column(String(50), nullable=False)
    trade_date = Column(Date, nullable=False)
    #: "equity_fo" or "commodity" - see DailyCharges.market_class.
    market_class = Column(String(20), nullable=False, default="equity_fo")
    total_trades = Column(Integer, nullable=False, default=0)
    winning_trades = Column(Integer, nullable=False, default=0)
    losing_trades = Column(Integer, nullable=False, default=0)
    win_rate = Column(Float, nullable=False, default=0.0)
    total_pnl = Column(Float, nullable=False, default=0.0)
    gross_profit = Column(Float, nullable=False, default=0.0)
    gross_loss = Column(Float, nullable=False, default=0.0)
    profit_factor = Column(Float, nullable=True)
    best_trade_symbol = Column(String(60), nullable=True)
    best_trade_pnl = Column(Float, nullable=True)
    worst_trade_symbol = Column(String(60), nullable=True)
    worst_trade_pnl = Column(Float, nullable=True)
    avg_win = Column(Float, nullable=True)
    avg_loss = Column(Float, nullable=True)
    #: {segment: {trade_count, pnl, win_rate}} - small and derived, so JSON
    #: rather than a fourth table nothing else needs to query by segment.
    segment_breakdown_json = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utc_now)

    __table_args__ = (
        UniqueConstraint(
            "user_id", "broker", "trade_date", "market_class", name="uq_trade_analysis_day"
        ),
        Index("ix_trade_analysis_user_date", "user_id", "broker", "trade_date"),
    )

    def to_dict(self):
        try:
            segment_breakdown = json.loads(self.segment_breakdown_json or "{}")
        except (TypeError, ValueError):
            segment_breakdown = {}
        return {
            "date": self.trade_date.isoformat() if self.trade_date else None,
            "marketClass": self.market_class,
            "totalTrades": self.total_trades,
            "winningTrades": self.winning_trades,
            "losingTrades": self.losing_trades,
            "winRate": self.win_rate,
            "totalPnl": self.total_pnl,
            "grossProfit": self.gross_profit,
            "grossLoss": self.gross_loss,
            "profitFactor": self.profit_factor,
            "bestTradeSymbol": self.best_trade_symbol,
            "bestTradePnl": self.best_trade_pnl,
            "worstTradeSymbol": self.worst_trade_symbol,
            "worstTradePnl": self.worst_trade_pnl,
            "avgWin": self.avg_win,
            "avgLoss": self.avg_loss,
            "segmentBreakdown": segment_breakdown,
        }


class BrokerageSettings(Base):
    """The trader's own brokerage rate per segment, flat per executed trade.

    Brokerage is genuinely broker/plan-dependent and not discoverable from any
    broker API response (see services/charges/statutory_rates.py), so it is
    the one input to the charges calculator the trader supplies directly, one
    row per user.
    """

    __tablename__ = "brokerage_settings"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(80), nullable=False, unique=True)
    equity_delivery = Column(Float, nullable=False, default=0.0)
    equity_intraday = Column(Float, nullable=False, default=0.0)
    fo_futures = Column(Float, nullable=False, default=0.0)
    fo_options = Column(Float, nullable=False, default=0.0)
    commodity_futures = Column(Float, nullable=False, default=0.0)
    commodity_options = Column(Float, nullable=False, default=0.0)

    def to_dict(self):
        return {
            "equity_delivery": self.equity_delivery,
            "equity_intraday": self.equity_intraday,
            "fo_futures": self.fo_futures,
            "fo_options": self.fo_options,
            "commodity_futures": self.commodity_futures,
            "commodity_options": self.commodity_options,
        }


class ClosedTrade(Base):
    """One FIFO-matched closed trade, with its AI reasoning once generated.

    Written by services/eod_reports_service.py's EOD run, which replaces the
    prior set for that user/broker/day/market_class on every run (a manual
    Refresh mid-day followed by the scheduled run just recomputes the same
    trades) - but a trade that reappears unchanged keeps its previously
    generated reasoning instead of being re-billed to the AI model for it
    (database.eod_reports_db._closed_trade_key). Also updated in place by a
    trader's on-demand "Analyze" click (blueprints/eod_reports.py's POST
    .../trades/<id>/analyze), which always regenerates.
    """

    __tablename__ = "closed_trades"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(80), nullable=False)
    broker = Column(String(50), nullable=False)
    trade_date = Column(Date, nullable=False)
    market_class = Column(String(20), nullable=False, default="equity_fo")
    segment = Column(String(30), nullable=False)
    symbol = Column(String(60), nullable=False)
    exchange = Column(String(20), nullable=False)
    product = Column(String(20), nullable=False)
    entry_price = Column(Float, nullable=False)
    exit_price = Column(Float, nullable=False)
    quantity = Column(Float, nullable=False)
    pnl = Column(Float, nullable=False)
    #: Epoch seconds, matching match_fifo_trades' "_sort_time"-derived output.
    entry_time = Column(Float, nullable=True)
    exit_time = Column(Float, nullable=True)
    reasoning_text = Column(Text, nullable=True)
    #: One of good/neutral/poor/unrated - see services/trade_reasoning_service.py.
    reasoning_verdict = Column(String(16), nullable=False, default="unrated")
    reasoning_model = Column(String(120), nullable=True)
    reasoning_generated_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utc_now)

    __table_args__ = (
        Index(
            "ix_closed_trades_user_date_class",
            "user_id",
            "broker",
            "trade_date",
            "market_class",
        ),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "marketClass": self.market_class,
            "segment": self.segment,
            "symbol": self.symbol,
            "exchange": self.exchange,
            "product": self.product,
            "entryPrice": self.entry_price,
            "exitPrice": self.exit_price,
            "quantity": self.quantity,
            "pnl": self.pnl,
            "entryTime": self.entry_time,
            "exitTime": self.exit_time,
            "reasoningText": self.reasoning_text,
            "reasoningVerdict": self.reasoning_verdict,
            "reasoningModel": self.reasoning_model,
            "reasoningGeneratedAt": (
                self.reasoning_generated_at.isoformat() if self.reasoning_generated_at else None
            ),
        }


def init_db():
    """Create the EOD reports tables if they are not there yet."""
    from database.db_init_helper import init_db_with_logging

    init_db_with_logging(Base, engine, "EOD Reports DB", logger)


def get_brokerage_settings(user_id: str) -> dict:
    """This user's brokerage rates, or the all-zero default if never set."""
    from services.charges.statutory_rates import DEFAULT_BROKERAGE_SETTINGS

    try:
        row = db_session.query(BrokerageSettings).filter_by(user_id=user_id).first()
        return dict(row.to_dict()) if row else dict(DEFAULT_BROKERAGE_SETTINGS)
    except Exception:
        db_session.rollback()
        logger.exception("Could not read brokerage settings")
        return dict(DEFAULT_BROKERAGE_SETTINGS)


def set_brokerage_settings(user_id: str, rates: dict) -> dict | None:
    """Persist this user's brokerage rates, creating the row on first save."""
    try:
        row = db_session.query(BrokerageSettings).filter_by(user_id=user_id).first()
        if row is None:
            row = BrokerageSettings(user_id=user_id)
            db_session.add(row)
        for field in (
            "equity_delivery",
            "equity_intraday",
            "fo_futures",
            "fo_options",
            "commodity_futures",
            "commodity_options",
        ):
            if field in rates:
                setattr(row, field, max(0.0, float(rates[field] or 0.0)))
        db_session.commit()
        return row.to_dict()
    except Exception:
        db_session.rollback()
        logger.exception("Could not save brokerage settings")
        return None


def upsert_balance_snapshot(user_id: str, broker: str, snapshot_date: date, fields: dict):
    """Insert today's balance row, or overwrite it if the job already ran today."""
    try:
        row = (
            db_session.query(BalanceSnapshot)
            .filter_by(user_id=user_id, broker=broker, snapshot_date=snapshot_date)
            .first()
        )
        if row is None:
            row = BalanceSnapshot(user_id=user_id, broker=broker, snapshot_date=snapshot_date)
            db_session.add(row)
        for key, value in fields.items():
            setattr(row, key, value)
        db_session.commit()
        return row.to_dict()
    except Exception:
        db_session.rollback()
        logger.exception("Could not write today's balance snapshot")
        return None


def upsert_daily_charges(
    user_id: str, broker: str, trade_date: date, by_segment: dict, market_class: str = "equity_fo"
):
    """Replace today's per-segment charge rows for this market class.

    Scoped to ``market_class`` so the 15:40 equity/F&O run and the 23:45
    commodity run never delete each other's rows for the same day.
    """
    try:
        db_session.query(DailyCharges).filter_by(
            user_id=user_id, broker=broker, trade_date=trade_date, market_class=market_class
        ).delete(synchronize_session=False)
        for segment, totals in by_segment.items():
            db_session.add(
                DailyCharges(
                    user_id=user_id,
                    broker=broker,
                    trade_date=trade_date,
                    market_class=market_class,
                    segment=segment,
                    trade_count=totals.get("trade_count", 0),
                    turnover=totals.get("turnover", 0.0),
                    brokerage=totals.get("brokerage", 0.0),
                    stt=totals.get("stt", 0.0),
                    stamp_duty=totals.get("stamp_duty", 0.0),
                    exchange_txn_charge=totals.get("exchange_txn_charge", 0.0),
                    sebi_fee=totals.get("sebi_fee", 0.0),
                    gst=totals.get("gst", 0.0),
                    total_charges=totals.get("total_charges", 0.0),
                )
            )
        db_session.commit()
        return True
    except Exception:
        db_session.rollback()
        logger.exception("Could not write today's daily charges")
        return False


def upsert_trade_analysis(
    user_id: str, broker: str, trade_date: date, stats: dict, market_class: str = "equity_fo"
):
    """Insert or overwrite today's trade-analysis row for this market class."""
    try:
        row = (
            db_session.query(TradeAnalysis)
            .filter_by(
                user_id=user_id, broker=broker, trade_date=trade_date, market_class=market_class
            )
            .first()
        )
        if row is None:
            row = TradeAnalysis(
                user_id=user_id, broker=broker, trade_date=trade_date, market_class=market_class
            )
            db_session.add(row)
        row.total_trades = stats.get("total_trades", 0)
        row.winning_trades = stats.get("winning_trades", 0)
        row.losing_trades = stats.get("losing_trades", 0)
        row.win_rate = stats.get("win_rate", 0.0)
        row.total_pnl = stats.get("total_pnl", 0.0)
        row.gross_profit = stats.get("gross_profit", 0.0)
        row.gross_loss = stats.get("gross_loss", 0.0)
        row.profit_factor = stats.get("profit_factor")
        row.best_trade_symbol = stats.get("best_trade_symbol")
        row.best_trade_pnl = stats.get("best_trade_pnl")
        row.worst_trade_symbol = stats.get("worst_trade_symbol")
        row.worst_trade_pnl = stats.get("worst_trade_pnl")
        row.avg_win = stats.get("avg_win")
        row.avg_loss = stats.get("avg_loss")
        row.segment_breakdown_json = json.dumps(stats.get("segment_breakdown", {}))
        db_session.commit()
        return row.to_dict()
    except Exception:
        db_session.rollback()
        logger.exception("Could not write today's trade analysis")
        return None


def get_balance_progression(user_id: str, broker: str, days: int = 90):
    try:
        rows = (
            db_session.query(BalanceSnapshot)
            .filter_by(user_id=user_id, broker=broker)
            .order_by(BalanceSnapshot.snapshot_date.desc())
            .limit(max(1, min(int(days or 90), 3650)))
            .all()
        )
        return [row.to_dict() for row in reversed(rows)]
    except Exception:
        db_session.rollback()
        logger.exception("Could not read the balance progression")
        return []


def get_daily_charges(user_id: str, broker: str, trade_date: date, market_class: str = "equity_fo"):
    try:
        rows = (
            db_session.query(DailyCharges)
            .filter_by(
                user_id=user_id, broker=broker, trade_date=trade_date, market_class=market_class
            )
            .all()
        )
        return [row.to_dict() for row in rows]
    except Exception:
        db_session.rollback()
        logger.exception("Could not read the day's charges")
        return []


def get_trade_analysis(
    user_id: str, broker: str, trade_date: date, market_class: str = "equity_fo"
):
    try:
        row = (
            db_session.query(TradeAnalysis)
            .filter_by(
                user_id=user_id, broker=broker, trade_date=trade_date, market_class=market_class
            )
            .first()
        )
        return row.to_dict() if row else None
    except Exception:
        db_session.rollback()
        logger.exception("Could not read the day's trade analysis")
        return None


def _closed_trade_key(row_like) -> tuple:
    """Identifies "the same" closed trade across reruns of the EOD job.

    A FIFO match on the same day's fills is deterministic, so a trade that
    reappears with the same symbol/exchange/product/qty/entry/exit is the
    same round trip, not a new one - its prior reasoning should survive a
    re-run instead of being thrown away and re-billed to the AI model.
    """
    get = row_like.get if isinstance(row_like, dict) else lambda k: getattr(row_like, k)
    return (
        get("symbol"),
        get("exchange"),
        get("product"),
        get("entry_time"),
        get("exit_time"),
        round(get("quantity") or 0, 4),
    )


def replace_closed_trades(
    user_id: str, broker: str, trade_date: date, market_class: str, trades: list[dict]
) -> list:
    """Replace this day/market_class's closed trades with a freshly computed set,
    carrying over each trade's prior reasoning where it matches a trade from
    before (see ``_closed_trade_key``) rather than discarding it.

    Returns the ORM rows (with their ids) so the caller can loop over them and
    generate reasoning only for the ones that don't already have it.
    """
    try:
        existing = (
            db_session.query(ClosedTrade)
            .filter_by(
                user_id=user_id, broker=broker, trade_date=trade_date, market_class=market_class
            )
            .all()
        )
        # Copied out as plain tuples, not kept as ORM objects: the delete
        # below reuses these rows' primary keys for the new insert, and an
        # ORM object still in the session's identity map under an id now
        # given to a different row is exactly the kind of stale reference
        # that silently serves another trade's reasoning to the wrong row.
        existing_reasoning_by_key = {
            _closed_trade_key(row): (
                row.reasoning_text,
                row.reasoning_verdict,
                row.reasoning_model,
                row.reasoning_generated_at,
            )
            for row in existing
            if row.reasoning_text
        }
        db_session.expunge_all()

        db_session.query(ClosedTrade).filter_by(
            user_id=user_id, broker=broker, trade_date=trade_date, market_class=market_class
        ).delete(synchronize_session=False)

        rows = []
        for trade in trades:
            row = ClosedTrade(
                user_id=user_id,
                broker=broker,
                trade_date=trade_date,
                market_class=market_class,
                segment=trade.get("segment", ""),
                symbol=trade.get("symbol", ""),
                exchange=trade.get("exchange", ""),
                product=trade.get("product", ""),
                entry_price=trade.get("entry_price", 0.0),
                exit_price=trade.get("exit_price", 0.0),
                quantity=trade.get("quantity", 0.0),
                pnl=trade.get("pnl", 0.0),
                entry_time=trade.get("entry_time"),
                exit_time=trade.get("exit_time"),
            )
            prior = existing_reasoning_by_key.get(_closed_trade_key(trade))
            if prior is not None:
                (
                    row.reasoning_text,
                    row.reasoning_verdict,
                    row.reasoning_model,
                    row.reasoning_generated_at,
                ) = prior
            db_session.add(row)
            rows.append(row)
        db_session.commit()
        return rows
    except Exception:
        db_session.rollback()
        logger.exception("Could not write today's closed trades")
        return []


def set_trade_reasoning(trade_id: int, result: dict) -> dict | None:
    """Attach (or replace) one closed trade's AI reasoning."""
    try:
        row = db_session.query(ClosedTrade).filter_by(id=trade_id).first()
        if row is None:
            return None
        row.reasoning_text = result.get("reasoning_text")
        row.reasoning_verdict = result.get("verdict", "unrated")
        row.reasoning_model = result.get("model")
        row.reasoning_generated_at = _utc_now()
        db_session.commit()
        return row.to_dict()
    except Exception:
        db_session.rollback()
        logger.exception("Could not save a trade's reasoning")
        return None


def _attach_thesis_notes(trades: list[dict], user_id: str, broker: str) -> list[dict]:
    """Matches each closed trade to any thesis note(s) typed in the scalping
    terminal's note box while it was open (database.scalping_db.
    ScalpingOrderNote) - there is no orderid anywhere in this system to join
    on exactly, so a note counts as this trade's if its symbol/exchange/
    product match and it was written between the trade's entry and exit
    (plus a small buffer either side for order/ack latency).
    """
    times = [t["entryTime"] for t in trades if t["entryTime"]] + [
        t["exitTime"] for t in trades if t["exitTime"]
    ]
    if not times:
        return trades

    try:
        from database.scalping_db import get_order_notes_in_window
    except Exception:
        logger.exception("Could not load scalping order notes module")
        return trades

    buffer_seconds = 120
    notes = get_order_notes_in_window(
        user_id, broker, min(times) - buffer_seconds, max(times) + buffer_seconds
    )

    for trade in trades:
        entry_time = trade["entryTime"]
        exit_time = trade["exitTime"]
        if entry_time is None or exit_time is None:
            trade["thesisNotes"] = []
            continue
        window_start = entry_time - buffer_seconds
        window_end = exit_time + buffer_seconds
        trade["thesisNotes"] = [
            n["note_text"]
            for n in notes
            if n["symbol"] == trade["symbol"]
            and n["exchange"] == trade["exchange"]
            and n["product"] == trade["product"]
            and window_start <= n["created_at_epoch"] <= window_end
        ]
    return trades


def get_closed_trades(user_id: str, broker: str, trade_date: date, market_class: str):
    try:
        rows = (
            db_session.query(ClosedTrade)
            .filter_by(
                user_id=user_id, broker=broker, trade_date=trade_date, market_class=market_class
            )
            .order_by(ClosedTrade.exit_time.asc())
            .all()
        )
        return _attach_thesis_notes([row.to_dict() for row in rows], user_id, broker)
    except Exception:
        db_session.rollback()
        logger.exception("Could not read the day's closed trades")
        return []


def _verdict_breakdown(trades: list[dict]) -> dict:
    counts = {"good": 0, "neutral": 0, "poor": 0, "unrated": 0}
    for t in trades:
        counts[t.get("reasoningVerdict") or "unrated"] = (
            counts.get(t.get("reasoningVerdict") or "unrated", 0) + 1
        )
    return counts


def _outcome_bucket(trades: list[dict]) -> dict:
    count = len(trades)
    if count == 0:
        return {
            "tradeCount": 0,
            "winRate": 0.0,
            "totalPnl": 0.0,
            "avgPnl": 0.0,
            "verdictBreakdown": _verdict_breakdown([]),
        }
    wins = sum(1 for t in trades if t["pnl"] > 0)
    total_pnl = sum(t["pnl"] for t in trades)
    return {
        "tradeCount": count,
        "winRate": round(wins / count * 100, 2),
        "totalPnl": round(total_pnl, 2),
        "avgPnl": round(total_pnl / count, 2),
        "verdictBreakdown": _verdict_breakdown(trades),
    }


def get_thesis_outcome_stats(user_id: str, broker: str, days: int = 30) -> dict:
    """Compares closed trades that carry the trader's own thesis note (typed
    live into the scalping terminal, see _attach_thesis_notes) against ones
    fired with none, across both market classes over the last `days` days -
    answers the trader's own question of whether stating a thesis before
    firing correlates with a better outcome for them, not an AI judgment.
    """
    cutoff = datetime.now(UTC).date() - timedelta(days=days)
    try:
        rows = (
            db_session.query(ClosedTrade)
            .filter(
                ClosedTrade.user_id == user_id,
                ClosedTrade.broker == broker,
                ClosedTrade.trade_date >= cutoff,
            )
            .all()
        )
        trades = _attach_thesis_notes([row.to_dict() for row in rows], user_id, broker)
        with_thesis = [t for t in trades if t["thesisNotes"]]
        without_thesis = [t for t in trades if not t["thesisNotes"]]
        return {
            "days": days,
            "withThesis": _outcome_bucket(with_thesis),
            "withoutThesis": _outcome_bucket(without_thesis),
        }
    except Exception:
        db_session.rollback()
        logger.exception("Could not compute thesis-vs-outcome stats")
        return {
            "days": days,
            "withThesis": _outcome_bucket([]),
            "withoutThesis": _outcome_bucket([]),
        }


def get_closed_trade(user_id: str, broker: str, trade_id: int):
    """One closed trade, scoped to its owner so a trade id cannot be probed
    across users/brokers."""
    try:
        return (
            db_session.query(ClosedTrade)
            .filter_by(id=trade_id, user_id=user_id, broker=broker)
            .first()
        )
    except Exception:
        db_session.rollback()
        logger.exception("Could not read a closed trade")
        return None


def get_pnl_calendar(user_id: str, broker: str, days: int = 400):
    """One {date, pnl} entry per day with a trade_analysis row, summed across
    market classes (a day with both an equity/F&O and a commodity run
    contributes one combined total, not two rows) - the heatmap on the
    Balance Progression tab reads this directly.
    """
    try:
        from sqlalchemy import func

        capped = max(1, min(int(days or 400), 3650))
        rows = (
            db_session.query(
                TradeAnalysis.trade_date, func.sum(TradeAnalysis.total_pnl).label("pnl")
            )
            .filter_by(user_id=user_id, broker=broker)
            .group_by(TradeAnalysis.trade_date)
            .order_by(TradeAnalysis.trade_date.desc())
            .limit(capped)
            .all()
        )
        return [
            {"date": row.trade_date.isoformat(), "pnl": round(row.pnl or 0.0, 2)}
            for row in reversed(rows)
        ]
    except Exception:
        db_session.rollback()
        logger.exception("Could not read the P&L calendar")
        return []


def _trend_period_key(d: date, period: str) -> tuple[date, str]:
    """The bucket a day's trade_analysis row falls into, and its label."""
    if period == "month":
        start = d.replace(day=1)
        return start, start.strftime("%b %Y")
    start = d - timedelta(days=d.weekday())  # Monday of that ISO week
    return start, start.strftime("%d %b")


def get_trade_analysis_trend(
    user_id: str, broker: str, period: str = "week", periods: int = 12
) -> list[dict]:
    """Week-over-week or month-over-month trend, one point per period, summed
    across market classes like get_pnl_calendar (a period with both an
    equity/F&O and a commodity day contributes one combined total).

    Recomputed from each period's summed trade/win/loss counts rather than
    averaging each day's own win_rate - averaging would weight a single-trade
    day the same as a thirty-trade day.
    """
    period = period if period in ("week", "month") else "week"
    periods = max(1, min(int(periods or 12), 104))
    today = datetime.now(UTC).date()
    cutoff = (
        today.replace(day=1) - timedelta(days=31 * periods)
        if period == "month"
        else today - timedelta(weeks=periods)
    )

    try:
        rows = (
            db_session.query(TradeAnalysis)
            .filter(
                TradeAnalysis.user_id == user_id,
                TradeAnalysis.broker == broker,
                TradeAnalysis.trade_date >= cutoff,
            )
            .all()
        )
    except Exception:
        db_session.rollback()
        logger.exception("Could not read the trade analysis trend")
        return []

    buckets: dict[date, dict] = {}
    labels: dict[date, str] = {}
    for row in rows:
        start, label = _trend_period_key(row.trade_date, period)
        bucket = buckets.setdefault(
            start,
            {
                "totalTrades": 0,
                "winningTrades": 0,
                "losingTrades": 0,
                "totalPnl": 0.0,
                "grossProfit": 0.0,
                "grossLoss": 0.0,
            },
        )
        bucket["totalTrades"] += row.total_trades
        bucket["winningTrades"] += row.winning_trades
        bucket["losingTrades"] += row.losing_trades
        bucket["totalPnl"] += row.total_pnl
        bucket["grossProfit"] += row.gross_profit
        bucket["grossLoss"] += row.gross_loss
        labels[start] = label

    result = []
    for start in sorted(buckets):
        b = buckets[start]
        win_rate = (
            round(b["winningTrades"] / b["totalTrades"] * 100, 2) if b["totalTrades"] else 0.0
        )
        profit_factor = round(b["grossProfit"] / abs(b["grossLoss"]), 2) if b["grossLoss"] else None
        result.append(
            {
                "periodStart": start.isoformat(),
                "label": labels[start],
                "totalTrades": b["totalTrades"],
                "winningTrades": b["winningTrades"],
                "losingTrades": b["losingTrades"],
                "winRate": win_rate,
                "totalPnl": round(b["totalPnl"], 2),
                "profitFactor": profit_factor,
            }
        )
    return result[-periods:]
