"""Scraper Google Places API."""
import httpx
from typing import Any
from app.core.config import settings


PLACES_TEXTSEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"


async def fetch_google_places(keyword: str, city: str, radius_km: int) -> list[dict]:
    if not settings.GOOGLE_PLACES_API_KEY:
        raise ValueError("GOOGLE_PLACES_API_KEY non configurée")

    results = []
    query = f"{keyword} {city}"
    next_page_token = None

    async with httpx.AsyncClient(timeout=15) as client:
        while True:
            params: dict[str, Any] = {
                "query": query,
                "radius": radius_km * 1000,
                "key": settings.GOOGLE_PLACES_API_KEY,
                "language": "fr",
            }
            if next_page_token:
                params["pagetoken"] = next_page_token

            resp = await client.get(PLACES_TEXTSEARCH_URL, params=params)
            data = resp.json()

            for place in data.get("results", []):
                results.append(_parse_place(place))

            next_page_token = data.get("next_page_token")
            if not next_page_token or len(results) >= 60:
                break

    return results


def _parse_place(place: dict) -> dict:
    geometry = place.get("geometry", {}).get("location", {})
    address_components = place.get("formatted_address", "")
    parts = address_components.split(",")

    return {
        "raison_sociale": place.get("name", ""),
        "adresse": address_components,
        "ville": parts[-2].strip() if len(parts) >= 2 else None,
        "code_postal": _extract_postal_code(address_components),
        "tel": place.get("formatted_phone_number"),
        "site_web": place.get("website"),
        "google_place_id": place.get("place_id"),
        "google_rating": place.get("rating"),
        "lat": geometry.get("lat"),
        "lng": geometry.get("lng"),
        "source": "google_maps",
    }


def _extract_postal_code(address: str) -> str | None:
    import re
    match = re.search(r"\b\d{5}\b", address)
    return match.group() if match else None
