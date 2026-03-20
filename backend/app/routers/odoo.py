from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.prospect import Prospect, ProspectStatus

router = APIRouter()


class OdooSyncStatus(BaseModel):
    prospect_id: int
    raison_sociale: str
    odoo_partner_id: Optional[int]
    status: str


@router.post("/push-prospect/{prospect_id}")
async def push_prospect_to_odoo(
    prospect_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Prospect).where(Prospect.id == prospect_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Prospect non trouvé")

    from app.services.odoo_connector import push_to_odoo
    odoo_id = await push_to_odoo(p)
    if odoo_id:
        p.odoo_partner_id = odoo_id
        await db.flush()
        return {"message": "Prospect synchronisé dans Odoo", "odoo_partner_id": odoo_id}
    raise HTTPException(500, "Échec de la synchronisation Odoo")


@router.post("/push-all")
async def push_all_won(current_user: User = Depends(get_current_user)):
    from app.workers.tasks import task_push_all_to_odoo
    task = task_push_all_to_odoo.delay()
    return {"task_id": task.id, "message": "Synchronisation Odoo lancée pour tous les prospects 'won'"}


@router.post("/webhook/deal-closed")
async def odoo_webhook_deal_closed(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Webhook Odoo → mise à jour statut prospect."""
    body = await request.json()
    partner_id = body.get("partner_id")
    if not partner_id:
        raise HTTPException(400, "partner_id manquant")

    result = await db.execute(select(Prospect).where(Prospect.odoo_partner_id == partner_id))
    p = result.scalar_one_or_none()
    if p:
        p.status = ProspectStatus.won
        await db.flush()
        return {"message": f"Prospect {p.id} marqué comme gagné"}
    raise HTTPException(404, "Prospect non trouvé par odoo_partner_id")


@router.get("/sync-status", response_model=List[OdooSyncStatus])
async def sync_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Prospect)
        .where(Prospect.odoo_partner_id.isnot(None))
        .order_by(Prospect.id)
    )
    prospects = result.scalars().all()
    return [
        OdooSyncStatus(
            prospect_id=p.id,
            raison_sociale=p.raison_sociale,
            odoo_partner_id=p.odoo_partner_id,
            status=p.status,
        )
        for p in prospects
    ]
