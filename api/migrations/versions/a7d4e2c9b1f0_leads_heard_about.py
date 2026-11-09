"""leads: heard_about

The contact form asks "Where did you hear about us?"; the answer key is kept
on the lead (see app.schemas.HeardAbout) and repeated in the Pipedrive note.

Revision ID: a7d4e2c9b1f0
Revises: f3a9c1d2e4b5
Create Date: 2026-11-09 12:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a7d4e2c9b1f0'
down_revision: str | Sequence[str] | None = 'f3a9c1d2e4b5'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('leads') as batch:
        batch.add_column(sa.Column('heard_about', sa.String(length=30), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('leads') as batch:
        batch.drop_column('heard_about')
