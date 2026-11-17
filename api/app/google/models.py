"""Daily rows from the Google APIs, one table per report, keyed by day plus
the report's own dimension. Each import replaces a trailing window of days
(figures get revised for a while after the day), so there are no updated-at
columns; `fetched_at` says when the row was last written."""

from datetime import date, datetime

from sqlalchemy import BigInteger, Date, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.mirror.models import UtcDateTime
from app.models import JsonCol


class AdsCampaignDay(Base):
    __tablename__ = "google_ads_daily"

    date: Mapped[date] = mapped_column(Date, primary_key=True)
    campaign_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    campaign_name: Mapped[str] = mapped_column(String(255))
    # Money in micros of the account currency (GBP on the Biofarm account): 1,000,000 = £1.
    cost_micros: Mapped[int] = mapped_column(BigInteger)
    clicks: Mapped[int] = mapped_column(Integer)
    impressions: Mapped[int] = mapped_column(Integer)
    conversions: Mapped[float] = mapped_column(Float)
    conversions_value: Mapped[float] = mapped_column(Float)
    fetched_at: Mapped[datetime] = mapped_column(UtcDateTime)


class Ga4ChannelDay(Base):
    """Sessions by GA4 default channel group ("Paid Search", "AI Assistant", ...)."""

    __tablename__ = "ga4_channel_daily"

    date: Mapped[date] = mapped_column(Date, primary_key=True)
    channel_group: Mapped[str] = mapped_column(String(64), primary_key=True)
    sessions: Mapped[int] = mapped_column(Integer)
    fetched_at: Mapped[datetime] = mapped_column(UtcDateTime)


class Ga4SourceDay(Base):
    """Sessions by session source (the referring host or utm_source), for the AI assistants."""

    __tablename__ = "ga4_source_daily"

    date: Mapped[date] = mapped_column(Date, primary_key=True)
    source: Mapped[str] = mapped_column(String(255), primary_key=True)
    sessions: Mapped[int] = mapped_column(Integer)
    fetched_at: Mapped[datetime] = mapped_column(UtcDateTime)


class Ga4KeyEventDay(Base):
    """Key events by event name, every name the property marks as a key event."""

    __tablename__ = "ga4_key_event_daily"

    date: Mapped[date] = mapped_column(Date, primary_key=True)
    event_name: Mapped[str] = mapped_column(String(255), primary_key=True)
    key_events: Mapped[int] = mapped_column(Integer)
    event_count: Mapped[int] = mapped_column(Integer)
    fetched_at: Mapped[datetime] = mapped_column(UtcDateTime)


class GscDay(Base):
    """Search Console clicks and impressions by day: total, brand queries, non-brand queries."""

    __tablename__ = "gsc_daily"

    date: Mapped[date] = mapped_column(Date, primary_key=True)
    segment: Mapped[str] = mapped_column(String(16), primary_key=True)
    clicks: Mapped[int] = mapped_column(Integer)
    impressions: Mapped[int] = mapped_column(Integer)
    fetched_at: Mapped[datetime] = mapped_column(UtcDateTime)


class GoogleImportRun(Base):
    """One row per import. The last "ok" run's finished_at is part of the
    dashboard payload's cache key."""

    __tablename__ = "google_import_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    started_at: Mapped[datetime] = mapped_column(UtcDateTime, index=True)
    finished_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    # running | ok | partial (a source failed, the rest imported) | failed
    status: Mapped[str] = mapped_column(String(16), index=True)
    window_start: Mapped[date | None] = mapped_column(Date)
    window_end: Mapped[date | None] = mapped_column(Date)
    # rows written per source (None for a source that failed this run), plus
    # "notes": the APIs' data-quality caveats for the run, when there were any
    counts: Mapped[dict | None] = mapped_column(JsonCol)
    error: Mapped[str | None] = mapped_column(Text)
