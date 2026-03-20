"""
Google Maps Scraper — Trakr Prospector
Extrait les leads B2B depuis Google Maps sans API officielle.

Améliorations v2 :
  - Clic sur chaque fiche → téléphone, adresse, site web réels
  - Sélecteurs robustes avec fallbacks multiples
  - Déduplication par nom
  - Détection fin de liste ("Vous avez atteint la fin")
  - Délais aléatoires humains
  - Intégration pipeline enrichissement (--enrich)

Usage :
  python gmaps_scraper.py --query "Restaurants Lyon" --max 80
  python gmaps_scraper.py --query "Hôtels Paris" --max 50 --enrich
  python gmaps_scraper.py --query "Garage" --locations "Lyon" "Bordeaux" --enrich
"""

import asyncio
import random
import re
import argparse
import logging
import sys
from pathlib import Path
from datetime import datetime

import pandas as pd
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout

try:
    from playwright_stealth import stealth_async
    HAS_STEALTH = True
except ImportError:
    HAS_STEALTH = False
    logging.warning("playwright-stealth non installé.")

sys.path.insert(0, str(Path(__file__).parent))
try:
    from enrichment.pipeline import EnrichmentPipeline, save_enriched_csv
    from enrichment.models import Lead
    HAS_PIPELINE = True
except ImportError:
    HAS_PIPELINE = False

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("gmaps")

# ─── Sélecteurs avec fallbacks ────────────────────────────────────────────────

SEL_FEED    = 'div[role="feed"]'
SEL_ARTICLE = 'div[role="article"]'
SEL_COOKIE  = [
    'button[aria-label="Tout accepter"]',
    'button[aria-label="Accept all"]',
    'button[jsname="higCR"]',
    'form:nth-child(2) button',
]
SEL_END_OF_LIST = [
    'span:has-text("Vous avez atteint la fin")',
    'span:has-text("You\'ve reached the end")',
    'p:has-text("Vous avez atteint la fin")',
]

# Sélecteurs pour la fiche détaillée (après clic)
SEL_ADDRESS = [
    '[data-item-id="address"] .fontBodyMedium',
    '[data-item-id="address"] span:not([aria-hidden])',
    'button[data-item-id="address"]',
]
SEL_PHONE = [
    '[data-item-id*="phone:"] .fontBodyMedium',
    'button[data-item-id*="phone:"] span:not([aria-hidden])',
    '[data-tooltip*="phone"] .fontBodyMedium',
]
SEL_WEBSITE = [
    'a[data-item-id="authority"]',
    'a[jsaction*="website"]',
    'a[href^="http"][data-item-id]',
]
SEL_RATING = [
    'div.F7nice span[aria-hidden="true"]',
    'span.ceNzKf[aria-hidden="true"]',
    'div[jsaction*="rating"] span[aria-hidden]',
]
SEL_CATEGORY = [
    'button[jsaction*="pane.rating.category"]',
    'button.DkEaL',
    'span.DkEaL',
]


# ─── Cookies ─────────────────────────────────────────────────────────────────

async def accept_cookies(page) -> None:
    for sel in SEL_COOKIE:
        try:
            await page.click(sel, timeout=3000)
            log.info("Cookies acceptés.")
            await asyncio.sleep(random.uniform(0.5, 1.0))
            return
        except Exception:
            continue


# ─── Extraction depuis la fiche détaillée ────────────────────────────────────

async def _get_text(page, selectors: list[str]) -> str:
    """Essaie chaque sélecteur dans l'ordre, retourne le premier texte trouvé."""
    for sel in selectors:
        try:
            el = page.locator(sel).first
            if await el.count():
                text = (await el.inner_text(timeout=2000)).strip()
                if text:
                    return text
        except Exception:
            continue
    return ""


async def _get_attr(page, selectors: list[str], attr: str) -> str:
    for sel in selectors:
        try:
            el = page.locator(sel).first
            if await el.count():
                val = await el.get_attribute(attr, timeout=2000)
                if val:
                    return val.strip()
        except Exception:
            continue
    return ""


