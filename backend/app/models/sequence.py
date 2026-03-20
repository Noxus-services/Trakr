import enum
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Text, JSON, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.core.database import Base


class StepType(str, enum.Enum):
    email = "email"
    task = "task"
    call = "call"


class Sequence(Base):
    __tablename__ = "sequences"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    trigger_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    steps: Mapped[list] = mapped_column(JSON, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    enrollments = relationship("SequenceEnrollment", back_populates="sequence", cascade="all, delete-orphan")


class SequenceEnrollment(Base):
    """Tracks which prospect is enrolled in which sequence."""
    __tablename__ = "sequence_enrollments"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    prospect_id: Mapped[int] = mapped_column(ForeignKey("prospects.id", ondelete="CASCADE"), nullable=False)
    sequence_id: Mapped[int] = mapped_column(ForeignKey("sequences.id", ondelete="CASCADE"), nullable=False)
    current_step: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    enrolled_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_step_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    prospect = relationship("Prospect", back_populates="sequence_enrollments")
    sequence = relationship("Sequence", back_populates="enrollments")


class EmailTemplate(Base):
    __tablename__ = "email_templates"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    body_html: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
