"""marketing events

Events the dashboard's Events page lists: entered by hand (name, date, type,
cost, attendees) with the Pipedrive signals that identify their records, so
enquiries and qualified opportunities per event come from the mirror.

Revision ID: e7a2b4c6d8f0
Revises: d6f1a3b7c8e9
Create Date: 2026-11-12 16:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e7a2b4c6d8f0'
down_revision: str | Sequence[str] | None = 'd6f1a3b7c8e9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'marketing_events',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('type', sa.String(length=20), nullable=False),
        sa.Column('cost_gbp', sa.Float(), nullable=True),
        sa.Column('attendees', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('match', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('marketing_events')
