from .base import Base, new_id
from sqlalchemy import String, Integer, Boolean, ForeignKey, JSON, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column

class Service(Base):
    __tablename__ = 'services'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    label: Mapped[str] = mapped_column(String(80))
    provider: Mapped[str] = mapped_column(String(16))
    base_url: Mapped[str] = mapped_column(String(512))
    model: Mapped[str] = mapped_column(String(120))
    max_output_tokens: Mapped[int] = mapped_column(Integer)
    capabilities: Mapped[list] = mapped_column(JSON)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    key_id: Mapped[str] = mapped_column(String(32))
    iv: Mapped[bytes] = mapped_column(LargeBinary)
    ciphertext: Mapped[bytes] = mapped_column(LargeBinary)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)

class Operation(Base):
    __tablename__ = 'operations'
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), primary_key=True)
    scope: Mapped[str] = mapped_column(String(100), primary_key=True)
    key: Mapped[str] = mapped_column(String(36), primary_key=True)
    payload_hash: Mapped[str] = mapped_column(String(64))
    response: Mapped[dict | None] = mapped_column(JSON, nullable=True)
