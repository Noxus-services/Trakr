from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.sequence import Sequence, SequenceEnrollment, EmailTemplate
from app.models.log import OutreachLog

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class SequenceCreate(BaseModel):
    name: str
    trigger_status: Optional[str] = None
    steps: list = []


class SequenceOut(BaseModel):
    id: int
    name: str
    trigger_status: Optional[str]
    steps: list
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TemplateCreate(BaseModel):
    name: str
    subject: str
    body_html: str


class TemplateOut(BaseModel):
    id: int
    name: str
    subject: str
    body_html: str
    created_at: datetime

    model_config = {"from_attributes": True}


class EnrollRequest(BaseModel):
    sequence_id: int


class OutreachLogOut(BaseModel):
    id: int
    prospect_id: int
    sequence_id: Optional[int]
    step_index: Optional[int]
    type: str
    template_name: Optional[str]
    sent_at: Optional[datetime]
    opened_at: Optional[datetime]
    clicked_at: Optional[datetime]
    replied_at: Optional[datetime]
    unsubscribed_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ── Sequences ─────────────────────────────────────────────────────────────────

@router.get("/sequences", response_model=List[SequenceOut])
async def list_sequences(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Sequence).order_by(Sequence.created_at.desc()))
    return result.scalars().all()


@router.post("/sequences", response_model=SequenceOut, status_code=201)
async def create_sequence(
    data: SequenceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    seq = Sequence(**data.model_dump(), created_by=current_user.id)
    db.add(seq)
    await db.flush()
    await db.refresh(seq)
    return seq


@router.patch("/sequences/{seq_id}", response_model=SequenceOut)
async def update_sequence(
    seq_id: int,
    data: SequenceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Sequence).where(Sequence.id == seq_id))
    seq = result.scalar_one_or_none()
    if not seq:
        raise HTTPException(404, "Séquence non trouvée")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(seq, k, v)
    await db.flush()
    await db.refresh(seq)
    return seq


@router.delete("/sequences/{seq_id}", status_code=204)
async def delete_sequence(
    seq_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Sequence).where(Sequence.id == seq_id))
    seq = result.scalar_one_or_none()
    if not seq:
        raise HTTPException(404, "Séquence non trouvée")
    await db.delete(seq)


# ── Templates ─────────────────────────────────────────────────────────────────

@router.get("/templates", response_model=List[TemplateOut])
async def list_templates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(EmailTemplate))
    return result.scalars().all()


@router.post("/templates", response_model=TemplateOut, status_code=201)
async def create_template(
    data: TemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tpl = EmailTemplate(**data.model_dump())
    db.add(tpl)
    await db.flush()
    await db.refresh(tpl)
    return tpl


# ── Enrollment ────────────────────────────────────────────────────────────────

@router.post("/prospects/{prospect_id}/enroll", status_code=201)
async def enroll_prospect(
    prospect_id: int,
    data: EnrollRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    enrollment = SequenceEnrollment(
        prospect_id=prospect_id,
        sequence_id=data.sequence_id,
        current_step=0,
        is_active=True,
    )
    db.add(enrollment)
    await db.flush()
    return {"message": "Prospect inscrit dans la séquence", "enrollment_id": enrollment.id}


@router.get("/prospects/{prospect_id}/logs", response_model=List[OutreachLogOut])
async def prospect_outreach_logs(
    prospect_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(OutreachLog)
        .where(OutreachLog.prospect_id == prospect_id)
        .order_by(OutreachLog.created_at.desc())
    )
    return result.scalars().all()


# ── Tracking (no auth needed) ─────────────────────────────────────────────────

@router.get("/track/open/{tracking_id}")
async def track_open(tracking_id: str, db: AsyncSession = Depends(get_db)):
    """1×1 pixel open tracking."""
    result = await db.execute(select(OutreachLog).where(OutreachLog.tracking_id == tracking_id))
    log = result.scalar_one_or_none()
    if log and not log.opened_at:
        log.opened_at = datetime.now(timezone.utc)
        await db.flush()

    # Return a 1x1 transparent GIF
    from fastapi.responses import Response
    GIF = b"\x47\x49\x46\x38\x39\x61\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00\x21\xf9\x04\x00\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b"
    return Response(content=GIF, media_type="image/gif")


@router.get("/track/click/{tracking_id}")
async def track_click(tracking_id: str, redirect_url: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(OutreachLog).where(OutreachLog.tracking_id == tracking_id))
    log = result.scalar_one_or_none()
    if log and not log.clicked_at:
        log.clicked_at = datetime.now(timezone.utc)
        await db.flush()
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=redirect_url)


@router.get("/unsubscribe/{tracking_id}")
async def unsubscribe(tracking_id: str, db: AsyncSession = Depends(get_db)):
    from app.models.prospect import Prospect
    result = await db.execute(select(OutreachLog).where(OutreachLog.tracking_id == tracking_id))
    log = result.scalar_one_or_none()
    if log:
        log.unsubscribed_at = datetime.now(timezone.utc)
        prospect_result = await db.execute(select(Prospect).where(Prospect.id == log.prospect_id))
        p = prospect_result.scalar_one_or_none()
        if p:
            p.unsubscribed = True
        await db.flush()
    return {"message": "Vous avez été désinscrit avec succès."}
