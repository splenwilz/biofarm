"""leads: heard_about_other

When "Where did you hear about us?" is answered "Other", the contact form shows
a text box; what they type is kept here and repeated in the Pipedrive note.

Revision ID: b8e5f3d1c2a7
Revises: a7d4e2c9b1f0
Create Date: 2026-11-09 14:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b8e5f3d1c2a7'
down_revision: str | Sequence[str] | None = 'a7d4e2c9b1f0'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('leads') as batch:
        batch.add_column(sa.Column('heard_about_other', sa.String(length=200), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('leads') as batch:
        batch.drop_column('heard_about_other')
