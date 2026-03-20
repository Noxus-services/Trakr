"""
Google Maps Scraper — Trakr Prospector
Extrait les leads B2B depuis Google Maps sans API officielle.
Auteur : Senior Python Dev / OSINT
Usage  : python gmaps_scraper.py --query "Garagistes Lyon" --max 100
"""

import asyncio
import re
import csv
import argparse
import logging
import sys
import os
from pathlib import Path
from datetime import datetime

import pandas as pd
import requests
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout

# Permet d'importer le pipeline depuis le dossier parent
sys.path.insert(0, str(Path(__file__).parent))
try:
    from enrichment.pipeline import EnrichmentPipeline, save_enriched_csv
    from enrichment.models import Lead
    HAS_PIPELINE = True
except ImportError:
    HAS_PIPELINE = False
    logging.warning("Pipeline d'enrichissement non disponible (enrichment/ introuvable).")

# playwright-stealth rend le browser indétectable (user-agent réaliste, WebGL, etc.)
try:
    from playwright_stealth import stealth_async
    HAS_STEALTH = True
except ImportError:
    HAS_STEALTH = False
    logging.warning("playwright-stealth non installé — détection bot plus probable.")

# ─── Configuration ────────────────────────────────────────────────────────────

HEADLESS      = False          # True pour prod, False pour déboguer visuellement
SLOW_MO       = 50             # ms entre chaque action (réduit la détection)
SCROLL_PAUSE  = 2000           # ms d'attente après chaque scroll (laisse Google charger)
MAX_RESULTS   = 60             # limite par défaut
REQUEST_TO    = 10             # timeout requêtes HTTP enrichissement (secondes)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("gmaps")

# ─── Sélecteurs CSS/ARIA stables (2026) ───────────────────────────────────────
# Google change ses classes aléatoires — on cible les attributs sémantiques.

SEL_FEED     = 'div[role="feed"]'          # conteneur scrollable de la liste
SEL_ARTICLE  = 'div[role="article"]'       # chaque fiche établissement
SEL_COOKIE   = 'button[aria-label*="Tout accepter"], button[aria-label*="Accept all"]'

# ─── Utilitaire : nettoyage texte ─────────────────────────────────────────────

def clean(text: str | None) -> str:
    if not text:
        return ""
    return " ".join(text.strip().split())


# ─── 1. Gestion bannière cookies ──────────────────────────────────────────────

async def accept_cookies(page) -> None:
    """Clique sur 'Tout accepter' si la bannière RGPD apparaît."""
    try:
        btn = page.locator(SEL_COOKIE).first
        await btn.wait_for(state="visible", timeout=5000)
        await btn.click()
        log.info("Bannière cookies acceptée.")
        await page.wait_for_timeout(1000)
    except PlaywrightTimeout:
        log.debug("Aucune bannière cookies détectée.")


# ─── 2. Scroll du panneau résultats ───────────────────────────────────────────

async def scroll_until_complete(page, max_results: int) -> int:
    """
    Scrolle le div[role='feed'] jusqu'à ce que :
    - le nombre d'articles ne progresse plus (fin de liste), ou
    - on a atteint max_results articles.
    Retourne le nombre final d'articles.
    """
    feed = page.locator(SEL_FEED)
    try:
        await feed.wait_for(state="visible", timeout=10000)
    except PlaywrightTimeout:
        log.error("Le panneau de résultats n'est pas apparu.")
        return 0

    last_count = 0
    stale_rounds = 0  # compteur de rounds sans progression

    while True:
        # Scroll jusqu'en bas du conteneur
        await feed.evaluate("el => el.scrollTo(0, el.scrollHeight)")
        await page.wait_for_timeout(SCROLL_PAUSE)

        current_count = await page.locator(SEL_ARTICLE).count()
        log.info(f"  → {current_count} établissements chargés…")

        if current_count >= max_results:
            log.info(f"Limite max_results={max_results} atteinte.")
            break

        if current_count == last_count:
            stale_rounds += 1
            if stale_rounds >= 2:
                log.info("Liste complète — aucun nouveau résultat.")
                break
        else:
            stale_rounds = 0

        last_count = current_count

    return await page.locator(SEL_ARTICLE).count()


# ─── 3. Extraction d'un établissement ─────────────────────────────────────────

