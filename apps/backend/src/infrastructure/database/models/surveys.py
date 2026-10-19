from .base import Base, now, new_id
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, UniqueConstraint, JSON
from sqlalchemy.orm import Mapped, mapped_column

class SiliconRun(Base):
    """A model-backed 硅基样本 run. Responses are simulated answers from fictional personas, never survey data."""
    __tablename__ = 'silicon_runs'
    __table_args__ = (UniqueConstraint('user_id', 'project_id', 'idempotency_key'),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    project_id: Mapped[str] = mapped_column(ForeignKey('projects.id'), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(36))
    payload_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(24), default='running')
    services: Mapped[list] = mapped_column(JSON)
    plan: Mapped[dict] = mapped_column(JSON)
    total: Mapped[int] = mapped_column(Integer)
    done: Mapped[int] = mapped_column(Integer, default=0)
    responses: Mapped[list] = mapped_column(JSON)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

class SurveyRelease(Base):
    """Immutable instrument snapshot; only collection state and bounded counters can advance."""
    __tablename__ = 'survey_releases'
    __table_args__ = (UniqueConstraint('project_id', 'version_id'),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey('projects.id'), index=True)
    version_id: Mapped[str] = mapped_column(ForeignKey('questionnaire_versions.id'))
    questionnaire_revision: Mapped[int] = mapped_column(Integer)
    token: Mapped[str] = mapped_column(String(43), unique=True)
    public_design: Mapped[dict] = mapped_column(JSON)
    classification: Mapped[str] = mapped_column(String(16))
    revision: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(16), default='open')
    response_count: Mapped[int] = mapped_column(Integer, default=0)
    response_bytes: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

class SurveyResponse(Base):
    __tablename__ = 'survey_responses'
    __table_args__ = (UniqueConstraint('release_id', 'idempotency_key'),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    release_id: Mapped[str] = mapped_column(ForeignKey('survey_releases.id'), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(36))
    payload_hash: Mapped[str] = mapped_column(String(64))
    answers: Mapped[dict] = mapped_column(JSON)
    visibility: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
