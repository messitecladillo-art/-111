from .base import Base, now, new_id
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

class Team(Base):
    __tablename__ = 'teams'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120))

class Member(Base):
    __tablename__ = 'memberships'
    team_id: Mapped[str] = mapped_column(ForeignKey('teams.id'), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), primary_key=True)
    role: Mapped[str] = mapped_column(String(16))

class Project(Base):
    __tablename__ = 'projects'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    team_id: Mapped[str] = mapped_column(ForeignKey('teams.id'), index=True)
    title: Mapped[str] = mapped_column(String(160))
    revision: Mapped[int] = mapped_column(Integer, default=1)
    questionnaire_revision: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
