from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, new_id, now


class ProjectMemoryVersion(Base):
    """One confirmed version of a project's memory document; history is immutable."""

    __tablename__ = "project_memory_versions"
    __table_args__ = (
        UniqueConstraint("project_id", "revision"),
        UniqueConstraint("project_id", "id", "content_hash"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    document: Mapped[dict] = mapped_column(JSON)
    content_hash: Mapped[str] = mapped_column(String(64))
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    change_note: Mapped[str] = mapped_column(String(500), default="")
