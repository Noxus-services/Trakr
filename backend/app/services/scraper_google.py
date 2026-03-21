"""
Scraper Google Maps — Playwright stealth + quadrillage GPS + enrichissement email/socials.
Architecture : Grid Search → Maps Worker → Enrichisseur
"""
import asyncio
import base64
import random
import re
from typing import Optional
from urllib.parse import quote_plus

import httpx
from playwright.async_api import async_playwright, BrowserContext, Page
from playwright_stealth import stealth_async

from app.services.grid_manager import generate_grid, geocode_city, get_city_coords


# ── Enrichisseur (HTTPX, pas de navigateur — 10x plus rapide) ─────────────────

async def fetch_contact_info(url: str) -> dict:
    """Visite le site web et ses pages Contact/Mentions pour extraire emails + réseaux sociaux."""
    if not url or "google.com" in url:
        return {"email": None, "socials": None}

    result: dict = {"email": None, "socials": None}
    found_emails: set[str] = set()
    found_socials: list[str] = []

    INVALID_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".pdf"}
    SOCIAL_PATTERNS = [
        r"https?://(?:www\.)?instagram\.com/[a-zA-Z0-9._/\-]{2,}",
        r"https?://(?:www\.)?facebook\.com/[a-zA-Z0-9._/\-]{2,}",
        r"https?://(?:www\.)?linkedin\.com/company/[a-zA-Z0-9._/\-]{2,}",
        r"https?://(?:www\.)?x\.com/[a-zA-Z0-9._/\-]{2,}",
        r"https?://(?:www\.)?twitter\.com/[a-zA-Z0-9._/\-]{2,}",
    ]

    def extract_from_content(content: str) -> None:
        emails = {
            e for e in re.findall(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", content)
            if not any(e.lower().endswith(ext) for ext in INVALID_EXTS)
            and "example" not in e and "sentry" not in e
            and "@2x" not in e and "noreply" not in e.lower()
        }
        found_emails.update(emails)

        for pattern in SOCIAL_PATTERNS:
            m = re.search(pattern, content)
            if m:
                social = m.group(0).rstrip("/")
                if social not in found_socials:
                    found_socials.append(social)

    def find_contact_links(content: str, base_url: str) -> list[str]:
        """Extrait les URLs de pages Contact/Mentions depuis le HTML."""
        links = []
        for m in re.finditer(r'href=["\']([^"\']+)["\']', content):
            href = m.group(1)
            if any(kw in href.lower() for kw in ("contact", "mentions", "legal", "about", "a-propos", "nous")):
                if href.startswith("http"):
                    links.append(href)
                elif href.startswith("/"):
                    # Construire URL absolue
                    from urllib.parse import urlparse
                    parsed = urlparse(base_url)
                    links.append(f"{parsed.scheme}://{parsed.netloc}{href}")
        return links[:3]  # Max 3 pages

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, connect=5.0),
            follow_redirects=True,
            verify=False,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
                "Accept-Language": "fr-FR,fr;q=0.9",
            },
        ) as client:
            # 1. Page d'accueil
            resp = await client.get(url)
            content = resp.text
            extract_from_content(content)

            # 2. Pages Contact / Mentions légales (si pas encore d'email)
            if not found_emails:
                contact_urls = find_contact_links(content, url)
                for contact_url in contact_urls:
                    try:
                        r2 = await client.get(contact_url)
                        extract_from_content(r2.text)
                        if found_emails:
                            break
                    except Exception:
                        continue

    except Exception:
        pass

    if found_emails:
        priority = sorted(found_emails, key=lambda e: (
            0 if any(k in e.lower() for k in ("contact", "info", "direction", "accueil", "hello")) else 1
        ))
        result["email"] = ", ".join(priority[:2])

    if found_socials:
        result["socials"] = ", ".join(found_socials[:4])

    return result


# ── Helpers ────────────────────────────────────────────────────────────────────

