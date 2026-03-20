from fastapi import APIRouter, Depends, BackgroundTasks, UploadFile, File, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
import csv
import io

from app.core.security import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.user import User
from app.workers.tasks import (
    task_scrape_google_maps,
    task_scrape_pages_jaunes,
    task_scrape_sirene,
)
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


# ── Google Maps Playwright — endpoint direct, sans clé API ─────────────────────

class GoogleMapsPlaywrightRequest(BaseModel):
    keyword: str
    city: str
    max_results: int = 50


@router.post("/google-maps/playwright")
async def scrape_google_maps_playwright_endpoint(
    req: GoogleMapsPlaywrightRequest,
    x_api_key: Optional[str] = Header(default=None),
):
    """Scrape Google Maps via Playwright stealth. Aucune clé Google requise."""
    expected_key = getattr(settings, "SCRAPER_API_KEY", None)
    if expected_key and x_api_key != expected_key:
        raise HTTPException(status_code=401, detail="Clé API invalide")

    if not req.keyword.strip() or not req.city.strip():
        raise HTTPException(status_code=400, detail="keyword et city sont requis")

    max_r = min(max(req.max_results, 1), 120)

    from app.services.scraper_google import scrape_google_maps_playwright
    try:
        results = await scrape_google_maps_playwright(req.keyword, req.city, max_r)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"count": len(results), "results": results}

class GoogleMapsRequest(BaseModel):
    keyword: str
    city: str
    radius_km: int = 10


class PagesJaunesRequest(BaseModel):
    quoi: str
    ou: str
    max_pages: int = 10


class SireneRequest(BaseModel):
    code_naf: str
    code_postal: Optional[str] = None
    departement: Optional[str] = None


class TaskResponse(BaseModel):
    task_id: str
    message: str


@router.post("/google-maps", response_model=TaskResponse)
async def scrape_google_maps(
    req: GoogleMapsRequest,
    current_user: User = Depends(get_current_user),
):
    task = task_scrape_google_maps.delay(req.keyword, req.city, req.radius_km, current_user.id)
    return {"task_id": task.id, "message": f"Scraping Google Maps lancé — keyword={req.keyword} city={req.city}"}


@router.post("/pages-jaunes", response_model=TaskResponse)
async def scrape_pages_jaunes(
    req: PagesJaunesRequest,
    current_user: User = Depends(get_current_user),
):
    task = task_scrape_pages_jaunes.delay(req.quoi, req.ou, req.max_pages, current_user.id)
    return {"task_id": task.id, "message": f"Scraping PagesJaunes lancé — {req.quoi} à {req.ou}"}


@router.post("/sirene", response_model=TaskResponse)
async def scrape_sirene(
    req: SireneRequest,
    current_user: User = Depends(get_current_user),
):
    task = task_scrape_sirene.delay(req.code_naf, req.code_postal, req.departement, current_user.id)
    return {"task_id": task.id, "message": f"Scraping Sirene lancé — NAF={req.code_naf}"}


@router.post("/linkedin/import", status_code=201)
async def import_linkedin_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import CSV depuis Sales Navigator export."""
    if not file.filename.endswith(".csv"):
        raise HTTPException(400, detail="Fichier CSV attendu")

    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    from app.services.dedup import dedup_and_save_prospect
    from app.models.prospect import ProspectSource

    imported = 0
    skipped = 0
    for row in reader:
        data = {
            "raison_sociale": row.get("Company", "").strip() or "—",
            "contact_prenom": row.get("First Name", "").strip(),
            "contact_nom": row.get("Last Name", "").strip(),
            "contact_titre": row.get("Title", "").strip(),
            "email": row.get("Email", "").strip() or None,
            "linkedin_url": row.get("LinkedIn Url", row.get("Profile URL", "")).strip() or None,
            "site_web": row.get("Company Website", "").strip() or None,
            "ville": row.get("City", "").strip() or None,
            "source": ProspectSource.linkedin,
            "assigned_to": current_user.id,
        }
        result = await dedup_and_save_prospect(db, data)
        if result:
            imported += 1
        else:
            skipped += 1

    return {"imported": imported, "skipped": skipped}


@router.get("/task/{task_id}")
async def get_task_status(task_id: str, current_user: User = Depends(get_current_user)):
    from app.workers.celery_app import celery_app
    result = celery_app.AsyncResult(task_id)
    return {
        "task_id": task_id,
        "status": result.status,
        "result": result.result if result.ready() else None,
    }
