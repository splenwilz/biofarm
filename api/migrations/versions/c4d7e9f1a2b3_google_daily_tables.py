"""google daily tables

Daily rows from Google Ads (per campaign), GA4 (sessions by channel group and
by session source, key events by name) and Search Console (total / brand /
non-brand), plus the import run log. See app/google/models.py.

Revision ID: c4d7e9f1a2b3
Revises: b8e5f3d1c2a7
Create Date: 2026-11-11 18:30:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c4d7e9f1a2b3'
down_revision: str | Sequence[str] | None = 'b8e5f3d1c2a7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSON_COL = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'google_ads_daily',
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('campaign_id', sa.BigInteger(), autoincrement=False, nullable=False),
        sa.Column('campaign_name', sa.String(length=255), nullable=False),
        sa.Column('cost_micros', sa.BigInteger(), nullable=False),
        sa.Column('clicks', sa.Integer(), nullable=False),
        sa.Column('impressions', sa.Integer(), nullable=False),
        sa.Column('conversions', sa.Float(), nullable=False),
        sa.Column('conversions_value', sa.Float(), nullable=False),
        sa.Column('fetched_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('date', 'campaign_id'),
    )
    op.create_table(
        'ga4_channel_daily',
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('channel_group', sa.String(length=64), nullable=False),
        sa.Column('sessions', sa.Integer(), nullable=False),
        sa.Column('fetched_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('date', 'channel_group'),
    )
    op.create_table(
        'ga4_source_daily',
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('source', sa.String(length=255), nullable=False),
        sa.Column('sessions', sa.Integer(), nullable=False),
        sa.Column('fetched_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('date', 'source'),
    )
    op.create_table(
        'ga4_key_event_daily',
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('event_name', sa.String(length=255), nullable=False),
        sa.Column('key_events', sa.Integer(), nullable=False),
        sa.Column('event_count', sa.Integer(), nullable=False),
        sa.Column('fetched_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('date', 'event_name'),
    )
    op.create_table(
        'gsc_daily',
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('segment', sa.String(length=16), nullable=False),
        sa.Column('clicks', sa.Integer(), nullable=False),
        sa.Column('impressions', sa.Integer(), nullable=False),
        sa.Column('fetched_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('date', 'segment'),
    )
    op.create_table(
        'google_import_runs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('window_start', sa.Date(), nullable=True),
        sa.Column('window_end', sa.Date(), nullable=True),
        sa.Column('counts', JSON_COL, nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_google_import_runs_started_at'), 'google_import_runs', ['started_at'], unique=False)
    op.create_index(op.f('ix_google_import_runs_status'), 'google_import_runs', ['status'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_google_import_runs_status'), table_name='google_import_runs')
    op.drop_index(op.f('ix_google_import_runs_started_at'), table_name='google_import_runs')
    for table in ('google_import_runs', 'gsc_daily', 'ga4_key_event_daily', 'ga4_source_daily', 'ga4_channel_daily', 'google_ads_daily'):
        op.drop_table(table)
