from .base import Base, now, new_id
from datetime import datetime
from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, CheckConstraint, UniqueConstraint, Index, JSON
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


class AutonomousRun(Base):
    """Durable project-scoped autonomous empirical research execution and checkpoint."""
    __tablename__ = 'autonomous_runs'
    __table_args__ = (
        UniqueConstraint('created_by', 'project_id', 'idempotency_key'),
        CheckConstraint("status IN ('running','awaiting_milestone','completed','failed','cancelled')"),
        CheckConstraint("lease_mode IN ('pi_autonomous','milestone_gated')"),
        CheckConstraint('budget_cap BETWEEN 8 AND 64'),
        CheckConstraint('used_calls >= 0'),
        CheckConstraint('revision >= 0'),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey('projects.id'), index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey('users.id'))
    idempotency_key: Mapped[str] = mapped_column(String(36))
    status: Mapped[str] = mapped_column(String(24), default='running')
    lease_mode: Mapped[str] = mapped_column(String(24), default='pi_autonomous')
    dataset_mode: Mapped[str] = mapped_column(String(32))
    goal: Mapped[str] = mapped_column(Text)
    geography: Mapped[str] = mapped_column(String(120), default='')
    budget_cap: Mapped[int] = mapped_column(Integer)
    used_calls: Mapped[int] = mapped_column(Integer, default=0)
    dataset_ref: Mapped[str] = mapped_column(String(120), default='')
    dataset_sha256: Mapped[str] = mapped_column(String(64), default='')
    checkpoint_json: Mapped[dict] = mapped_column(JSON)
    epistemic_graph_json: Mapped[dict] = mapped_column(JSON)
    revision: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AutonomousRunEvent(Base):
    """Ordered incremental SSE event log for durable replay via Last-Event-ID."""
    __tablename__ = 'autonomous_run_events'
    __table_args__ = (
        UniqueConstraint('run_id', 'seq'),
        Index('ix_autonomous_run_events_run_seq', 'run_id', 'seq'),
        CheckConstraint('seq >= 1'),
        CheckConstraint("event_type IN ('run_started','thought','tool_start','tool_result','pivot','milestone_pause','steering','reviewer_critique','reanalysis','memory_recalled','completed','cancelled','error')"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(ForeignKey('autonomous_runs.id', ondelete='CASCADE'))
    project_id: Mapped[str] = mapped_column(ForeignKey('projects.id'))
    created_by: Mapped[str] = mapped_column(ForeignKey('users.id'))
    seq: Mapped[int] = mapped_column(Integer)
    event_type: Mapped[str] = mapped_column(String(32))
    payload_json: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ProjectEpistemicMemory(Base):
    """Cross-run project-scoped epistemic findings, cleaning rules, preferences, and evidence gaps."""
    __tablename__ = 'project_epistemic_memory'
    __table_args__ = (
        UniqueConstraint('project_id', 'memory_key'),
        CheckConstraint("kind IN ('hypothesis','cleaning_rule','mother_insight','preference','refuted_claim','evidence_gap')"),
        CheckConstraint("status IN ('active','pivoted','refuted','resolved')"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey('projects.id'), index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey('users.id'))
    run_id: Mapped[str | None] = mapped_column(ForeignKey('autonomous_runs.id', ondelete='SET NULL'), nullable=True)
    memory_key: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(24))
    summary: Mapped[str] = mapped_column(Text)
    snapshot_refs: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
