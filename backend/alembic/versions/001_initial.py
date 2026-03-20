"""Initial migration — all tables

Revision ID: 001
Revises:
Create Date: 2026-03-20
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("is_admin", sa.Boolean(), server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # Prospect enums
    prospect_source = postgresql.ENUM(
        "google_maps", "pages_jaunes", "sirene", "linkedin", "manual",
        name="prospectsource"
    )
    prospect_source.create(op.get_bind())

    prospect_status = postgresql.ENUM(
        "new", "contacted", "interested", "demo", "won", "lost",
        name="prospectstatus"
    )
    prospect_status.create(op.get_bind())

    # Prospects
    op.create_table(
        "prospects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("siret", sa.String(14), unique=True, nullable=True),
        sa.Column("raison_sociale", sa.String(255), nullable=False),
        sa.Column("nom_commercial", sa.String(255), nullable=True),
        sa.Column("adresse", sa.String(500), nullable=True),
        sa.Column("code_postal", sa.String(10), nullable=True),
        sa.Column("ville", sa.String(150), nullable=True),
        sa.Column("lat", sa.Float(), nullable=True),
        sa.Column("lng", sa.Float(), nullable=True),
        sa.Column("tel", sa.String(30), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("email_verified", sa.Boolean(), server_default="false"),
        sa.Column("unsubscribed", sa.Boolean(), server_default="false"),
        sa.Column("site_web", sa.String(500), nullable=True),
        sa.Column("linkedin_url", sa.String(500), nullable=True),
        sa.Column("code_naf", sa.String(10), nullable=True),
        sa.Column("effectif", sa.Integer(), nullable=True),
        sa.Column("date_creation", sa.DateTime(timezone=True), nullable=True),
        sa.Column("contact_prenom", sa.String(100), nullable=True),
        sa.Column("contact_nom", sa.String(100), nullable=True),
        sa.Column("contact_titre", sa.String(200), nullable=True),
        sa.Column("icp_score", sa.Integer(), server_default="0"),
        sa.Column("source", postgresql.ENUM("google_maps", "pages_jaunes", "sirene", "linkedin", "manual", name="prospectsource", create_type=False), nullable=False, server_default="manual"),
        sa.Column("status", postgresql.ENUM("new", "contacted", "interested", "demo", "won", "lost", name="prospectstatus", create_type=False), nullable=False, server_default="new"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("tags", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("last_contacted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("odoo_partner_id", sa.Integer(), nullable=True),
        sa.Column("google_place_id", sa.String(255), nullable=True),
        sa.Column("google_rating", sa.Float(), nullable=True),
        sa.Column("assigned_to", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_prospects_siret", "prospects", ["siret"])
    op.create_index("ix_prospects_raison_sociale", "prospects", ["raison_sociale"])
    op.create_index("ix_prospects_ville", "prospects", ["ville"])
    op.create_index("ix_prospects_code_naf", "prospects", ["code_naf"])
    op.create_index("ix_prospects_status", "prospects", ["status"])

    # Sequences
    op.create_table(
        "sequences",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("trigger_status", sa.String(50), nullable=True),
        sa.Column("steps", postgresql.JSON(), server_default="[]"),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Email templates
    op.create_table(
        "email_templates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), unique=True, nullable=False),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("body_html", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Sequence enrollments
    op.create_table(
        "sequence_enrollments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("prospect_id", sa.Integer(), sa.ForeignKey("prospects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sequence_id", sa.Integer(), sa.ForeignKey("sequences.id", ondelete="CASCADE"), nullable=False),
        sa.Column("current_step", sa.Integer(), server_default="0"),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("enrolled_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("last_step_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Enrichment logs
    op.create_table(
        "prospect_enrichment_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("prospect_id", sa.Integer(), sa.ForeignKey("prospects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source", sa.String(100), nullable=False),
        sa.Column("field_updated", sa.String(100), nullable=False),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Outreach logs
    op.create_table(
        "outreach_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("prospect_id", sa.Integer(), sa.ForeignKey("prospects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sequence_id", sa.Integer(), sa.ForeignKey("sequences.id"), nullable=True),
        sa.Column("step_index", sa.Integer(), nullable=True),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("template_name", sa.String(255), nullable=True),
        sa.Column("tracking_id", sa.String(255), unique=True, nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("clicked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("replied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("unsubscribed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Prospect actions (timeline)
    op.create_table(
        "prospect_actions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("prospect_id", sa.Integer(), sa.ForeignKey("prospects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action_type", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("prospect_actions")
    op.drop_table("outreach_logs")
    op.drop_table("prospect_enrichment_logs")
    op.drop_table("sequence_enrollments")
    op.drop_table("email_templates")
    op.drop_table("sequences")
    op.drop_table("prospects")

    postgresql.ENUM(name="prospectstatus").drop(op.get_bind())
    postgresql.ENUM(name="prospectsource").drop(op.get_bind())

    op.drop_table("users")