async def extract_detail(page, name: str) -> dict:
    """
    Extrait toutes les données depuis le panneau de détail (après clic sur la fiche).
    Chaque champ a plusieurs sélecteurs fallback.
    """
    data = {
        "nom":       name,
        "adresse":   "",
        "telephone": "",
        "site_web":  "",
        "note":      "",
        "nb_avis":   "",
        "categorie": "",
        "ville":     "",
        "code_postal": "",
    }

    try:
        # Adresse
        data["adresse"] = await _get_text(page, SEL_ADDRESS)

        # Téléphone
        data["telephone"] = await _get_text(page, SEL_PHONE)
        # Nettoyage : garder uniquement chiffres et +
        if data["telephone"]:
            tel_clean = re.sub(r"[^\d+\s\-()]", "", data["telephone"]).strip()
            data["telephone"] = tel_clean if len(tel_clean) >= 8 else ""

        # Site web (attribut href)
        data["site_web"] = await _get_attr(page, SEL_WEBSITE, "href")
        # Filtrer les URLs Google Maps elles-mêmes
        if data["site_web"] and "google.com" in data["site_web"]:
            data["site_web"] = ""

        # Note — texte du type "4,3"
        rating_text = await _get_text(page, SEL_RATING)
        if rating_text:
            match = re.search(r"\d[,\.]\d", rating_text)
            if match:
                data["note"] = match.group().replace(",", ".")

        # Nombre d'avis — texte du type "(127)"
        try:
            avis_el = page.locator('span[aria-label*="avis"]').first
            if await avis_el.count():
                avis_label = await avis_el.get_attribute("aria-label", timeout=2000) or ""
                m = re.search(r"([\d\s]+)\s*avis", avis_label)
                if m:
                    data["nb_avis"] = m.group(1).replace(" ", "").replace("\xa0", "")
        except Exception:
            pass

        # Catégorie
        data["categorie"] = await _get_text(page, SEL_CATEGORY)

        # Extraire ville et code postal depuis l'adresse
        if data["adresse"]:
            cp_match = re.search(r"\b(\d{5})\b", data["adresse"])
            if cp_match:
                data["code_postal"] = cp_match.group(1)
            # Ville = segment après le code postal
            parts = data["adresse"].split(",")
            if len(parts) >= 2:
                last = parts[-1].strip()
                last = re.sub(r"^\d{5}\s*", "", last).strip()
                if last:
                    data["ville"] = last

    except Exception as e:
        log.debug(f"extract_detail error: {e}")

    return data


# ─── Scraper principal ────────────────────────────────────────────────────────

async def scrape_google_maps(
    search_query: str,
    max_results: int = 60,
    headless: bool = False,
) -> list[dict]:
    """
    Scrape Google Maps pour `search_query`.
    Clique sur chaque fiche pour extraire les données structurées complètes.
    """
    results: list[dict] = []
    seen_names: set[str] = set()

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=headless,
            slow_mo=30,
            args=[
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
            ],
        )
        context = await browser.new_context(
            viewport={"width": 1366, "height": 768},
            locale="fr-FR",
            timezone_id="Europe/Paris",
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
        )
        page = await context.new_page()

        if HAS_STEALTH:
            await stealth_async(page)

        log.info(f'Recherche : "{search_query}"')
        await page.goto("https://www.google.com/maps", wait_until="domcontentloaded")
        await asyncio.sleep(random.uniform(1.0, 2.0))

        await accept_cookies(page)

        # Saisie recherche
        await page.fill("input#searchboxinput", search_query)
        await asyncio.sleep(random.uniform(0.5, 1.2))
        await page.keyboard.press("Enter")

        # Attente du feed
        try:
            await page.wait_for_selector(SEL_FEED, timeout=15000)
        except PlaywrightTimeout:
            log.error("Le panneau de résultats n'est pas apparu.")
            await browser.close()
            return []

        await asyncio.sleep(random.uniform(1.5, 2.5))

        feed = page.locator(SEL_FEED)
        no_new_rounds = 0
        processed_count = 0   # nb d'articles déjà traités dans cette session

        while len(results) < max_results:
            # ── Vérifier fin de liste ─────────────────────────────────────
            for end_sel in SEL_END_OF_LIST:
                try:
                    if await page.locator(end_sel).count():
                        log.info("Fin de liste détectée.")
                        goto_extract = True
                        break
                except Exception:
                    pass
            else:
                goto_extract = False

            # ── Récupérer les articles actuellement visibles ───────────────
            all_items = await page.locator(SEL_ARTICLE).all()
            new_items = all_items[processed_count:]

            if not new_items and not goto_extract:
                no_new_rounds += 1
                if no_new_rounds >= 3:
                    log.info("Aucun nouvel article après 3 tentatives — fin.")
                    break
                await feed.evaluate("el => el.scrollBy(0, 2000)")
                await asyncio.sleep(random.uniform(1.5, 3.0))
                continue

            no_new_rounds = 0

            # ── Traiter chaque nouvel article ─────────────────────────────
            for item in new_items:
                if len(results) >= max_results:
                    break
                try:
                    name = (await item.get_attribute("aria-label") or "").strip()
                    if not name or name in seen_names:
                        continue
                    seen_names.add(name)

                    # Clic sur la fiche pour charger le panneau détail
                    await item.click()
                    await asyncio.sleep(random.uniform(1.8, 3.2))

                    # Extraction depuis le panneau de détail
                    data = await extract_detail(page, name)
                    results.append(data)
                    log.info(
                        f"[{len(results)}/{max_results}] {name} | "
                        f"{data['telephone'] or '—'} | "
                        f"{(data['site_web'] or '—')[:45]}"
                    )

                    # Délai humain entre fiches
                    await asyncio.sleep(random.uniform(0.8, 1.8))

                except Exception as e:
                    log.debug(f"Erreur sur une fiche : {e}")
                    continue

            processed_count = len(all_items)

            if goto_extract:
                break

            # Scroll pour charger la suite
            await feed.evaluate("el => el.scrollBy(0, 3000)")
            await asyncio.sleep(random.uniform(1.5, 3.0))

        await browser.close()

    log.info(f"Extraction terminée : {len(results)} établissements.")
    return results


