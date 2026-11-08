"""Tables for the Pipedrive mirror. One row per Pipedrive record, keyed by its
Pipedrive id, with the raw API response kept in `raw` and `fetched_at` saying
when we last saw it. Users, activities and the Leads inbox are mirrored
alongside deals and persons; each person's marketing history (consent
changes and per-campaign opens and clicks) comes from the person flow. No foreign keys between the tables: Pipedrive can delete
a stage a deal still points at, and the mirror must not refuse that row.
"""

from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import TypeDecorator

from app.db import Base
from app.models import JsonCol


class UtcDateTime(TypeDecorator[datetime]):
    """A timezone-aware UTC datetime on every backend. Postgres stores
    timestamptz; SQLite stores naive text, so values come back naive there
    and are re-labelled UTC on the way out."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("mirror datetimes must be timezone-aware")
        return value.astimezone(UTC)

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


class Pipeline(Base):
    __tablename__ = "pd_pipelines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(String(255))
    order_nr: Mapped[int | None] = mapped_column(Integer)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    add_time: Mapped[datetime | None] = mapped_column(UtcDateTime)
    update_time: Mapped[datetime | None] = mapped_column(UtcDateTime)
    raw: Mapped[dict] = mapped_column(JsonCol)
    fetched_at: Mapped[datetime] = mapped_column(UtcDateTime)


class Stage(Base):
    __tablename__ = "pd_stages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    pipeline_id: Mapped[int | None] = mapped_column(Integer, index=True)
    name: Mapped[str] = mapped_column(String(255))
    order_nr: Mapped[int | None] = mapped_column(Integer)
    deal_probability: Mapped[int | None] = mapped_column(Integer)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    add_time: Mapped[datetime | None] = mapped_column(UtcDateTime)
    update_time: Mapped[datetime | None] = mapped_column(UtcDateTime)
    raw: Mapped[dict] = mapped_column(JsonCol)
    fetched_at: Mapped[datetime] = mapped_column(UtcDateTime)


class DealField(Base):
    """A deal field definition: the name behind a custom field's 40-character
    key, and the labels behind an enum or set field's option ids."""

    __tablename__ = "pd_deal_fields"

    field_code: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    field_type: Mapped[str | None] = mapped_column(String(32))
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False)
    options: Mapped[list | None] = mapped_column(JsonCol)
    raw: Mapped[dict] = mapped_column(JsonCol)
    fetched_at: Mapped[datetime] = mapped_column(UtcDateTime)


class MirrorDeal(Base):
    __tablename__ = "pd_deals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    title: Mapped[str | None] = mapped_column(String(512))
    pipeline_id: Mapped[int | None] = mapped_column(Integer, index=True)
    stage_id: Mapped[int | None] = mapped_column(Integer, index=True)
    status: Mapped[str | None] = mapped_column(String(16), index=True)
    # Pipedrive's built-in source fields: how the deal was created, and the
    # Source channel option id plus the free-text channel id (our source/medium label).
    origin: Mapped[str | None] = mapped_column(String(64))
    origin_id: Mapped[str | None] = mapped_column(String(255))
    channel: Mapped[int | None] = mapped_column(Integer, index=True)
    channel_id: Mapped[str | None] = mapped_column(String(255))
    person_id: Mapped[int | None] = mapped_column(Integer, index=True)
    org_id: Mapped[int | None] = mapped_column(Integer)
    owner_id: Mapped[int | None] = mapped_column(Integer)
    creator_user_id: Mapped[int | None] = mapped_column(Integer)
    value: Mapped[float | None] = mapped_column(Float)
    currency: Mapped[str | None] = mapped_column(String(8))
    lost_reason: Mapped[str | None] = mapped_column(Text)
    add_time: Mapped[datetime | None] = mapped_column(UtcDateTime, index=True)
    update_time: Mapped[datetime | None] = mapped_column(UtcDateTime)
    stage_change_time: Mapped[datetime | None] = mapped_column(UtcDateTime)
    won_time: Mapped[datetime | None] = mapped_column(UtcDateTime)
    lost_time: Mapped[datetime | None] = mapped_column(UtcDateTime)
    close_time: Mapped[datetime | None] = mapped_column(UtcDateTime)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    # The lead this deal was converted from (v2 include_fields=source_lead_id).
    # Pipedrive deletes the lead on conversion, so this is the only link.
    source_lead_id: Mapped[str | None] = mapped_column(String(36), index=True)
    # Custom fields keyed by their 40-character code; pd_deal_fields names them.
    custom_fields: Mapped[dict] = mapped_column(JsonCol, default=dict)
    raw: Mapped[dict] = mapped_column(JsonCol)
    fetched_at: Mapped[datetime] = mapped_column(UtcDateTime)
    # The deal's update_time when its changelog was last read; the changelog is
    # read again only once update_time moves past it.
    changelog_update_time: Mapped[datetime | None] = mapped_column(UtcDateTime)


