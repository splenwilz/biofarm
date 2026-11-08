"""pipedrive mirror tables

Read-only mirror of the Pipedrive account: pipelines, stages, deal field
definitions, deals (with the raw API record), persons, deal stage history,
every deal field change, and one row per import run. No foreign keys: the
mirror must accept whatever Pipedrive holds.

Revision ID: 2c23b943d536
Revises: 1bbbed35dc39
Create Date: 2026-11-06 04:28:05.656924

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '2c23b943d536'
down_revision: str | Sequence[str] | None = '1bbbed35dc39'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('pd_deal_changes',
    sa.Column('id', sa.String(length=40), nullable=False),
    sa.Column('deal_id', sa.Integer(), nullable=False),
    sa.Column('changed_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('field_key', sa.String(length=64), nullable=False),
    sa.Column('old_value', sa.Text(), nullable=True),
    sa.Column('new_value', sa.Text(), nullable=True),
    sa.Column('actor_user_id', sa.Integer(), nullable=True),
    sa.Column('change_source', sa.String(length=64), nullable=True),
    sa.Column('raw', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_pd_deal_changes_deal_id'), 'pd_deal_changes', ['deal_id'], unique=False)
    op.create_index(op.f('ix_pd_deal_changes_field_key'), 'pd_deal_changes', ['field_key'], unique=False)
    op.create_table('pd_deal_fields',
    sa.Column('field_code', sa.String(length=64), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('field_type', sa.String(length=32), nullable=True),
    sa.Column('is_custom', sa.Boolean(), nullable=False),
    sa.Column('options', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=True),
    sa.Column('raw', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('fetched_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('field_code')
    )
    op.create_table('pd_deal_stage_history',
    sa.Column('deal_id', sa.Integer(), nullable=False),
    sa.Column('changed_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('new_stage_id', sa.Integer(), nullable=False),
    sa.Column('old_stage_id', sa.Integer(), nullable=True),
    sa.Column('actor_user_id', sa.Integer(), nullable=True),
    sa.Column('change_source', sa.String(length=64), nullable=True),
    sa.PrimaryKeyConstraint('deal_id', 'changed_at', 'new_stage_id')
    )
    op.create_table('pd_deals',
    sa.Column('id', sa.Integer(), autoincrement=False, nullable=False),
    sa.Column('title', sa.String(length=512), nullable=True),
    sa.Column('pipeline_id', sa.Integer(), nullable=True),
    sa.Column('stage_id', sa.Integer(), nullable=True),
    sa.Column('status', sa.String(length=16), nullable=True),
    sa.Column('origin', sa.String(length=64), nullable=True),
    sa.Column('origin_id', sa.String(length=255), nullable=True),
    sa.Column('channel', sa.Integer(), nullable=True),
    sa.Column('channel_id', sa.String(length=255), nullable=True),
    sa.Column('person_id', sa.Integer(), nullable=True),
    sa.Column('org_id', sa.Integer(), nullable=True),
    sa.Column('owner_id', sa.Integer(), nullable=True),
    sa.Column('creator_user_id', sa.Integer(), nullable=True),
    sa.Column('value', sa.Float(), nullable=True),
    sa.Column('currency', sa.String(length=8), nullable=True),
    sa.Column('lost_reason', sa.Text(), nullable=True),
    sa.Column('add_time', sa.DateTime(timezone=True), nullable=True),
    sa.Column('update_time', sa.DateTime(timezone=True), nullable=True),
    sa.Column('stage_change_time', sa.DateTime(timezone=True), nullable=True),
    sa.Column('won_time', sa.DateTime(timezone=True), nullable=True),
    sa.Column('lost_time', sa.DateTime(timezone=True), nullable=True),
    sa.Column('close_time', sa.DateTime(timezone=True), nullable=True),
    sa.Column('is_archived', sa.Boolean(), nullable=False),
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('custom_fields', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('raw', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('fetched_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('changelog_update_time', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_pd_deals_add_time'), 'pd_deals', ['add_time'], unique=False)
    op.create_index(op.f('ix_pd_deals_channel'), 'pd_deals', ['channel'], unique=False)
    op.create_index(op.f('ix_pd_deals_person_id'), 'pd_deals', ['person_id'], unique=False)
    op.create_index(op.f('ix_pd_deals_pipeline_id'), 'pd_deals', ['pipeline_id'], unique=False)
    op.create_index(op.f('ix_pd_deals_stage_id'), 'pd_deals', ['stage_id'], unique=False)
    op.create_index(op.f('ix_pd_deals_status'), 'pd_deals', ['status'], unique=False)
    op.create_table('pd_import_runs',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('mode', sa.String(length=16), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('updated_since', sa.DateTime(timezone=True), nullable=True),
    sa.Column('counts', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=True),
    sa.Column('error', sa.Text(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_pd_import_runs_started_at'), 'pd_import_runs', ['started_at'], unique=False)
    op.create_index(op.f('ix_pd_import_runs_status'), 'pd_import_runs', ['status'], unique=False)
    op.create_table('pd_persons',
    sa.Column('id', sa.Integer(), autoincrement=False, nullable=False),
    sa.Column('name', sa.String(length=512), nullable=True),
    sa.Column('first_name', sa.String(length=255), nullable=True),
    sa.Column('last_name', sa.String(length=255), nullable=True),
    sa.Column('emails', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('phones', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('org_id', sa.Integer(), nullable=True),
    sa.Column('owner_id', sa.Integer(), nullable=True),
    sa.Column('label_ids', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('custom_fields', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('add_time', sa.DateTime(timezone=True), nullable=True),
    sa.Column('update_time', sa.DateTime(timezone=True), nullable=True),
    sa.Column('raw', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('fetched_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('pd_pipelines',
    sa.Column('id', sa.Integer(), autoincrement=False, nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('order_nr', sa.Integer(), nullable=True),
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('add_time', sa.DateTime(timezone=True), nullable=True),
    sa.Column('update_time', sa.DateTime(timezone=True), nullable=True),
    sa.Column('raw', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('fetched_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('pd_stages',
    sa.Column('id', sa.Integer(), autoincrement=False, nullable=False),
    sa.Column('pipeline_id', sa.Integer(), nullable=True),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('order_nr', sa.Integer(), nullable=True),
    sa.Column('deal_probability', sa.Integer(), nullable=True),
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('add_time', sa.DateTime(timezone=True), nullable=True),
    sa.Column('update_time', sa.DateTime(timezone=True), nullable=True),
    sa.Column('raw', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('fetched_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_pd_stages_pipeline_id'), 'pd_stages', ['pipeline_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_pd_stages_pipeline_id'), table_name='pd_stages')
    op.drop_table('pd_stages')
    op.drop_table('pd_pipelines')
    op.drop_table('pd_persons')
    op.drop_index(op.f('ix_pd_import_runs_status'), table_name='pd_import_runs')
    op.drop_index(op.f('ix_pd_import_runs_started_at'), table_name='pd_import_runs')
    op.drop_table('pd_import_runs')
    op.drop_index(op.f('ix_pd_deals_status'), table_name='pd_deals')
    op.drop_index(op.f('ix_pd_deals_stage_id'), table_name='pd_deals')
    op.drop_index(op.f('ix_pd_deals_pipeline_id'), table_name='pd_deals')
    op.drop_index(op.f('ix_pd_deals_person_id'), table_name='pd_deals')
    op.drop_index(op.f('ix_pd_deals_channel'), table_name='pd_deals')
    op.drop_index(op.f('ix_pd_deals_add_time'), table_name='pd_deals')
    op.drop_table('pd_deals')
    op.drop_table('pd_deal_stage_history')
    op.drop_table('pd_deal_fields')
    op.drop_index(op.f('ix_pd_deal_changes_field_key'), table_name='pd_deal_changes')
    op.drop_index(op.f('ix_pd_deal_changes_deal_id'), table_name='pd_deal_changes')
    op.drop_table('pd_deal_changes')
