import enum
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Text, Float, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.core.database import Base


class ProspectEnrichmentLog(Base):
    __tablename__ = "prospect_enrichment_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    prospect_id: Mapped[int] = mapped_column(ForeignKey("prospects.id", ondelete="CASCADE"), nullable=False)
    source: Mapped[str] = mapped_column(String(100), nullable=False)  # hunter, dropcontact, dns_check
    field_updated: Mapped[str] = mapped_column(String(100), nullable=False)
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    timestamp: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    prospect = relationship("Prospect", back_populates="enrichment_logs")


class OutreachLog(Base):
    __tablename__ = "outreach_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    prospect_id: Mapped[int] = mapped_column(ForeignKey("prospects.id", ondelete="CASCADE"), nullable=False)
    sequence_id: Mapped[int | None] = mapped_column(ForeignKey("sequences.id"), nullable=True)
    step_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)  # email, task, call
    template_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tracking_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    sent_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    opened_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    clicked_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    replied_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    unsubscribed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    prospect = relationship("Prospect", back_populates="outreach_logs")


class ProspectAction(Base):
    """Timeline of manual CRM actions."""
    __tablename__ = "prospect_actions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    prospect_id: Mapped[int] = mapped_column(ForeignKey("prospects.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action_type: Mapped[str] = mapped_column(String(100), nullable=False)  # call, note, demo_scheduled, status_change
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    scheduled_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    prospect = relationship("Prospect", back_populates="actions")
