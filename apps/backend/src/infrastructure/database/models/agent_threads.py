from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, new_id, now


class AgentThreadSnapshot(Base):
    """An explicit, owner-only backup of one project-bound agent thread."""

    __tablename__ = "agent_thread_snapshots"
    __table_args__ = (UniqueConstraint("project_id", "owner_id", "client_thread_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    client_thread_id: Mapped[str] = mapped_column(String(36))
    revision: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(80))
    messages: Mapped[list] = mapped_column(JSON)
    events: Mapped[list] = mapped_column(JSON)
    checkpoint: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    content_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
