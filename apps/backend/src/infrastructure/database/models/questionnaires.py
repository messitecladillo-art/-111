from .base import Base, now, new_id
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, ForeignKeyConstraint, UniqueConstraint, CheckConstraint, JSON
from sqlalchemy.orm import Mapped, mapped_column

class Version(Base):
    __tablename__ = 'questionnaire_versions'
    __table_args__ = (UniqueConstraint('project_id', 'revision'), UniqueConstraint('project_id', 'id'))
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey('projects.id'), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    created_by: Mapped[str] = mapped_column(ForeignKey('users.id'))
    design: Mapped[dict] = mapped_column(JSON)
    design_hash: Mapped[str] = mapped_column(String(64))
    source_proposal_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

class QuestionnaireTopicBinding(Base):
    """Immutable, version-owned provenance; questionnaire-design/v1 stays unchanged."""
    __tablename__ = 'questionnaire_topic_bindings'
    __table_args__ = (UniqueConstraint('project_id', 'version_id'), ForeignKeyConstraint(('project_id', 'version_id'), ('questionnaire_versions.project_id', 'questionnaire_versions.id')), ForeignKeyConstraint(('project_id', 'parent_version_id'), ('questionnaire_versions.project_id', 'questionnaire_versions.id')), ForeignKeyConstraint(('project_id', 'origin_version_id'), ('questionnaire_versions.project_id', 'questionnaire_versions.id')), CheckConstraint("operation_kind IN ('edit','apply','restore')"), CheckConstraint('(binding IS NULL AND binding_hash IS NULL) OR (binding IS NOT NULL AND binding_hash IS NOT NULL)'))
    version_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey('projects.id'), index=True)
    parent_version_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    origin_version_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    operation_kind: Mapped[str] = mapped_column(String(16))
    binding: Mapped[dict | None] = mapped_column(JSON(none_as_null=True), nullable=True)
    binding_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    design_transfer_hash: Mapped[str] = mapped_column(String(64))
    audit: Mapped[dict] = mapped_column(JSON)
    created_by: Mapped[str] = mapped_column(ForeignKey('users.id'))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

class QuestionnaireTopicBindingSource(Base):
    __tablename__ = 'questionnaire_topic_binding_sources'
    __table_args__ = (ForeignKeyConstraint(('project_id', 'version_id'), ('questionnaire_topic_bindings.project_id', 'questionnaire_topic_bindings.version_id')), ForeignKeyConstraint(('project_id', 'source_version_id', 'source_content_hash'), ('topic_project_versions.project_id', 'topic_project_versions.id', 'topic_project_versions.content_hash')))
    version_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    source_version_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey('projects.id'), index=True)
    source_content_hash: Mapped[str] = mapped_column(String(64))
    created_by: Mapped[str] = mapped_column(ForeignKey('users.id'))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

class Proposal(Base):
    __tablename__ = 'proposals'
    __table_args__ = (UniqueConstraint('user_id', 'project_id', 'idempotency_key'),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    project_id: Mapped[str] = mapped_column(ForeignKey('projects.id'), index=True)
    service_id: Mapped[str] = mapped_column(ForeignKey('services.id'))
    service_revision: Mapped[int] = mapped_column(Integer)
    input_revision: Mapped[int] = mapped_column(Integer)
    idempotency_key: Mapped[str] = mapped_column(String(36))
    payload_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(24), default='running')
    design: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
