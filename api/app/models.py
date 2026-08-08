import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

# JSONB on Postgres (indexable with GIN if attribution reporting grows);
# plain JSON on SQLite in tests.
JsonCol = JSON().with_variant(JSONB(), "postgresql")


def _new_id() -> str:
    return str(uuid.uuid4())


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    form: Mapped[str] = mapped_column(String(20))  # contact | newsletter

    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(320), index=True)
    phone: Mapped[str | None] = mapped_column(String(50))
    message: Mapped[str | None] = mapped_column(Text)
    fields: Mapped[list] = mapped_column(JsonCol, default=list)
    newsletter_opt_in: Mapped[bool] = mapped_column(Boolean, default=False)

    page: Mapped[str | None] = mapped_column(String(512))
    attribution: Mapped[dict | None] = mapped_column(JsonCol)
    first_touch: Mapped[dict | None] = mapped_column(JsonCol)
    ga_client_id: Mapped[str | None] = mapped_column(String(64))
    ga_session_id: Mapped[str | None] = mapped_column(String(64))
    client_ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(512))

    spam_flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    spam_reasons: Mapped[list] = mapped_column(JsonCol, default=list)

    # pending | synced | failed | skipped_spam | disabled
    sync_status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    sync_error: Mapped[str | None] = mapped_column(Text)
    pipedrive_person_id: Mapped[int | None] = mapped_column(Integer)
    pipedrive_lead_id: Mapped[str | None] = mapped_column(String(64))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
