"""
Enrichissement Sirène INSEE — entièrement gratuit, sans clé API.
Trouve le SIRET, dirigeants officiels, NAF, effectif depuis le registre national.
"""

import asyncio
import logging
import re
import unicodedata
from typing import Optional

import httpx

from .models import Lead, Contact, ContactSource

log = logging.getLogger("trakr.sirene")

BASE_URL  = "https://recherche-entreprises.api.gouv.fr"
TIMEOUT   = httpx.Timeout(15.0)

# Mapping poste → score décisionnel
DECISION_SCORES: dict[str, int] = {
    "gérant":              100,
    "président":           95,
    "directeur général":   90,
    "dg":                  90,
    "directeur":           80,
    "co-gérant":           80,
    "associé gérant":      78,
    "propriétaire":        75,
    "fondateur":           72,
    "responsable":         55,
    "chef de cuisine":     50,
    "chef":                45,
    "manager":             40,
    "autre":               20,
}


def _decision_score(qualite: str) -> int:
    q = qualite.lower()
    for role, score in DECISION_SCORES.items():
        if role in q:
            return score
    return 20


async def search_by_name(nom: str, ville: str, client: httpx.AsyncClient) -> Optional[dict]:
    """
    Cherche une entreprise par nom + ville sur l'API officielle.
    Retourne le premier résultat pertinent ou None.
    """
    query = f"{nom} {ville}".strip()
    try:
        r = await client.get(
            f"{BASE_URL}/search",
            params={"q": query, "per_page": 3, "etat_administratif": "A"},
        )
        r.raise_for_status()
        results = r.json().get("results", [])
        if not results:
            return None

        # Prend le résultat avec le nom le plus proche
        nom_clean = _normalize(nom)
        best = None
        best_score = 0
        for r in results:
            rnom = _normalize(r.get("nom_complet", "") or r.get("nom_raison_sociale", ""))
            score = _similarity(nom_clean, rnom)
            if score > best_score:
                best_score = score
                best = r

        # Seuil minimum de similarité : 40%
        return best if best_score >= 40 else None

    except Exception as e:
        log.debug(f"Sirène search error pour '{nom}': {e}")
        return None


async def get_dirigeants(siren: str, client: httpx.AsyncClient) -> list[Contact]:
    """
    Récupère les dirigeants officiels d'une entreprise via son SIREN.
    """
    try:
        r = await client.get(
            f"{BASE_URL}/search",
            params={"q": siren, "per_page": 1},
        )
        r.raise_for_status()
        results = r.json().get("results", [])
        if not results:
            return []

        entreprise = results[0]
        contacts: list[Contact] = []

        for d in entreprise.get("dirigeants", []):
            prenom = (d.get("prenom") or "").strip().title()
            nom    = (d.get("nom") or d.get("nom_complet") or "").strip().upper()
            if not nom:
                continue
            qualite = d.get("qualite") or "Dirigeant"

            c = Contact(
                prenom=prenom,
                nom=nom,
                poste=qualite,
                source=ContactSource.REGISTRE_OFFICIEL,
                decision_score=_decision_score(qualite),
            )
            contacts.append(c)

        return contacts

    except Exception as e:
        log.debug(f"Sirène dirigeants error pour SIREN {siren}: {e}")
        return []


async def enrich_lead(lead: Lead, client: httpx.AsyncClient) -> Lead:
    """
    Enrichit un lead :
    1. Cherche l'entreprise sur Sirène si pas de SIRET
    2. Récupère SIRET, NAF, effectif
    3. Récupère les dirigeants officiels
    """
    if not lead.siret and not lead.siren:
        entreprise = await search_by_name(lead.nom, lead.ville, client)
        if entreprise:
            lead.siren       = entreprise.get("siren", "")
            lead.siret       = _best_siret(entreprise)
            lead.code_naf    = entreprise.get("activite_principale", "")
            lead.effectif    = _effectif_label(entreprise.get("tranche_effectif_salarie", ""))
            lead.forme_jur   = entreprise.get("categorie_juridique_libelle", "")
            log.info(f"  Sirène ✓ {lead.nom} → SIREN {lead.siren} | NAF {lead.code_naf}")

    # Récupération dirigeants si on a un SIREN
    siren = lead.siren or (lead.siret[:9] if lead.siret else "")
    if siren and not any(c.source == ContactSource.REGISTRE_OFFICIEL for c in lead.contacts):
        dirigeants = await get_dirigeants(siren, client)
        lead.contacts.extend(dirigeants)
        if dirigeants:
            log.info(f"  Dirigeants ✓ {lead.nom} → {len(dirigeants)} trouvé(s)")

    return lead


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _normalize(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9 ]", " ", s).strip()


def _similarity(a: str, b: str) -> int:
    """Score de similarité simple basé sur les mots communs (0–100)."""
    wa, wb = set(a.split()), set(b.split())
    if not wa or not wb:
        return 0
    common = wa & wb
    return int(100 * len(common) / max(len(wa), len(wb)))


def _best_siret(entreprise: dict) -> str:
    """Retourne le SIRET du siège social."""
    siege = entreprise.get("siege") or {}
    return siege.get("siret", "")


def _effectif_label(code: str) -> str:
    mapping = {
        "00": "0 salarié", "01": "1–2", "02": "3–5", "03": "6–9",
        "11": "10–19", "12": "20–49", "21": "50–99", "22": "100–199",
        "31": "200–249", "32": "250–499", "41": "500–999",
        "42": "1 000–1 999", "51": "2 000–4 999", "52": "5 000+",
    }
    return mapping.get(code, code or "—")
