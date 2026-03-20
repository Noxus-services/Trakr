from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Trakr Prospector"
    DEBUG: bool = False
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://trakr:trakr@localhost:5432/trakr_prospector"
    DATABASE_URL_SYNC: str = "postgresql://trakr:trakr@localhost:5432/trakr_prospector"

    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

    # Clé secrète optionnelle pour protéger l'endpoint Playwright
    SCRAPER_API_KEY: Optional[str] = None

    # Google Places (legacy)
    GOOGLE_PLACES_API_KEY: Optional[str] = None

    # Scraping — INSEE Sirene
    INSEE_API_KEY: Optional[str] = None

    # Enrichment
    HUNTER_API_KEY: Optional[str] = None
    DROPCONTACT_API_KEY: Optional[str] = None

    # Outreach
    SENDGRID_API_KEY: Optional[str] = None
    SENDGRID_FROM_EMAIL: str = "prospection@example.fr"
    SENDGRID_FROM_NAME: str = "Équipe Commerciale"

    # Odoo
    ODOO_URL: Optional[str] = None
    ODOO_DB: Optional[str] = None
    ODOO_USERNAME: Optional[str] = None
    ODOO_PASSWORD: Optional[str] = None

    # Mapbox
    MAPBOX_TOKEN: Optional[str] = None

    # App base URL (for tracking pixels & unsubscribe links)
    APP_BASE_URL: str = "http://localhost:8000"
    FRONTEND_URL: str = "http://localhost:5173"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