# ─── Multi-localités ──────────────────────────────────────────────────────────

async def scrape_multi_locations(
    base_query: str,
    locations: list[str],
    max_per_location: int = 60,
    headless: bool = True,
) -> list[dict]:
    all_results: list[dict] = []
    seen: set[str] = set()

    for location in locations:
        query = f"{base_query} {location}"
        log.info(f"\n{'─'*55}\nLocalité : {location}\n{'─'*55}")
        try:
            batch = await scrape_google_maps(query, max_per_location, headless)
            for row in batch:
                key = f"{row['nom']}|{row['telephone']}"
                if key not in seen:
                    seen.add(key)
                    row["localite_recherche"] = location
                    all_results.append(row)
        except Exception as e:
            log.error(f"Erreur sur '{query}' : {e}")

    return all_results


# ─── Sauvegarde CSV ───────────────────────────────────────────────────────────

def save_to_csv(results: list[dict], output_file: str) -> None:
    if not results:
        log.warning("Aucun résultat.")
        return

    df = pd.DataFrame(results)
    cols = ["nom", "categorie", "note", "nb_avis", "adresse", "code_postal",
            "ville", "telephone", "site_web"]
    if "localite_recherche" in df.columns:
        cols.append("localite_recherche")
    df = df[[c for c in cols if c in df.columns]]
    df.to_csv(output_file, index=False, encoding="utf-8-sig")

    log.info(f"\n✓ {len(df)} leads → {output_file}")
    log.info(f"  Avec téléphone : {df['telephone'].astype(bool).sum()}")
    log.info(f"  Avec site web  : {df['site_web'].astype(bool).sum()}")
    log.info(f"  Avec note      : {df['note'].astype(bool).sum()}")


# ─── CLI ─────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="Google Maps scraper B2B — Trakr")
    p.add_argument("--query",    required=True)
    p.add_argument("--max",      type=int, default=60)
    p.add_argument("--headless", action="store_true")
    p.add_argument("--output",   default=None)
    p.add_argument("--locations", nargs="+",
                   help="Ex: --locations 'Lyon' 'Bordeaux' 'Marseille'")
    p.add_argument("--enrich",   action="store_true",
                   help="Pipeline complet : Sirène + SMTP/DNS + scoring fiabilité")
    p.add_argument("--no-smtp",  action="store_true")
    p.add_argument("--no-sirene", action="store_true")
    return p.parse_args()


async def main():
    args = parse_args()
    ts = datetime.now().strftime("%Y%m%d_%H%M")
    output = args.output or f"leads_{ts}.csv"

    if args.locations:
        results = await scrape_multi_locations(
            args.query, args.locations, args.max, args.headless
        )
    else:
        results = await scrape_google_maps(args.query, args.max, args.headless)

    if args.enrich and HAS_PIPELINE:
        log.info(f"\n{'═'*55}\nPIPELINE ENRICHISSEMENT\n{'═'*55}")
        leads = [
            Lead(
                nom=r.get("nom", ""),
                ville=r.get("ville", ""),
                code_postal=r.get("code_postal", ""),
                adresse=r.get("adresse", ""),
                telephone=r.get("telephone", ""),
                site_web=r.get("site_web", ""),
                note=r.get("note", ""),
                nb_avis=r.get("nb_avis", ""),
                categorie=r.get("categorie", ""),
                localite_recherche=r.get("localite_recherche", ""),
            )
            for r in results
        ]
        enriched_file = output.replace(".csv", "_enriched.csv")
        async with EnrichmentPipeline(
            verify_smtp=not args.no_smtp,
            enrich_sirene=not args.no_sirene,
            concurrency=4,
        ) as pipeline:
            enriched = await pipeline.enrich_batch(leads)
        save_enriched_csv(enriched, enriched_file)
        save_to_csv(results, output)  # CSV brut aussi

    elif args.enrich and not HAS_PIPELINE:
        log.error("--enrich : module enrichment/ introuvable.")
        save_to_csv(results, output)
    else:
        save_to_csv(results, output)


if __name__ == "__main__":
    asyncio.run(main())
