"""
Entrypoint léger pour Railway — health + Google Maps Playwright uniquement.
Pas de base de données requise. Pas de Redis. Pas de Celery.
"""
from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
import os
import uvicorn

app = FastAPI(title="Trakr Scraper", version="2.0.0", docs_url="/api/docs")

# ── CORS manuel — CORSMiddleware de Starlette échoue sur OPTIONS avec allow_origins=* ──
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key, Authorization",
    "Access-Control-Max-Age": "86400",
}

@app.middleware("http")
async def cors_middleware(request: Request, call_next):
    # Preflight OPTIONS — répondre immédiatement sans passer aux routes
    if request.method == "OPTIONS":
        return JSONResponse(status_code=200, content={}, headers=CORS_HEADERS)
    response = await call_next(request)
    for k, v in CORS_HEADERS.items():
        response.headers[k] = v
    return response


SCRAPER_API_KEY = os.getenv("SCRAPER_API_KEY", "")


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "trakr-scraper", "version": "2.0.0"}


class GoogleMapsRequest(BaseModel):
    keyword: str
    city: str
    max_results: int = 50
    use_grid: bool = False       # Active le quadrillage GPS (dépasse la limite 200)
    radius_km: float = 3.0       # Rayon du quadrillage (km)
    step_km: float = 1.0         # Pas entre points GPS (km)


@app.post("/api/scraper/google-maps/playwright")
async def scrape_google_maps(
    req: GoogleMapsRequest,
    x_api_key: Optional[str] = Header(default=None),
):
    if SCRAPER_API_KEY and x_api_key != SCRAPER_API_KEY:
        raise HTTPException(status_code=401, detail="Clé API invalide")

    if not req.keyword.strip() or not req.city.strip():
        raise HTTPException(status_code=400, detail="keyword et city requis")

    max_r = min(max(req.max_results, 1), 300)

    from app.services.scraper_google import scrape_google_maps_playwright
    try:
        results = await scrape_google_maps_playwright(
            keyword=req.keyword,
            city=req.city,
            max_results=max_r,
            use_grid=req.use_grid,
            radius_km=req.radius_km,
            step_km=req.step_km,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"count": len(results), "results": results}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
