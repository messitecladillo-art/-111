from .base import Base, now, new_id
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, CheckConstraint, JSON
from sqlalchemy.orm import Mapped, mapped_column

class AgentTask(Base):
    """Durable, project-scoped orchestration checkpoint (artifact bytes live elsewhere)."""
    __tablename__ = 'agent_tasks'
    __table_args__ = (CheckConstraint("status IN ('ready','running','needs_input','blocked','completed','failed')"), CheckConstraint('revision >= 0'))
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey('projects.id'), index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey('users.id'))
    task_type: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(24), default='ready')
    state: Mapped[dict] = mapped_column(JSON)
    revision: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
