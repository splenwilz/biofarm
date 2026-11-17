"""leads: the three developer questions

The contact and about forms ask a developer (or a consultant or ecologist
acting for one) for the unit deficit, the site location and when the units
are needed: the three facts the 9 Nov 2026 Sales and Land meeting agreed make
a developer lead qualified. Kept here and repeated in the Pipedrive note.

Revision ID: d6f1a3b7c8e9
Revises: c4d7e9f1a2b3
Create Date: 2026-11-12 12:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd6f1a3b7c8e9'
down_revision: str | Sequence[str] | None = 'c4d7e9f1a2b3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('leads') as batch:
        batch.add_column(sa.Column('units_needed', sa.String(length=100), nullable=True))
        batch.add_column(sa.Column('site_location', sa.String(length=200), nullable=True))
        batch.add_column(sa.Column('units_when', sa.String(length=20), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('leads') as batch:
        batch.drop_column('units_when')
        batch.drop_column('site_location')
        batch.drop_column('units_needed')
