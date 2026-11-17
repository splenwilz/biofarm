import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, UtcDateTime

# JSONB on Postgres (indexable with GIN if attribution reporting grows);
# plain JSON on SQLite in tests.
JsonCol = JSON().with_variant(JSONB(), "postgresql")


def _new_id() -> str:
    return str(uuid.uuid4())


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    form: Mapped[str] = mapped_column(String(20))  # one of schemas.LEAD_FORMS: contact | newsletter | cpd | fold | landowner

    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(320), index=True)
    phone: Mapped[str | None] = mapped_column(String(50))
    message: Mapped[str | None] = mapped_column(Text)
    fields: Mapped[list] = mapped_column(JsonCol, default=list)
    newsletter_opt_in: Mapped[bool] = mapped_column(Boolean, default=False)
    # contact form's "Where did you hear about us?": a schemas.HeardAbout key, or NULL
    heard_about: Mapped[str | None] = mapped_column(String(30))
    # their own words when heard_about is "other", else NULL
    heard_about_other: Mapped[str | None] = mapped_column(String(200))
    # the contact form's developer questions, as typed / a schemas.UnitsWhen key, or NULL
    units_needed: Mapped[str | None] = mapped_column(String(100))
    site_location: Mapped[str | None] = mapped_column(String(200))
    units_when: Mapped[str | None] = mapped_column(String(20))

    page: Mapped[str | None] = mapped_column(String(512))
    attribution: Mapped[dict | None] = mapped_column(JsonCol)
    first_touch: Mapped[dict | None] = mapped_column(JsonCol)
    ga_client_id: Mapped[str | None] = mapped_column(String(64))
    ga_session_id: Mapped[str | None] = mapped_column(String(64))
    client_ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(512))

    spam_flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    spam_reasons: Mapped[list] = mapped_column(JsonCol, default=list)

    # pending | synced | failed | skipped_spam | disabled
    sync_status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    sync_error: Mapped[str | None] = mapped_column(Text)
    pipedrive_person_id: Mapped[int | None] = mapped_column(Integer)
    pipedrive_lead_id: Mapped[str | None] = mapped_column(String(64))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class MarketingEvent(Base):
    """A marketing event (trade show, CPD session, webinar) as the dashboard
    shows it. Name, date, type, cost and attendees are entered by hand; the
    enquiries and qualified opportunities are counted from the Pipedrive
    mirror by `match`, the signals Sales used to tag that event's records:
    {"labels": [lead label ids], "deal_sources": [Deal Source option labels],
    "title_words": [whole words in the title], "channel": true to take every
    record on the Trade Show / Event channel, "window_from"/"window_to":
    ISO dates bounding when the records were logged}. See app/reporting/events.py."""

    __tablename__ = "marketing_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    name: Mapped[str] = mapped_column(String(200))
    date: Mapped[datetime] = mapped_column(UtcDateTime)
    type: Mapped[str] = mapped_column(String(20))  # schemas.EventType: trade_show | cpd | webinar | open_day
    cost_gbp: Mapped[float | None] = mapped_column(Float)
    attendees: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)
    match: Mapped[dict] = mapped_column(JsonCol, default=dict)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, server_default=func.now())
    # The dashboard payload's cache key reads the newest updated_at, so every write must move it:
    # the route and the seed set it by hand, and onupdate covers any write path that forgets.
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime, server_default=func.now(), onupdate=func.now())