def _extract_postal_code(text: str) -> Optional[str]:
    m = re.search(r"\b\d{5}\b", text)
    return m.group() if m else None


async def _human_delay(min_ms: int = 800, max_ms: int = 2400) -> None:
    """Délai aléatoire simulant un comportement humain."""
    await asyncio.sleep(random.uniform(min_ms / 1000, max_ms / 1000))


async def _debug_snapshot(page: Page, label: str) -> None:
    """Log titre + screenshot base64 dans les logs Railway pour debug visuel."""
    try:
        title = await page.title()
        url = page.url
        print(f"[DEBUG:{label}] titre={title!r} url={url[:120]}", flush=True)
        shot = await page.screenshot(type="jpeg", quality=40, full_page=False)
        b64 = base64.b64encode(shot).decode()
        # Découper en chunks de 200 chars pour ne pas saturer une seule ligne
        print(f"[SCREENSHOT:{label}] data:image/jpeg;base64,{b64[:200]}…(tronqué)", flush=True)
    except Exception as e:
        print(f"[DEBUG:{label}] screenshot failed: {e}", flush=True)


async def _accept_cookies(page: Page) -> None:
    """
    Consentement Google — stratégie multi-couche pour Railway (Linux headless).

    Ordre de priorité :
    1. get_by_role("button").filter(has_text=regex) — le plus robuste, indépendant de la langue
    2. CSS selectors classiques (aria-label, jsname, classes)
    3. Iframe consent (ancienne UI)
    4. Formulaire consent.google.com
    """
    # Attendre que la popup soit visible (peut prendre 1-3s après domcontentloaded)
    await asyncio.sleep(2.5)

    title = await page.title()
    url = page.url
    print(f"[CONSENT] titre={title!r} url={url[:100]}", flush=True)

    # ── Stratégie 1 : get_by_role — force brute textuelle, indépendante de la langue ──
    # C'est la plus robuste sur les IPs datacenter où Google change ses sélecteurs
    try:
        consent_pattern = re.compile(
            r"(Tout accepter|Accept all|I agree|Accepter|J'accepte|Alle akzeptieren|Aceptar todo)",
            re.IGNORECASE,
        )
        btn = page.get_by_role("button").filter(has_text=consent_pattern)
        count = await btn.count()
        if count > 0:
            await btn.first.click()
            print("[CONSENT] ✅ Validé via get_by_role textuel", flush=True)
            await asyncio.sleep(2.0)
            return
    except Exception as e:
        print(f"[CONSENT] get_by_role échoué: {e}", flush=True)

    # ── Stratégie 2 : CSS selectors classiques ──
    css_selectors = [
        'button[aria-label="Tout accepter"]',
        'button[aria-label="Accept all"]',
        'button[jsname="higCR"]',
        'button.tHlp8d',          # Google 2024
        'button[jsname="b3VHJd"]', # variante
    ]
    for sel in css_selectors:
        try:
            btn = page.locator(sel).first
            if await btn.is_visible(timeout=1500):
                await btn.click()
                print(f"[CONSENT] ✅ Validé via CSS: {sel}", flush=True)
                await asyncio.sleep(2.0)
                return
        except Exception:
            continue

    # ── Stratégie 3 : Iframes (ancienne UI Google) ──
    for frame in page.frames:
        if "consent" in frame.url or ("google" in frame.url and frame.url != page.url):
            try:
                btn = frame.get_by_role("button").filter(has_text=re.compile(r"accept|accepter|agree", re.I))
                if await btn.count() > 0:
                    await btn.first.click()
                    print(f"[CONSENT] ✅ Validé dans iframe: {frame.url[:60]}", flush=True)
                    await asyncio.sleep(2.0)
                    return
            except Exception:
                continue

    # ── Stratégie 4 : consent.google.com — bouton "accepter" dans le form ──
    if "consent.google" in page.url:
        try:
            # Le dernier bouton du formulaire est généralement "Tout accepter"
            await page.locator("form button").last.click()
            print("[CONSENT] ✅ Validé via form button last", flush=True)
            await asyncio.sleep(2.0)
            return
        except Exception as e:
            print(f"[CONSENT] form button last échoué: {e}", flush=True)

    # Aucune stratégie n'a fonctionné — snapshot pour debug Railway
    print("[CONSENT] ⚠️ Aucun bouton trouvé — snapshot debug", flush=True)
    await _debug_snapshot(page, "consent-fail")


