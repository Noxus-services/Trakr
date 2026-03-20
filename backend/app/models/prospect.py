import enum
from sqlalchemy import (
    String, Integer, Float, Boolean, Text, DateTime, ForeignKey, Enum, ARRAY
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.core.database import Base


class ProspectSource(str, enum.Enum):
    google_maps = "google_maps"
    pages_jaunes = "pages_jaunes"
    sirene = "sirene"
    linkedin = "linkedin"
    manual = "manual"


class ProspectStatus(str, enum.Enum):
    new = "new"
    contacted = "contacted"
    interested = "interested"
    demo = "demo"
    won = "won"
    lost = "lost"


class Prospect(Base):
    __tablename__ = "prospects"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Identification légale
    siret: Mapped[str | None] = mapped_column(String(14), unique=True, nullable=True, index=True)
    raison_sociale: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    nom_commercial: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Localisation
    adresse: Mapped[str | None] = mapped_column(String(500), nullable=True)
    code_postal: Mapped[str | None] = mapped_column(String(10), nullable=True)
    ville: Mapped[str | None] = mapped_column(String(150), nullable=True, index=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Contact
    tel: Mapped[str | None] = mapped_column(String(30), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    unsubscribed: Mapped[bool] = mapped_column(Boolean, default=False)
    site_web: Mapped[str | None] = mapped_column(String(500), nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Entreprise
    code_naf: Mapped[str | None] = mapped_column(String(10), nullable=True, index=True)
    effectif: Mapped[int | None] = mapped_column(Integer, nullable=True)
    date_creation: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Contact person (from LinkedIn / enrichment)
    contact_prenom: Mapped[str | None] = mapped_column(String(100), nullable=True)
    contact_nom: Mapped[str | None] = mapped_column(String(100), nullable=True)
    contact_titre: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Scoring & pipeline
    icp_score: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[ProspectSource] = mapped_column(
        Enum(ProspectSource), default=ProspectSource.manual, nullable=False
    )
    status: Mapped[ProspectStatus] = mapped_column(
        Enum(ProspectStatus), default=ProspectStatus.new, nullable=False, index=True
    )

    # CRM data
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True, default=list)
    last_contacted_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Odoo sync
    odoo_partner_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Google Places extra
    google_place_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    google_rating: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Meta
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    assignee = relationship("User", back_populates="prospects")
    enrichment_logs = relationship("ProspectEnrichmentLog", back_populates="prospect", cascade="all, delete-orphan")
    outreach_logs = relationship("OutreachLog", back_populates="prospect", cascade="all, delete-orphan")
    actions = relationship("ProspectAction", back_populates="prospect", cascade="all, delete-orphan")
    sequence_enrollments = relationship("SequenceEnrollment", back_populates="prospect", cascade="all, delete-orphan")