async def extract_listing(article) -> dict:
    """
    Extrait toutes les données d'un article (fiche Maps).
    Chaque champ est protégé par try/except — certains commerces
    n'ont pas de site web, de téléphone, ou de note.
    """
    data = {
        "nom":         "",
        "note":        "",
        "nb_avis":     "",
        "adresse":     "",
        "telephone":   "",
        "site_web":    "",
        "categorie":   "",
        "email":       "",   # enrichi plus tard
    }

    # Nom — fiable via aria-label de l'article
    try:
        data["nom"] = clean(await article.get_attribute("aria-label"))
    except Exception:
        pass

    # Note et nombre d'avis
    try:
        # span avec aria-label du type "4,3 étoiles 127 avis"
        rating_el = article.locator('span[role="img"][aria-label*="étoile"]').first
        rating_label = await rating_el.get_attribute("aria-label", timeout=2000)
        if rating_label:
            parts = rating_label.split()
            data["note"]    = parts[0] if parts else ""
            # "127 avis" → on cherche le chiffre
            avis_match = re.search(r"(\d[\d\s]*)\s+avis", rating_label)
            if avis_match:
                data["nb_avis"] = avis_match.group(1).replace(" ", "")
    except Exception:
        pass

    # Adresse — cherche l'élément avec data-item-id="address"
    try:
        addr_el = article.locator('[data-item-id="address"]').first
        if await addr_el.count() > 0:
            data["adresse"] = clean(await addr_el.inner_text(timeout=2000))
    except Exception:
        pass

    # Téléphone — data-item-id commence par "phone:"
    try:
        phone_el = article.locator('[data-item-id^="phone:"]').first
        if await phone_el.count() > 0:
            data["telephone"] = clean(await phone_el.inner_text(timeout=2000))
    except Exception:
        pass

    # Site web — lien avec data-item-id="authority"
    try:
        web_el = article.locator('a[data-item-id="authority"]').first
        if await web_el.count() > 0:
            data["site_web"] = await web_el.get_attribute("href", timeout=2000) or ""
    except Exception:
        pass

    # Catégorie (ex: "Restaurant", "Garage")
    try:
        cat_el = article.locator('button[jsaction*="category"]').first
        if await cat_el.count() > 0:
            data["categorie"] = clean(await cat_el.inner_text(timeout=2000))
    except Exception:
        pass

    return data


# ─── 4. Enrichissement email ──────────────────────────────────────────────────

EMAIL_RE = re.compile(
    r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
)
# Domaines exclus (faux positifs courants dans les sources JS/CSS)
IGNORED_DOMAINS = {
    "example.com", "sentry.io", "w3.org", "schema.org",
    "google.com", "facebook.com", "twitter.com", "jsdelivr.net",
}

def enrich_with_email(url: str, timeout: int = REQUEST_TO) -> str:
    """
    Télécharge la page d'accueil + /contact du site et extrait
    la première adresse email trouvée dans le source HTML.
    Retourne "" si aucun email valide n'est trouvé.
    """
    if not url or not url.startswith("http"):
        return ""

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
    }

    # Pages candidates : accueil + /contact
    base = url.rstrip("/")
    candidates = [base, f"{base}/contact", f"{base}/contact-us", f"{base}/nous-contacter"]

    for page_url in candidates:
        try:
            resp = requests.get(page_url, headers=headers, timeout=timeout, allow_redirects=True)
            if resp.status_code != 200:
                continue

            # On cherche d'abord dans le texte visible (plus fiable)
            soup = BeautifulSoup(resp.text, "html.parser")
            visible_text = soup.get_text(" ")
            emails = EMAIL_RE.findall(visible_text)

            for email in emails:
                domain = email.split("@")[-1].lower()
                if domain not in IGNORED_DOMAINS and not domain.endswith((".png", ".jpg", ".svg")):
                    return email.lower()

        except requests.RequestException:
            continue

    return ""


# ─── 5. Orchestrateur principal ───────────────────────────────────────────────

