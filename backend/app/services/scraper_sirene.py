"""Scraper Sirene INSEE API officielle."""
import httpx
from app.core.config import settings

SIRENE_BASE = "https://api.insee.fr/entreprises/sirene/V3.11"
TARGET_NAF = ["5610A", "5610C", "5630Z", "5510Z", "4711D", "1013A", "1089Z"]


async def fetch_sirene(
    code_naf: str,
    code_postal: str | None = None,
    departement: str | None = None,
) -> list[dict]:
    if not settings.INSEE_API_KEY:
        raise ValueError("INSEE_API_KEY non configurée")

    headers = {
        "Authorization": f"Bearer {settings.INSEE_API_KEY}",
        "Accept": "application/json",
    }

    q_parts = [f'activitePrincipaleUniteLegale:"{code_naf}"']
    if code_postal:
        q_parts.append(f'codePostalEtablissement:"{code_postal}"')
    if departement:
        q_parts.append(f'codeDepartementEtablissement:"{departement}"')
    q = " AND ".join(q_parts)

    results = []
    cursor = "*"

    async with httpx.AsyncClient(timeout=20, headers=headers) as client:
        while len(results) < 500:
            params = {
                "q": q,
                "nombre": 100,
                "curseur": cursor,
                "champs": "siret,denominationUniteLegale,adresseEtablissement,trancheEffectifsEtablissement,dateCreationUniteLegale",
            }
            resp = await client.get(f"{SIRENE_BASE}/siret", params=params)
            if resp.status_code != 200:
                break
            data = resp.json()
            etablissements = data.get("etablissements", [])
            if not etablissements:
                break

            for etab in etablissements:
                parsed = _parse_etablissement(etab, code_naf)
                if parsed:
                    results.append(parsed)

            next_cursor = data.get("header", {}).get("curseurSuivant")
            if not next_cursor or next_cursor == cursor:
                break
            cursor = next_cursor

    return results


def _parse_etablissement(etab: dict, code_naf: str) -> dict | None:
    ul = etab.get("uniteLegale", {})
    addr = etab.get("adresseEtablissement", {})

    siret = etab.get("siret")
    name = ul.get("denominationUniteLegale") or ul.get("nomUniteLegale", "")
    if not name:
        return None

    voie = " ".join(filter(None, [
        addr.get("numeroVoieEtablissement"),
        addr.get("typeVoieEtablissement"),
        addr.get("libelleVoieEtablissement"),
    ]))

    effectif_code = etab.get("trancheEffectifsEtablissement")
    effectif = _tranche_to_effectif(effectif_code)

    date_creation = ul.get("dateCreationUniteLegale")

    from datetime import datetime
    date_obj = None
    if date_creation:
        try:
            date_obj = datetime.strptime(date_creation, "%Y-%m-%d")
        except Exception:
            pass

    return {
        "siret": siret,
        "raison_sociale": name.strip(),
        "adresse": voie or None,
        "code_postal": addr.get("codePostalEtablissement"),
        "ville": addr.get("libelleCommuneEtablissement"),
        "code_naf": code_naf,
        "effectif": effectif,
        "date_creation": date_obj,
        "source": "sirene",
    }


def _tranche_to_effectif(code: str | None) -> int | None:
    mapping = {
        "00": 0, "01": 2, "02": 5, "03": 10, "11": 15, "12": 25,
        "21": 40, "22": 75, "31": 150, "32": 350, "41": 750,
        "42": 1500, "51": 3500, "52": 7500, "53": 10000,
    }
    if code is None:
        return None
    return mapping.get(code)
