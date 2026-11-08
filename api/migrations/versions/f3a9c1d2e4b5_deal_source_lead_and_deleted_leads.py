"""pipedrive mirror: deal source lead, deleted leads

pd_deals gains source_lead_id (the lead a deal was converted from, which
Pipedrive deletes on conversion) and pd_leads gains is_deleted, set by a full
import for leads Pipedrive no longer lists.

Revision ID: f3a9c1d2e4b5
Revises: bcddcdb81d48
Create Date: 2026-11-08 12:10:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f3a9c1d2e4b5'
down_revision: str | Sequence[str] | None = 'bcddcdb81d48'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('pd_deals') as batch:
        batch.add_column(sa.Column('source_lead_id', sa.String(length=36), nullable=True))
        batch.create_index(op.f('ix_pd_deals_source_lead_id'), ['source_lead_id'], unique=False)
    with op.batch_alter_table('pd_leads') as batch:
        batch.add_column(sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('pd_leads') as batch:
        batch.drop_column('is_deleted')
    with op.batch_alter_table('pd_deals') as batch:
        batch.drop_index(op.f('ix_pd_deals_source_lead_id'))
        batch.drop_column('source_lead_id')