async def scrape_google_maps(
    search_query: str,
    max_results: int = MAX_RESULTS,
    headless: bool = HEADLESS,
    enrich_email: bool = True,
    output_file: str = "data_leads.csv",
) -> list[dict]:
    """
    Lance Playwright, cherche `search_query` sur Google Maps,
    extrait tous les établissements et retourne une liste de dicts.
    """
    results = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=headless,
            slow_mo=SLOW_MO,
            args=[
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
            ],
        )

        context = await browser.new_context(
            viewport={"width": 1280, "height": 900},
            locale="fr-FR",
            timezone_id="Europe/Paris",
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
        )

        page = await context.new_page()

        # Applique stealth si disponible
        if HAS_STEALTH:
            await stealth_async(page)
            log.info("Mode stealth activé.")

        # Navigation Google Maps
        log.info(f'Recherche : "{search_query}"')
        await page.goto("https://www.google.com/maps", wait_until="domcontentloaded")
        await accept_cookies(page)

        # Saisie de la recherche dans la barre Maps
        search_box = page.locator('input#searchboxinput')
        await search_box.wait_for(state="visible", timeout=10000)
        await search_box.fill(search_query)
        await search_box.press("Enter")

        # Attente du panneau résultats
        await page.wait_for_timeout(3000)

        # Scroll jusqu'à max_results
        total = await scroll_until_complete(page, max_results)
        log.info(f"{total} établissements disponibles pour extraction.")

        # Extraction article par article
        articles = await page.locator(SEL_ARTICLE).all()
        articles = articles[:max_results]

        for i, article in enumerate(articles, 1):
            try:
                data = await extract_listing(article)
                log.info(f"[{i}/{len(articles)}] {data['nom'] or '(sans nom)'} | {data['telephone']} | {data['site_web'][:40] if data['site_web'] else '—'}")
                results.append(data)
            except Exception as e:
                log.warning(f"Erreur extraction article {i} : {e}")

        await browser.close()

    # Enrichissement email (synchrone, après fermeture du browser)
    if enrich_email:
        log.info("Enrichissement email en cours…")
        for i, row in enumerate(results, 1):
            if row.get("site_web") and not row.get("email"):
                email = enrich_with_email(row["site_web"])
                if email:
                    row["email"] = email
                    log.info(f"  ✓ {row['nom']} → {email}")
            if i % 10 == 0:
                log.info(f"  {i}/{len(results)} enrichis…")

    return results


# ─── 6. Multi-localités ───────────────────────────────────────────────────────

async def scrape_multi_locations(
    base_query: str,
    locations: list[str],
    max_per_location: int = 60,
    headless: bool = True,
    output_file: str = "data_leads.csv",
) -> None:
    """
    Lance le scraper pour chaque localité et consolide en un seul CSV.
    Évite les doublons par nom + téléphone.
    Exemple : base_query="Boulangerie", locations=["Paris 11", "Paris 12", "Lyon 6e"]
    """
    all_results: list[dict] = []
    seen: set[str] = set()

    for location in locations:
        query = f"{base_query} {location}"
        log.info(f"\n{'─'*50}\nLocalité : {location}\n{'─'*50}")
        try:
            batch = await scrape_google_maps(
                search_query=query,
                max_results=max_per_location,
                headless=headless,
                enrich_email=False,   # on enrichit globalement à la fin
                output_file=output_file,
            )
            for row in batch:
                dedup_key = f"{row['nom']}|{row['telephone']}"
                if dedup_key not in seen:
                    seen.add(dedup_key)
                    row["localite_recherche"] = location
                    all_results.append(row)
        except Exception as e:
            log.error(f"Erreur sur '{query}' : {e}")

    # Enrichissement global
    log.info(f"\nEnrichissement email pour {len(all_results)} leads…")
    for row in all_results:
        if row.get("site_web") and not row.get("email"):
            row["email"] = enrich_with_email(row["site_web"])

    save_to_csv(all_results, output_file)


# ─── 7. Sauvegarde CSV ────────────────────────────────────────────────────────

def save_to_csv(results: list[dict], output_file: str) -> None:
    if not results:
        log.warning("Aucun résultat à sauvegarder.")
        return

    df = pd.DataFrame(results)

    # Ordre des colonnes
    cols = ["nom", "categorie", "note", "nb_avis", "adresse", "telephone", "email", "site_web"]
    if "localite_recherche" in df.columns:
        cols.append("localite_recherche")
    df = df[[c for c in cols if c in df.columns]]

    df.to_csv(output_file, index=False, encoding="utf-8-sig")  # utf-8-sig → compatible Excel
    log.info(f"\n✓ {len(df)} leads sauvegardés dans '{output_file}'")
    log.info(f"  Avec email    : {df['email'].astype(bool).sum()}")
    log.info(f"  Avec site web : {df['site_web'].astype(bool).sum()}")
    log.info(f"  Avec tel      : {df['telephone'].astype(bool).sum()}")