class MirrorPerson(Base):
    __tablename__ = "pd_persons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    name: Mapped[str | None] = mapped_column(String(512))
    first_name: Mapped[str | None] = mapped_column(String(255))
    last_name: Mapped[str | None] = mapped_column(String(255))
    emails: Mapped[list] = mapped_column(JsonCol, default=list)
    phones: Mapped[list] = mapped_column(JsonCol, default=list)
    org_id: Mapped[int | None] = mapped_column(Integer)
    owner_id: Mapped[int | None] = mapped_column(Integer)
    label_ids: Mapped[list] = mapped_column(JsonCol, default=list)
    custom_fields: Mapped[dict] = mapped_column(JsonCol, default=dict)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    add_time: Mapped[datetime | None] = mapped_column(UtcDateTime)
    update_time: Mapped[datetime | None] = mapped_column(UtcDateTime)
    # Campaigns consent: no_consent | subscribed | unsubscribed | bounced | pending_consent | archived
    marketing_status: Mapped[str | None] = mapped_column(String(32), index=True)
    doi_status: Mapped[int | None] = mapped_column(Integer)
    raw: Mapped[dict] = mapped_column(JsonCol)
    fetched_at: Mapped[datetime] = mapped_column(UtcDateTime)
    # When the person's marketing history (status changes, campaign stats) was
    # last read; null for persons who never had consent.
    flow_fetched_at: Mapped[datetime | None] = mapped_column(UtcDateTime)


class MirrorUser(Base):
    __tablename__ = "pd_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    name: Mapped[str | None] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    raw: Mapped[dict] = mapped_column(JsonCol)
    fetched_at: Mapped[datetime] = mapped_column(UtcDateTime)


class Activity(Base):
    """Calls, emails, meetings, tasks and deadlines, done or planned."""

    __tablename__ = "pd_activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    type: Mapped[str | None] = mapped_column(String(64), index=True)
    subject: Mapped[str | None] = mapped_column(String(512))
    owner_id: Mapped[int | None] = mapped_column(Integer)
    deal_id: Mapped[int | None] = mapped_column(Integer, index=True)
    lead_id: Mapped[str | None] = mapped_column(String(64))
    person_id: Mapped[int | None] = mapped_column(Integer, index=True)
    org_id: Mapped[int | None] = mapped_column(Integer)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    due_date: Mapped[str | None] = mapped_column(String(10))
    due_time: Mapped[str | None] = mapped_column(String(8))
    add_time: Mapped[datetime | None] = mapped_column(UtcDateTime, index=True)
    update_time: Mapped[datetime | None] = mapped_column(UtcDateTime)
    marked_as_done_time: Mapped[datetime | None] = mapped_column(UtcDateTime)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    raw: Mapped[dict] = mapped_column(JsonCol)
    fetched_at: Mapped[datetime] = mapped_column(UtcDateTime)