async def _scroll_feed(page: Page, max_results: int, feed_sel: str = 'div[role="feed"]') -> None:
    feed = page.locator(feed_sel)
    last_count = 0
    stale = 0
    while True:
        count = await page.locator('div[role="article"]').count()
        if count >= max_results:
            break
        for txt in ["Vous avez atteint la fin", "end of the list", "You've reached"]:
            if await page.locator(f'span:has-text("{txt}")').count() > 0:
                return
        await feed.evaluate("el => el.scrollBy(0, 3000)")
        await _human_delay(1500, 3000)
        new_count = await page.locator('div[role="article"]').count()
        stale = 0 if new_count > last_count else stale + 1
        if stale >= 3:
            break
        last_count = new_count


async def _extract_detail(page: Page, name: str, progress_cb=None) -> dict:
    """Extrait toutes les données d'une fiche établissement Maps."""
    data: dict = {"raison_sociale": name}
    if progress_cb:
        await progress_cb({"type": "enriching", "name": name})

    async def _text(sel: str) -> Optional[str]:
        try:
            loc = page.locator(sel).first
            if await loc.count() > 0 and await loc.is_visible(timeout=1500):
                return (await loc.inner_text()).strip() or None
        except Exception:
            pass
        return None

    async def _attr(sel: str, attr: str) -> Optional[str]:
        try:
            loc = page.locator(sel).first
            if await loc.count() > 0:
                return await loc.get_attribute(attr)
        except Exception:
            pass
        return None

    # Adresse
    for sel in ['[data-item-id="address"] .fontBodyMedium', 'button[data-item-id="address"] span.fontBodyMedium']:
        addr = await _text(sel)
        if addr:
            data["adresse"] = addr
            data["code_postal"] = _extract_postal_code(addr)
            break

    # Téléphone
    for sel in ['[data-item-id*="phone"] .fontBodyMedium', 'button[data-item-id*="phone"] span']:
        tel = await _text(sel)
        if tel:
            data["tel"] = re.sub(r"[\s.\-]", "", tel)
            break

    # Site web
    site_url = None
    for sel in ['a[data-item-id="authority"]', 'a[aria-label*="site"]', 'a[data-item-id*="website"]']:
        url = await _attr(sel, "href")
        if url and url.startswith("http"):
            site_url = url
            data["site_web"] = url
            break

    # Note Google
    for sel in ['span[aria-label*="étoile"]', 'span[aria-label*="etoile"]', 'span[aria-label*="star"]']:
        txt = await _text(sel)
        if txt:
            m = re.search(r"[\d,\.]+", txt)
            if m:
                data["google_rating"] = float(m.group().replace(",", "."))
            break

    # Nombre d'avis
    for sel in ['span[aria-label*="avis"]', 'span[aria-label*="review"]', 'button[aria-label*="avis"]']:
        txt = await _attr(sel, "aria-label") or await _text(sel)
        if txt:
            m = re.search(r"([\d\s]+)\s*avis", txt)
            if m:
                data["nb_avis"] = int(m.group(1).replace(" ", "").replace("\u202f", ""))
            break

    # Catégorie
    cat = await _text('button[jsaction*="category"]')
    if not cat:
        cat = await _text('span.fontBodyMedium.DkEaL')
    if cat:
        data["categorie"] = cat

    # Place ID Google (depuis l'URL)
    try:
        current_url = page.url
        m = re.search(r"place/[^/]+/([^/@?]+)", current_url)
        if not m:
            m = re.search(r"!1s(ChIJ[^!]+)!", current_url)
        if m:
            data["place_id"] = m.group(1)
    except Exception:
        pass

    # Enrichissement email + socials depuis le site web
    if site_url:
        enrichment = await fetch_contact_info(site_url)
        if enrichment.get("email"):
            data["email"] = enrichment["email"]
            if progress_cb:
                await progress_cb({"type": "contact", "name": name, "email": enrichment["email"]})
        if enrichment.get("socials"):
            data["socials"] = enrichment["socials"]

    return data


