"""
Entrypoint léger pour Railway — health + Google Maps Playwright uniquement.
Pas de base de données requise. Pas de Redis. Pas de Celery.
"""
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os

app = FastAPI(title="Trakr Scraper", version="1.0.0", docs_url="/api/docs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SCRAPER_API_KEY = os.getenv("SCRAPER_API_KEY", "")


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "trakr-scraper"}


class GoogleMapsRequest(BaseModel):
    keyword: str
    city: str
    max_results: int = 50


@app.post("/api/scraper/google-maps/playwright")
async def scrape_google_maps(
    req: GoogleMapsRequest,
    x_api_key: Optional[str] = Header(default=None),
):
    if SCRAPER_API_KEY and x_api_key != SCRAPER_API_KEY:
        raise HTTPException(status_code=401, detail="Clé API invalide")

    if not req.keyword.strip() or not req.city.strip():
        raise HTTPException(status_code=400, detail="keyword et city requis")

    max_r = min(max(req.max_results, 1), 120)

    from app.services.scraper_google import scrape_google_maps_playwright
    try:
        results = await scrape_google_maps_playwright(req.keyword, req.city, max_r)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"count": len(results), "results": results}
