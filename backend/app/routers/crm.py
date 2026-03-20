from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.prospect import Prospect, ProspectStatus, ProspectSource
from app.models.log import ProspectAction

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────

class ProspectOut(BaseModel):
    id: int
    siret: Optional[str]
    raison_sociale: str
    nom_commercial: Optional[str]
    adresse: Optional[str]
    code_postal: Optional[str]
    ville: Optional[str]
    lat: Optional[float]
    lng: Optional[float]
    tel: Optional[str]
    email: Optional[str]
    email_verified: bool
    unsubscribed: bool
    site_web: Optional[str]
    linkedin_url: Optional[str]
    code_naf: Optional[str]
    effectif: Optional[int]
    contact_prenom: Optional[str]
    contact_nom: Optional[str]
    contact_titre: Optional[str]
    icp_score: int
    source: str
    status: str
    notes: Optional[str]
    tags: Optional[List[str]]
    last_contacted_at: Optional[datetime]
    odoo_partner_id: Optional[int]
    google_rating: Optional[float]
    assigned_to: Optional[int]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProspectCreate(BaseModel):
    raison_sociale: str
    siret: Optional[str] = None
    nom_commercial: Optional[str] = None
    adresse: Optional[str] = None
    code_postal: Optional[str] = None
    ville: Optional[str] = None
    tel: Optional[str] = None
    email: Optional[str] = None
    site_web: Optional[str] = None
    code_naf: Optional[str] = None
    effectif: Optional[int] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    assigned_to: Optional[int] = None


class ProspectUpdate(BaseModel):
    raison_sociale: Optional[str] = None
    nom_commercial: Optional[str] = None
    adresse: Optional[str] = None
    code_postal: Optional[str] = None
    ville: Optional[str] = None
    tel: Optional[str] = None
    email: Optional[str] = None
    site_web: Optional[str] = None
    linkedin_url: Optional[str] = None
    code_naf: Optional[str] = None
    effectif: Optional[int] = None
    contact_prenom: Optional[str] = None
    contact_nom: Optional[str] = None
    contact_titre: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[ProspectStatus] = None
    assigned_to: Optional[int] = None


class StatusUpdate(BaseModel):
    status: ProspectStatus


class ActionCreate(BaseModel):
    action_type: str
    description: Optional[str] = None
    scheduled_at: Optional[datetime] = None


class ActionOut(BaseModel):
    id: int
    action_type: str
    description: Optional[str]
    scheduled_at: Optional[datetime]
    user_id: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/prospects", response_model=List[ProspectOut])
async def list_prospects(
    status: Optional[ProspectStatus] = None,
    source: Optional[ProspectSource] = None,
    code_naf: Optional[str] = None,
    ville: Optional[str] = None,
    icp_min: Optional[int] = Query(None, ge=0, le=100),
    assigned_to: Optional[int] = None,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(Prospect)
    if status:
        q = q.where(Prospect.status == status)
    if source:
        q = q.where(Prospect.source == source)
    if code_naf:
        q = q.where(Prospect.code_naf == code_naf)
    if ville:
        q = q.where(Prospect.ville.ilike(f"%{ville}%"))
    if icp_min is not None:
        q = q.where(Prospect.icp_score >= icp_min)
    if assigned_to:
        q = q.where(Prospect.assigned_to == assigned_to)
    if search:
        q = q.where(Prospect.raison_sociale.ilike(f"%{search}%"))
    q = q.order_by(Prospect.icp_score.desc()).offset(skip).limit(limit)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/prospects", response_model=ProspectOut, status_code=201)
async def create_prospect(
    data: ProspectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.scoring import compute_icp_score

    prospect = Prospect(**data.model_dump(exclude_none=True), source="manual", assigned_to=current_user.id)
    prospect.icp_score = compute_icp_score(prospect)
    db.add(prospect)
    await db.flush()
    await db.refresh(prospect)
    return prospect


@router.get("/prospects/{prospect_id}", response_model=ProspectOut)
async def get_prospect(
    prospect_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Prospect).where(Prospect.id == prospect_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Prospect non trouvé")
    return p


@router.patch("/prospects/{prospect_id}", response_model=ProspectOut)
async def update_prospect(
    prospect_id: int,
    data: ProspectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Prospect).where(Prospect.id == prospect_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Prospect non trouvé")

    update_data = data.model_dump(exclude_none=True)
    for k, v in update_data.items():
        setattr(p, k, v)

    from app.services.scoring import compute_icp_score
    p.icp_score = compute_icp_score(p)
    await db.flush()
    await db.refresh(p)
    return p


@router.delete("/prospects/{prospect_id}", status_code=204)
async def delete_prospect(
    prospect_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Prospect).where(Prospect.id == prospect_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Prospect non trouvé")
    await db.delete(p)


@router.patch("/prospects/{prospect_id}/status", response_model=ProspectOut)
async def update_status(
    prospect_id: int,
    data: StatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Prospect).where(Prospect.id == prospect_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Prospect non trouvé")

    old_status = p.status
    p.status = data.status
    if data.status in (ProspectStatus.contacted, ProspectStatus.interested, ProspectStatus.demo):
        p.last_contacted_at = datetime.now(timezone.utc)

    # Log the status change
    action = ProspectAction(
        prospect_id=p.id,
        user_id=current_user.id,
        action_type="status_change",
        description=f"Statut changé: {old_status} → {data.status}",
    )
    db.add(action)
    await db.flush()
    await db.refresh(p)
    return p


@router.get("/prospects/{prospect_id}/actions", response_model=List[ActionOut])
async def list_actions(
    prospect_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ProspectAction)
        .where(ProspectAction.prospect_id == prospect_id)
        .order_by(ProspectAction.created_at.desc())
    )
    return result.scalars().all()


@router.post("/prospects/{prospect_id}/actions", response_model=ActionOut, status_code=201)
async def create_action(
    prospect_id: int,
    data: ActionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Prospect).where(Prospect.id == prospect_id))
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Prospect non trouvé")

    action = ProspectAction(
        prospect_id=prospect_id,
        user_id=current_user.id,
        **data.model_dump(exclude_none=True),
    )
    db.add(action)
    await db.flush()
    await db.refresh(action)
    return action


@router.post("/prospects/{prospect_id}/enrich", status_code=202)
async def enrich_prospect(
    prospect_id: int,
    current_user: User = Depends(get_current_user),
):
    from app.workers.tasks import task_enrich_prospect
    task = task_enrich_prospect.delay(prospect_id)
    return {"task_id": task.id, "message": "Enrichissement lancé"}


@router.get("/pipeline/summary")
async def pipeline_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Count prospects per status."""
    result = await db.execute(
        select(Prospect.status, func.count(Prospect.id).label("count"))
        .group_by(Prospect.status)
    )
    rows = result.all()
    counts = {row.status: row.count for row in rows}
    total = sum(counts.values())
    contacted = counts.get("contacted", 0) + counts.get("interested", 0) + counts.get("demo", 0) + counts.get("won", 0)
    won = counts.get("won", 0)
    return {
        "by_status": counts,
        "total": total,
        "contact_rate": round(contacted / total * 100, 1) if total else 0,
        "conversion_rate": round(won / contacted * 100, 1) if contacted else 0,
    }