# ── Scraper principal ──────────────────────────────────────────────────────────

async def _scrape_single_url(
    page: Page,
    maps_url: str,
    keyword: str,
    max_results: int,
    seen_ids: set[str],
    seen_names: set[str],
    progress_cb=None,
) -> list[dict]:
    """Scrape une URL Maps (un point GPS) et retourne les résultats nouveaux."""
    results = []
    try:
        # "load" > "domcontentloaded" : Google Maps est 100% JS, le feed n'existe
        # dans le DOM qu'après l'exécution des scripts de rendu.
        await page.goto(maps_url, wait_until="load", timeout=30000)
        await asyncio.sleep(3.0)

        # Redirect consentement mid-navigation
        if "consent.google" in page.url:
            await _accept_cookies(page)
            await page.goto(maps_url, wait_until="load", timeout=30000)
            await asyncio.sleep(3.0)

        page_title = await page.title()
        print(f"[SCRAPE] url={maps_url[:80]} titre={page_title!r}", flush=True)

        # ── Attendre le feed avec sélecteurs alternatifs ──────────────────────
        # Google Maps peut utiliser des conteneurs différents selon la version UI
        FEED_SELECTORS = [
            'div[role="feed"]',
            'div[aria-label*="Résultats"]',
            'div[aria-label*="Results for"]',
            'div[aria-label*="résultats"]',
            'div.m6QErb[aria-label]',   # classe CSS interne Maps (stable en 2024)
        ]
        feed_sel_used = None
        for fs in FEED_SELECTORS:
            try:
                await page.locator(fs).wait_for(timeout=5000)
                feed_sel_used = fs
                break
            except Exception:
                continue

        # Si toujours pas de feed → interaction de secours (clic sur search + Enter)
        if not feed_sel_used:
            print("[FEED] Feed absent — tentative interaction search box", flush=True)
            try:
                search_box = page.locator('input[name="q"], input#searchboxinput').first
                if await search_box.is_visible(timeout=3000):
                    await search_box.click()
                    await asyncio.sleep(0.5)
                    await page.keyboard.press("Enter")
                    await asyncio.sleep(3.0)
                    # Réessayer après interaction
                    for fs in FEED_SELECTORS:
                        try:
                            await page.locator(fs).wait_for(timeout=8000)
                            feed_sel_used = fs
                            break
                        except Exception:
                            continue
            except Exception as e:
                print(f"[FEED] Interaction search box échouée: {e}", flush=True)

        if not feed_sel_used:
            page_url = page.url
            msg = f"Pas de feed — titre: {page_title!r}, url: {page_url[:80]}"
            print(f"[FEED-FAIL] {msg}", flush=True)
            await _debug_snapshot(page, "feed-fail")
            if progress_cb:
                await progress_cb({"type": "debug", "msg": msg})
            return []

        print(f"[FEED] ✅ Feed trouvé via: {feed_sel_used}", flush=True)

        await _scroll_feed(page, max_results, feed_sel_used)

        articles = await page.locator('div[role="article"]').all()
        for article in articles[:max_results]:
            if len(results) >= max_results:
                break
            try:
                raw_name = (await article.get_attribute("aria-label") or "").strip()
                if not raw_name:
                    continue
                norm = raw_name.lower().strip().replace("'", "").replace("-", "").replace(" ", "")
                if norm in seen_names:
                    continue
                seen_names.add(norm)

                await article.click()
                await _human_delay(1500, 2800)

                data = await _extract_detail(page, raw_name, progress_cb=progress_cb)

                # Déduplication par place_id
                place_id = data.get("place_id")
                if place_id and place_id in seen_ids:
                    continue
                if place_id:
                    seen_ids.add(place_id)

                data["source"] = "google_maps"
                data["status"] = "new"
                data["email_verified"] = False
                data["unsubscribed"] = False
                results.append(data)
                if progress_cb:
                    await progress_cb({"type": "company", "name": raw_name, "found": len(results)})
            except Exception:
                continue
    except Exception:
        pass
    return results