# ─── 8. Point d'entrée CLI ────────────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(
        description="Scraper Google Maps → CSV de leads B2B"
    )
    parser.add_argument("--query",    required=True,        help='Recherche Google Maps (ex: "Garagistes Lyon")')
    parser.add_argument("--max",      type=int, default=60, help="Nombre max de résultats (défaut: 60)")
    parser.add_argument("--headless", action="store_true",  help="Lancer en mode headless (sans interface)")
    parser.add_argument("--no-email", action="store_true",  help="Désactiver l'enrichissement email simple")
    parser.add_argument("--output",   default="data_leads.csv", help="Fichier CSV de sortie")
    parser.add_argument(
        "--locations",
        nargs="+",
        help="Liste de localités pour le mode multi (ex: --locations 'Paris 11' 'Paris 12' 'Lyon')"
    )
    # ── Pipeline complet ──────────────────────────────────────────────────────
    parser.add_argument(
        "--enrich",
        action="store_true",
        help=(
            "Active le pipeline d'enrichissement complet après le scraping :\n"
            "  Sirène INSEE → dirigeants officiels\n"
            "  Crawl site web → emails (mailto, JSON-LD, texte)\n"
            "  Patterns email → prenom.nom@domain, p.nom@domain…\n"
            "  Vérification SMTP/DNS → indice de fiabilité 0-100\n"
            "  Déduplication + scoring ICP\n"
            "Output : *_enriched.csv avec contacts1/2/3, verdicts, scores"
        )
    )
    parser.add_argument(
        "--no-smtp",
        action="store_true",
        help="Avec --enrich : désactive la vérification SMTP (plus rapide)"
    )
    parser.add_argument(
        "--no-sirene",
        action="store_true",
        help="Avec --enrich : désactive l'enrichissement Sirène INSEE"
    )
    return parser.parse_args()


async def main():
    args = parse_args()

    # Nom de fichier horodaté si non spécifié
    ts = datetime.now().strftime("%Y%m%d_%H%M")
    if args.output == "data_leads.csv":
        args.output = f"leads_{ts}.csv"

    if args.locations:
        await scrape_multi_locations(
            base_query=args.query,
            locations=args.locations,
            max_per_location=args.max,
            headless=args.headless,
            output_file=args.output,
        )
    else:
        results = await scrape_google_maps(
            search_query=args.query,
            max_results=args.max,
            headless=args.headless,
            enrich_email=(not args.no_email) and (not args.enrich),
            output_file=args.output,
        )

        if args.enrich and HAS_PIPELINE:
            # ── Pipeline enrichissement complet ───────────────────────────────
            log.info(f"\n{'═'*60}")
            log.info("PIPELINE D'ENRICHISSEMENT COMPLET")
            log.info(f"{'═'*60}")
            leads = [
                Lead(
                    nom=r.get("nom", ""),
                    ville=_extract_city(r.get("adresse", "")),
                    adresse=r.get("adresse", ""),
                    telephone=r.get("telephone", ""),
                    site_web=r.get("site_web", ""),
                    note=r.get("note", ""),
                    nb_avis=r.get("nb_avis", ""),
                    categorie=r.get("categorie", ""),
                )
                for r in results
            ]
            enriched_output = args.output.replace(".csv", "_enriched.csv")
            async with EnrichmentPipeline(
                verify_smtp=not args.no_smtp,
                enrich_sirene=not args.no_sirene,
                concurrency=4,
            ) as pipeline:
                enriched = await pipeline.enrich_batch(leads)
            save_enriched_csv(enriched, enriched_output)

            # Sauvegarder aussi le CSV brut
            save_to_csv(results, args.output)

        elif args.enrich and not HAS_PIPELINE:
            log.error("--enrich demandé mais le module enrichment/ est introuvable.")
            save_to_csv(results, args.output)
        else:
            save_to_csv(results, args.output)


def _extract_city(adresse: str) -> str:
    """Extrait la ville depuis une adresse complète (dernier segment)."""
    if not adresse:
        return ""
    parts = adresse.split(",")
    last = parts[-1].strip()
    # Retirer le code postal si présent
    last = re.sub(r"^\d{5}\s*", "", last).strip()
    return last


if __name__ == "__main__":
    asyncio.run(main())