class MirrorLead(Base):
    """The Leads inbox (v1 API; ids are uuids). Custom fields arrive at the top
    level keyed by their 40-character code and are gathered into custom_fields."""

    __tablename__ = "pd_leads"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str | None] = mapped_column(String(512))
    owner_id: Mapped[int | None] = mapped_column(Integer)
    creator_id: Mapped[int | None] = mapped_column(Integer)
    person_id: Mapped[int | None] = mapped_column(Integer, index=True)
    org_id: Mapped[int | None] = mapped_column(Integer)
    source_name: Mapped[str | None] = mapped_column(String(64))
    source_deal_id: Mapped[int | None] = mapped_column(Integer)
    origin: Mapped[str | None] = mapped_column(String(64))
    origin_id: Mapped[str | None] = mapped_column(String(255))
    channel: Mapped[int | None] = mapped_column(Integer)
    channel_id: Mapped[str | None] = mapped_column(String(255))
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    archive_time: Mapped[datetime | None] = mapped_column(UtcDateTime)
    was_seen: Mapped[bool] = mapped_column(Boolean, default=False)
    # Pipedrive never lists a converted or removed lead again; a full import
    # marks the rows it no longer sees. Incremental runs cannot tell.
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    add_time: Mapped[datetime | None] = mapped_column(UtcDateTime, index=True)
    update_time: Mapped[datetime | None] = mapped_column(UtcDateTime)
    custom_fields: Mapped[dict] = mapped_column(JsonCol, default=dict)
    raw: Mapped[dict] = mapped_column(JsonCol)
    fetched_at: Mapped[datetime] = mapped_column(UtcDateTime)


class MarketingStatusChange(Base):
    """One row per consent change from the person's flow: who or which
    campaign set the status, and when. Keyed by Pipedrive's own change id."""

    __tablename__ = "pd_marketing_status_changes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    person_id: Mapped[int] = mapped_column(Integer, index=True)
    changed_at: Mapped[datetime] = mapped_column(UtcDateTime, index=True)
    status: Mapped[str] = mapped_column(String(32))
    # user | campaign | ... as Pipedrive reports it
    reason: Mapped[str | None] = mapped_column(String(64))
    campaign_id: Mapped[int | None] = mapped_column(Integer, index=True)
    user_id: Mapped[int | None] = mapped_column(Integer)
    raw: Mapped[dict] = mapped_column(JsonCol)


class CampaignStat(Base):
    """One row per (campaign, person) from the person's flow: the send and
    what that person did with it. The Campaigns product has no stats endpoint;
    this is how issue figures are rebuilt."""

    __tablename__ = "pd_campaign_stats"

    campaign_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    person_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    campaign_name: Mapped[str | None] = mapped_column(String(512))
    campaign_type: Mapped[str | None] = mapped_column(String(32))
    sent_at: Mapped[datetime | None] = mapped_column(UtcDateTime, index=True)
    opens: Mapped[int] = mapped_column(Integer, default=0)
    clicks: Mapped[int] = mapped_column(Integer, default=0)
    first_open_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    clicked_links: Mapped[list] = mapped_column(JsonCol, default=list)
    raw: Mapped[dict] = mapped_column(JsonCol)
    fetched_at: Mapped[datetime] = mapped_column(UtcDateTime)


class DealStageHistory(Base):
    """One row per stage move, from the deal changelog. A deal cannot move to
    the same stage twice in the same second, so (deal, time, new stage) is the key."""

    __tablename__ = "pd_deal_stage_history"

    deal_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    changed_at: Mapped[datetime] = mapped_column(UtcDateTime, primary_key=True)
    new_stage_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    old_stage_id: Mapped[int | None] = mapped_column(Integer)
    actor_user_id: Mapped[int | None] = mapped_column(Integer)
    change_source: Mapped[str | None] = mapped_column(String(64))


class DealChange(Base):
    """Every field change from the deal changelog, stage moves included. The id
    is a hash of the change itself, so the same change read twice is one row
    even when old or new value is null."""

    __tablename__ = "pd_deal_changes"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    deal_id: Mapped[int] = mapped_column(Integer, index=True)
    changed_at: Mapped[datetime] = mapped_column(UtcDateTime)
    field_key: Mapped[str] = mapped_column(String(64), index=True)
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    actor_user_id: Mapped[int | None] = mapped_column(Integer)
    change_source: Mapped[str | None] = mapped_column(String(64))
    raw: Mapped[dict] = mapped_column(JsonCol)


class ImportRun(Base):
    """One row per import. The last run with status "ok" sets the next run's
    incremental window."""

    __tablename__ = "pd_import_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    started_at: Mapped[datetime] = mapped_column(UtcDateTime, index=True)
    finished_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    # full | incremental
    mode: Mapped[str] = mapped_column(String(16))
    # running | ok | failed
    status: Mapped[str] = mapped_column(String(16), index=True)
    updated_since: Mapped[datetime | None] = mapped_column(UtcDateTime)
    counts: Mapped[dict | None] = mapped_column(JsonCol)
    error: Mapped[str | None] = mapped_column(Text)