async def scrape_google_maps_playwright(
    keyword: str,
    city: str,
    max_results: int = 50,
    use_grid: bool = False,
    radius_km: float = 3.0,
    step_km: float = 1.0,
    progress_cb=None,
) -> list[dict]:
    """
    Scrape Google Maps avec Playwright stealth.

    Args:
        keyword: Mot-clé recherché (ex: "restaurant", "plombier")
        city: Ville (ex: "Lyon", "Paris")
        max_results: Nombre max de résultats à collecter
        use_grid: Si True, utilise le quadrillage GPS pour dépasser la limite 200
        radius_km: Rayon du quadrillage (km, utilisé si use_grid=True)
        step_km: Pas entre points GPS (km, utilisé si use_grid=True)
    """
    all_results: list[dict] = []
    seen_ids: set[str] = set()
    seen_names: set[str] = set()

    # Construire les URLs à visiter
    if use_grid:
        # Quadrillage GPS — pour dépasser la limite 200 résultats
        coords = get_city_coords(city)
        if coords is None:
            try:
                coords = await geocode_city(city)
            except ValueError:
                # Fallback: recherche classique si géocodage échoue
                use_grid = False

        if use_grid and coords:
            lat, lon = coords
            points = generate_grid(lat, lon, radius_km, step_km)
            kw_enc = quote_plus(keyword)
            urls = [
                f"https://www.google.com/maps/search/{kw_enc}/@{p[0]},{p[1]},14z"
                for p in points
            ]
        else:
            urls = [f"https://www.google.com/maps/search/{quote_plus(keyword)}+{quote_plus(city)}"]
    else:
        urls = [f"https://www.google.com/maps/search/{quote_plus(keyword)}+{quote_plus(city)}"]

    if progress_cb:
        await progress_cb({"type": "start", "keyword": keyword, "city": city, "total_urls": len(urls)})

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
        )
        ctx: BrowserContext = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            viewport={"width": 1366, "height": 768},
            locale="fr-FR",
            timezone_id="Europe/Paris",
        )
        page = await ctx.new_page()
        await stealth_async(page)

        try:
            # Accepter les cookies via google.com d'abord (évite la redirection consent en cours de scraping)
            await page.goto("https://www.google.com", wait_until="domcontentloaded", timeout=15000)
            await _accept_cookies(page)
            # Puis naviguer vers Maps
            await page.goto("https://www.google.com/maps", wait_until="domcontentloaded", timeout=15000)
            await asyncio.sleep(2.0)
            await _accept_cookies(page)  # Au cas où Maps affiche une 2e popup

            for i, url in enumerate(urls):
                if len(all_results) >= max_results:
                    break
                if progress_cb:
                    await progress_cb({"type": "searching", "url_index": i, "total_urls": len(urls)})
                remaining = max_results - len(all_results)
                batch = await _scrape_single_url(page, url, keyword, remaining, seen_ids, seen_names, progress_cb=progress_cb)
                all_results.extend(batch)

                if len(urls) > 1 and i < len(urls) - 1:
                    await _human_delay(1000, 2000)

        finally:
            await browser.close()

    return all_results[:max_results]
