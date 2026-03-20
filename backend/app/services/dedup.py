"""Déduplication et normalisation des prospects."""
import re
from typing import Optional
import httpx
import phonenumbers
from rapidfuzz import fuzz
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.prospect import Prospect
from app.services.scoring import compute_icp_score


def normalize_phone(raw: str | None, country: str = "FR") -> str | None:
    if not raw:
        return None
    try:
        parsed = phonenumbers.parse(raw, country)
        if phonenumbers.is_valid_number(parsed):
            return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    except Exception:
        pass
    return raw


async def geocode_address(address: str) -> tuple[float | None, float | None]:
    """Géocode via API Adresse (adresse.data.gouv.fr)."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                "https://api-adresse.data.gouv.fr/search/",
                params={"q": address, "limit": 1},
            )
            data = resp.json()
            features = data.get("features", [])
            if features:
                coords = features[0]["geometry"]["coordinates"]
                return coords[1], coords[0]  # lat, lng
    except Exception:
        pass
    return None, None


def _name_similarity(a: str, b: str) -> float:
    return fuzz.token_set_ratio(a.lower(), b.lower()) / 100.0


async def dedup_and_save_prospect(db: AsyncSession, data: dict) -> Optional[Prospect]:
    """
    Tente de dédupliquer par SIRET puis par (nom + ville) fuzzy.
    Retourne le prospect créé ou None si doublon détecté.
    """
    siret = data.get("siret")

    # 1. Dédup par SIRET
    if siret:
        existing = await db.execute(select(Prospect).where(Prospect.siret == siret))
        if existing.scalar_one_or_none():
            return None

    # 2. Dédup fuzzy par nom + ville
    raison_sociale = data.get("raison_sociale", "")
    ville = data.get("ville", "")
    if raison_sociale and ville:
        candidates = await db.execute(
            select(Prospect).where(Prospect.ville.ilike(f"%{ville}%"))
        )
        for candidate in candidates.scalars().all():
            sim = _name_similarity(raison_sociale, candidate.raison_sociale)
            if sim > 0.85:  # Levenshtein distance < 0.15
                return None

    # 3. Normalisation téléphone
    if "tel" in data:
        data["tel"] = normalize_phone(data["tel"])

    # 4. Géocodage
    if data.get("adresse") and not data.get("lat"):
        full_addr = f"{data.get('adresse', '')} {data.get('code_postal', '')} {data.get('ville', '')}"
        lat, lng = await geocode_address(full_addr.strip())
        data["lat"] = lat
        data["lng"] = lng

    # 5. Création et scoring
    prospect = Prospect(**{k: v for k, v in data.items() if hasattr(Prospect, k)})
    prospect.icp_score = compute_icp_score(prospect)
    db.add(prospect)
    await db.flush()
    return prospect
