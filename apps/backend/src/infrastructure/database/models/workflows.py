from .base import Base, now, new_id
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, CheckConstraint, UniqueConstraint, JSON
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


class AgentTaskExecution(Base):
    """One committed dispatch receipt. No prompts, credentials or result bodies."""
    __tablename__ = 'agent_task_executions'
    __table_args__ = (
        UniqueConstraint('task_id', 'base_revision'),
        CheckConstraint("status IN ('running','completed','failed','outcome_unknown','cancelled','discarded')"),
        CheckConstraint('base_revision >= 0 AND claimed_revision = base_revision + 1'),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    task_id: Mapped[str] = mapped_column(ForeignKey('agent_tasks.id'), index=True)
    project_id: Mapped[str] = mapped_column(ForeignKey('projects.id'))
    created_by: Mapped[str] = mapped_column(ForeignKey('users.id'))
    base_revision: Mapped[int] = mapped_column(Integer)
    claimed_revision: Mapped[int] = mapped_column(Integer)
    role: Mapped[str] = mapped_column(String(24))
    status: Mapped[str] = mapped_column(String(24), default='running')
    input_hash: Mapped[str] = mapped_column(String(64))
    result_hash: Mapped[str | None] = mapped_column(String(64))
    error_code: Mapped[str | None] = mapped_column(String(48))
    lease_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
