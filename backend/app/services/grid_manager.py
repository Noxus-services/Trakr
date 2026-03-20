"""
Grid Manager — Génère une grille GPS pour couvrir une ville sans laisser de trous.
Utilise la formule de Haversine pour adapter le pas de longitude à la latitude.
"""
import math
from typing import List, Tuple
import httpx


def generate_grid(lat: float, lon: float, radius_km: float, step_km: float = 0.5) -> List[Tuple[float, float]]:
    """
    Génère une grille de points GPS couvrant un cercle autour du centre.

    Args:
        lat: Latitude du centre
        lon: Longitude du centre
        radius_km: Rayon total à couvrir (km)
        step_km: Pas entre chaque point (km). 0.5 = très précis, 1.0 = normal, 2.0 = rapide

    Returns:
        Liste de (lat, lon) couvrant la zone
    """
    points: List[Tuple[float, float]] = []
    lat_step = step_km / 111.0
    steps = int(radius_km / step_km)

    for i in range(-steps, steps + 1):
        for j in range(-steps, steps + 1):
            new_lat = lat + (i * lat_step)
            # Ajustement longitude selon la latitude (formule Haversine)
            lon_step = step_km / (111.0 * math.cos(math.radians(new_lat)))
            new_lon = lon + (j * lon_step)

            # Garder seulement les points dans le cercle (pas les coins du carré)
            dist = math.sqrt((i * lat_step) ** 2 + (j * lon_step) ** 2) * 111.0
            if dist <= radius_km:
                points.append((round(new_lat, 6), round(new_lon, 6)))

    return points


async def geocode_city(city: str) -> Tuple[float, float]:
    """
    Convertit un nom de ville en coordonnées GPS via l'API Nominatim (gratuit, sans clé).

    Returns:
        (latitude, longitude)
    Raises:
        ValueError si la ville n'est pas trouvée
    """
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": city,
        "format": "json",
        "limit": 1,
        "countrycodes": "fr",
    }
    headers = {"User-Agent": "Trakr-Prospector/1.0 (contact@trakr.fr)"}

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, params=params, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    if not data:
        raise ValueError(f"Ville introuvable : {city!r}. Essayez avec un nom plus précis (ex: 'Lyon, France').")

    return float(data[0]["lat"]), float(data[0]["lon"])


def grid_for_city(city_lat: float, city_lon: float, keyword: str, radius_km: float = 5.0, step_km: float = 1.0) -> List[str]:
    """
    Génère les URLs Google Maps directement utilisables par le scraper.
    Format: https://www.google.com/maps/search/keyword/@lat,lon,15z

    Returns:
        Liste d'URLs Maps avec coordonnées intégrées
    """
    points = generate_grid(city_lat, city_lon, radius_km, step_km)
    keyword_enc = keyword.replace(" ", "+")
    urls = [
        f"https://www.google.com/maps/search/{keyword_enc}/@{lat},{lon},15z"
        for lat, lon in points
    ]
    return urls


# ── Presets villes françaises ──────────────────────────────────────────────────
CITY_PRESETS: dict[str, tuple[float, float]] = {
    "paris": (48.8566, 2.3522),
    "lyon": (45.7640, 4.8357),
    "marseille": (43.2965, 5.3698),
    "toulouse": (43.6047, 1.4442),
    "bordeaux": (44.8378, -0.5792),
    "nantes": (47.2184, -1.5536),
    "strasbourg": (48.5734, 7.7521),
    "montpellier": (43.6108, 3.8767),
    "lille": (50.6292, 3.0573),
    "rennes": (48.1173, -1.6778),
    "reims": (49.2583, 4.0317),
    "grenoble": (45.1885, 5.7245),
    "nice": (43.7102, 7.2620),
    "toulon": (43.1242, 5.9280),
    "aix-en-provence": (43.5297, 5.4474),
}


def get_city_coords(city: str) -> tuple[float, float] | None:
    """Retourne les coords si la ville est dans les presets."""
    return CITY_PRESETS.get(city.lower().strip())
