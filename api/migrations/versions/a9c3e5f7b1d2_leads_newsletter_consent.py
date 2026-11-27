"""leads: how and when the newsletter question was answered

Soft opt-in from 26 Nov 2026: the enquiry forms subscribe a visitor unless
they tick "I'd prefer not to receive these updates". The basis of each answer
("opt_in", "soft_opt_in", "declined", or NULL when the form never asked) and
the date of an opt-in are kept on the lead, so the record outlives the form.

Revision ID: a9c3e5f7b1d2
Revises: b2c4d6e8f0a1
Create Date: 2026-11-26 10:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a9c3e5f7b1d2'
down_revision: str | Sequence[str] | None = 'b2c4d6e8f0a1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('leads') as batch:
        batch.add_column(sa.Column('newsletter_consent_basis', sa.String(length=20), nullable=True))
        batch.add_column(sa.Column('newsletter_consent_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('leads') as batch:
        batch.drop_column('newsletter_consent_at')
        batch.drop_column('newsletter_consent_basis')
