"""pipedrive mirror: organisations

pd_organizations holds Pipedrive's organisations (id, name, owner), so the
dashboard's qualified-opportunities list can name each deal's company.

Revision ID: b2c4d6e8f0a1
Revises: e7a2b4c6d8f0
Create Date: 2026-11-24 18:30:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b2c4d6e8f0a1'
down_revision: str | Sequence[str] | None = 'e7a2b4c6d8f0'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'pd_organizations',
        sa.Column('id', sa.Integer(), autoincrement=False, nullable=False),
        sa.Column('name', sa.String(length=512), nullable=True),
        sa.Column('owner_id', sa.Integer(), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('add_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('update_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('raw', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
        sa.Column('fetched_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('pd_organizations')
