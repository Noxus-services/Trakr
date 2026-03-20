from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.routers import auth, scraper, crm, outreach, odoo, analytics

app = FastAPI(
    title=settings.APP_NAME,
    description="Outil interne de prospection commerciale B2B — nuisibles & hygiène",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(scraper.router, prefix="/api/scraper", tags=["Scraper"])
app.include_router(crm.router, prefix="/api/crm", tags=["CRM"])
app.include_router(outreach.router, prefix="/api/outreach", tags=["Outreach"])
app.include_router(odoo.router, prefix="/api/odoo", tags=["Odoo"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])


@app.get("/api/health", tags=["Health"])
async def health():
    return {"status": "ok", "app": settings.APP_NAME}
