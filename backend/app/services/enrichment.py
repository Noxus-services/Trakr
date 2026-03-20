"""Services d'enrichissement email et téléphone."""
import httpx
import asyncio
import dns.resolver
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.models.prospect import Prospect
from app.models.log import ProspectEnrichmentLog


async def _log_enrichment(
    db: AsyncSession,
    prospect_id: int,
    source: str,
    field: str,
    old_val: str | None,
    new_val: str | None,
    confidence: float | None = None,
):
    log = ProspectEnrichmentLog(
        prospect_id=prospect_id,
        source=source,
        field_updated=field,
        old_value=str(old_val) if old_val else None,
        new_value=str(new_val) if new_val else None,
        confidence=confidence,
        timestamp=datetime.now(timezone.utc),
    )
    db.add(log)


async def enrich_with_hunter(db: AsyncSession, prospect: Prospect) -> bool:
    """Recherche email via Hunter.io."""
    if not settings.HUNTER_API_KEY or not prospect.site_web:
        return False

    import re
    domain_match = re.search(r"https?://(?:www\.)?([^/]+)", prospect.site_web)
    if not domain_match:
        return False
    domain = domain_match.group(1)

    params = {
        "domain": domain,
        "api_key": settings.HUNTER_API_KEY,
    }
    if prospect.contact_prenom:
        params["first_name"] = prospect.contact_prenom
    if prospect.contact_nom:
        params["last_name"] = prospect.contact_nom

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get("https://api.hunter.io/v2/email-finder", params=params)
            data = resp.json()
        email_data = data.get("data", {})
        email = email_data.get("email")
        confidence = email_data.get("confidence", 0) / 100.0

        if email and confidence > 0.70:
            old = prospect.email
            prospect.email = email
            await _log_enrichment(db, prospect.id, "hunter", "email", old, email, confidence)
            return True
    except Exception as e:
        print(f"Hunter enrichment error: {e}")
    return False


async def enrich_with_dropcontact(db: AsyncSession, prospect: Prospect) -> bool:
    """Enrichissement via Dropcontact."""
    if not settings.DROPCONTACT_API_KEY:
        return False

    payload = {
        "data": [{
            "first_name": prospect.contact_prenom or "",
            "last_name": prospect.contact_nom or "",
            "company": prospect.raison_sociale,
            "siren": prospect.siret[:9] if prospect.siret else "",
        }],
        "siren": True,
    }

    headers = {
        "X-Access-Token": settings.DROPCONTACT_API_KEY,
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.dropcontact.com/batch/v1",
                json=payload,
                headers=headers,
            )
            data = resp.json()

        results = data.get("data", [])
        if results:
            item = results[0]
            emails = item.get("email", [])
            if emails:
                best = max(emails, key=lambda e: e.get("qualification", 0) if isinstance(e, dict) else 0)
                email = best.get("email") if isinstance(best, dict) else best
                if email:
                    old = prospect.email
                    prospect.email = email
                    await _log_enrichment(db, prospect.id, "dropcontact", "email", old, email, 0.9)
                    return True
    except Exception as e:
        print(f"Dropcontact enrichment error: {e}")
    return False


async def verify_email_dns(db: AsyncSession, prospect: Prospect) -> bool:
    """Vérifie l'email via DNS MX check."""
    if not prospect.email:
        return False

    domain = prospect.email.split("@")[-1]
    try:
        loop = asyncio.get_event_loop()
        records = await loop.run_in_executor(
            None,
            lambda: dns.resolver.resolve(domain, "MX")
        )
        verified = bool(records)
        old = prospect.email_verified
        prospect.email_verified = verified
        if verified != old:
            await _log_enrichment(db, prospect.id, "dns_check", "email_verified", str(old), str(verified))
        return verified
    except Exception:
        prospect.email_verified = False
        return False


async def enrich_prospect(db: AsyncSession, prospect_id: int):
    """Pipeline d'enrichissement complet pour un prospect."""
    result = await db.execute(select(Prospect).where(Prospect.id == prospect_id))
    prospect = result.scalar_one_or_none()
    if not prospect:
        return

    if not prospect.email:
        await enrich_with_hunter(db, prospect)

    if not prospect.email:
        await enrich_with_dropcontact(db, prospect)

    if prospect.email:
        await verify_email_dns(db, prospect)

    await db.flush()
