"""Celery tasks — scraping, enrichissement, sequences, Odoo."""
import asyncio
from app.workers.celery_app import celery_app
from app.core.database import AsyncSessionLocal


def _run_async(coro):
    """Helper to run an async coroutine from a sync Celery task."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ── Scraping ──────────────────────────────────────────────────────────────────

@celery_app.task(bind=True, name="app.workers.tasks.task_scrape_google_maps", max_retries=2)
def task_scrape_google_maps(self, keyword: str, city: str, radius_km: int, user_id: int):
    async def _run():
        from app.services.scraper_google import fetch_google_places
        from app.services.dedup import dedup_and_save_prospect

        places = await fetch_google_places(keyword, city, radius_km)
        async with AsyncSessionLocal() as db:
            saved = 0
            for place in places:
                place["assigned_to"] = user_id
                result = await dedup_and_save_prospect(db, place)
                if result:
                    saved += 1
            await db.commit()
        return {"scraped": len(places), "saved": saved}

    try:
        return _run_async(_run())
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(bind=True, name="app.workers.tasks.task_scrape_pages_jaunes", max_retries=2)
def task_scrape_pages_jaunes(self, quoi: str, ou: str, max_pages: int, user_id: int):
    async def _run():
        from app.services.scraper_pj import scrape_pages_jaunes
        from app.services.dedup import dedup_and_save_prospect

        listings = await scrape_pages_jaunes(quoi, ou, max_pages)
        async with AsyncSessionLocal() as db:
            saved = 0
            for listing in listings:
                listing["assigned_to"] = user_id
                result = await dedup_and_save_prospect(db, listing)
                if result:
                    saved += 1
            await db.commit()
        return {"scraped": len(listings), "saved": saved}

    try:
        return _run_async(_run())
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(bind=True, name="app.workers.tasks.task_scrape_sirene", max_retries=2)
def task_scrape_sirene(self, code_naf: str, code_postal: str | None, departement: str | None, user_id: int):
    async def _run():
        from app.services.scraper_sirene import fetch_sirene
        from app.services.dedup import dedup_and_save_prospect

        etablissements = await fetch_sirene(code_naf, code_postal, departement)
        async with AsyncSessionLocal() as db:
            saved = 0
            for etab in etablissements:
                etab["assigned_to"] = user_id
                result = await dedup_and_save_prospect(db, etab)
                if result:
                    saved += 1
            await db.commit()
        return {"scraped": len(etablissements), "saved": saved}

    try:
        return _run_async(_run())
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


# ── Enrichissement ────────────────────────────────────────────────────────────

@celery_app.task(bind=True, name="app.workers.tasks.task_enrich_prospect", max_retries=3)
def task_enrich_prospect(self, prospect_id: int):
    async def _run():
        from app.services.enrichment import enrich_prospect
        async with AsyncSessionLocal() as db:
            await enrich_prospect(db, prospect_id)
            await db.commit()
        return {"prospect_id": prospect_id, "status": "enriched"}

    try:
        return _run_async(_run())
    except Exception as exc:
        raise self.retry(exc=exc, countdown=120)


# ── Séquences email ───────────────────────────────────────────────────────────

@celery_app.task(name="app.workers.tasks.task_process_sequences")
def task_process_sequences():
    async def _run():
        from app.services.outreach import process_sequences
        async with AsyncSessionLocal() as db:
            await process_sequences(db)
            await db.commit()
        return {"status": "done"}

    return _run_async(_run())


# ── Odoo sync ─────────────────────────────────────────────────────────────────

@celery_app.task(bind=True, name="app.workers.tasks.task_push_all_to_odoo", max_retries=2)
def task_push_all_to_odoo(self):
    async def _run():
        from app.services.odoo_connector import push_all_won_to_odoo
        async with AsyncSessionLocal() as db:
            result = await push_all_won_to_odoo(db)
            await db.commit()
        return result

    try:
        return _run_async(_run())
    except Exception as exc:
        raise self.retry(exc=exc, countdown=300)
