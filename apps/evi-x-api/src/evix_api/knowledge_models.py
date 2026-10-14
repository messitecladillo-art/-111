"""Knowledge references are conceptual aids, separate from research evidence and Gates."""
from datetime import datetime
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, UniqueConstraint, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column
from .models import Base, now, new_id


class KnowledgeUserState(Base):
    __tablename__ = "knowledge_user_states"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    content: Mapped[dict] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class KnowledgeProjectState(Base):
    __tablename__ = "knowledge_project_states"
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, default=0)


class KnowledgeReference(Base):
    __tablename__ = "knowledge_references"
    __table_args__ = (UniqueConstraint("project_id", "entry_id", "entry_version"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    entry_id: Mapped[str] = mapped_column(String(100))
    entry_version: Mapped[int] = mapped_column(Integer)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)


class KnowledgeTermRequest(Base):
    __tablename__ = "knowledge_term_requests"
    __table_args__ = (UniqueConstraint("user_id", "idempotency_key"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(36))
    payload_hash: Mapped[str] = mapped_column(String(64))
    term: Mapped[str] = mapped_column(String(120))
    domain: Mapped[str] = mapped_column(String(60))
    note: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="submitted")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class KnowledgeLookup(Base):
    __tablename__ = "knowledge_lookups"
    __table_args__ = (UniqueConstraint("user_id", "idempotency_key"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(36))
    payload_hash: Mapped[str] = mapped_column(String(64))
    query: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(24), default="running")
    budget_month: Mapped[str] = mapped_column(String(7))
    budget_day: Mapped[str] = mapped_column(String(10))
    reserved_credits: Mapped[int] = mapped_column(Integer, default=1)
    actual_credits: Mapped[int | None] = mapped_column(Integer, nullable=True)
    results: Mapped[list] = mapped_column(JSON, default=list)
    provider_request_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class KnowledgeMonthlyBudget(Base):
    __tablename__ = "knowledge_monthly_budgets"
    month: Mapped[str] = mapped_column(String(7), primary_key=True)
    reserved: Mapped[int] = mapped_column(Integer, default=0)
    settled: Mapped[int] = mapped_column(Integer, default=0)
    blocked: Mapped[bool] = mapped_column(Boolean, default=False)


class KnowledgeDailyBudget(Base):
    __tablename__ = "knowledge_daily_budgets"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    day: Mapped[str] = mapped_column(String(10), primary_key=True)
    requests: Mapped[int] = mapped_column(Integer, default=0)
