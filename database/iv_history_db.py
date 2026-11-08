# database/iv_history_db.py
# One row per (underlying, exchange, trading day): that day's ATM
# implied volatility, recorded whenever the IV Smile tool is opened for it.
#
# This is the only source IV Rank and IV Percentile can be computed from.
# Historical options prices are not available from any broker's REST API far
# enough back to derive a year of past IV, so the history has to be built by
# the platform itself, one day at a time, starting from whenever this table
# was added. A fresh install reads an honest "not enough history yet" rather
# than a number computed against data it does not have.

import os
from datetime import date, datetime

from sqlalchemy import Column, Date, DateTime, Float, String, UniqueConstraint, func
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import scoped_session, sessionmaker

from database.engine_factory import create_db_engine
from utils.logging import get_logger

logger = get_logger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_db_engine(DATABASE_URL)

db_session = scoped_session(sessionmaker(autocommit=False, autoflush=False, bind=engine))
Base = declarative_base()
Base.query = db_session.query_property()


class IVHistory(Base):
    __tablename__ = "iv_history"
    __table_args__ = (
        UniqueConstraint("underlying", "exchange", "trade_date", name="uq_iv_history_day"),
    )

    id = Column(String(64), primary_key=True)  # f"{exchange}:{underlying}:{trade_date}"
    underlying = Column(String(32), nullable=False)
    exchange = Column(String(20), nullable=False)
    trade_date = Column(Date, nullable=False)
    atm_iv = Column(Float, nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


def init_db():
    """Initialize the IV history table."""
    from database.db_init_helper import init_db_with_logging

    init_db_with_logging(Base, engine, "IV History DB", logger)


def record_atm_iv(
    underlying: str, exchange: str, atm_iv: float, trade_date: date | None = None
) -> None:
    """Upsert today's ATM IV reading. Safe to call many times a day.

    Each call overwrites the same row, so the stored value is always the
    latest reading seen so far that trading day, not an average or an
    opening snapshot. That is the deliberate choice: an IV Rank computed
    while the market is still open is always "as of the last time someone
    looked," same as every other live number this platform shows.
    """
    trade_date = trade_date or datetime.now().date()
    row_id = f"{exchange}:{underlying}:{trade_date.isoformat()}"
    try:
        row = IVHistory.query.filter_by(id=row_id).first()
        if row:
            row.atm_iv = atm_iv
        else:
            db_session.add(
                IVHistory(
                    id=row_id,
                    underlying=underlying,
                    exchange=exchange,
                    trade_date=trade_date,
                    atm_iv=atm_iv,
                )
            )
        db_session.commit()
    except Exception as e:
        db_session.rollback()
        logger.exception(f"[IVHistoryDB] Failed to record ATM IV for {row_id}: {e}")


def get_iv_history(underlying: str, exchange: str, exclude_date: date | None = None) -> list[float]:
    """Every recorded daily ATM IV for this instrument, oldest first.

    `exclude_date` leaves out the day in progress (today, almost always):
    rank and percentile read today's live number against *prior* closed
    days, not against itself.
    """
    try:
        q = IVHistory.query.filter_by(underlying=underlying, exchange=exchange)
        if exclude_date:
            q = q.filter(IVHistory.trade_date != exclude_date)
        rows = q.order_by(IVHistory.trade_date.asc()).all()
        return [r.atm_iv for r in rows]
    except Exception as e:
        logger.exception(
            f"[IVHistoryDB] Failed to read IV history for {exchange}:{underlying}: {e}"
        )
        return []
