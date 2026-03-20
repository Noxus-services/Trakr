"""Scraper Google Maps — Playwright stealth + enrichissement email/socials."""
import asyncio
import random
import re
from typing import Optional

import httpx
from playwright.async_api import async_playwright, BrowserContext, Page
from playwright_stealth import stealth_async


async def fetch_contact_info(url: str) -> dict:
    """Visite le site web et extrait emails + réseaux sociaux."""
    if not url or "google.com" in url:
        return {"email": None, "socials": None}

    result: dict = {"email": None, "socials": None}
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, connect=5.0),
            follow_redirects=True,
            verify=False,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36"},
        ) as client:
            resp = await client.get(url)
            content = resp.text

            INVALID_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".pdf"}
            emails = {
                e for e in re.findall(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", content)
                if not any(e.lower().endswith(ext) for ext in INVALID_EXTS)
                and "example" not in e
                and "sentry" not in e
            }
            if emails:
                priority = sorted(emails, key=lambda e: (
                    0 if any(k in e.lower() for k in ("contact", "info", "direction", "accueil")) else 1
                ))
                result["email"] = ", ".join(priority[:2])

            socials = []
            for pattern in [
                r"https?://(?:www\.)?instagram\.com/[a-zA-Z0-9._/\-]+",
                r"https?://(?:www\.)?facebook\.com/[a-zA-Z0-9._/\-]+",
                r"https?://(?:www\.)?linkedin\.com/company/[a-zA-Z0-9._/\-]+",
                r"https?://(?:www\.)?x\.com/[a-zA-Z0-9._/\-]+",
            ]:
                m = re.search(pattern, content)
                if m:
                    socials.append(m.group(0).rstrip("/"))
            if socials:
                result["socials"] = ", ".join(socials)
    except Exception:
        pass
    return result


def _extract_postal_code(text: str) -> Optional[str]:
    m = re.search(r"\b\d{5}\b", text)
    return m.group() if m else None


async def _human_delay(min_ms: int = 800, max_ms: int = 2400) -> None:
    await asyncio.sleep(random.uniform(min_ms / 1000, max_ms / 1000))


async def _accept_cookies(page: Page) -> None:
    selectors = [
        'button[aria-label="Tout accepter"]',
        'button[jsname="higCR"]',
        'button:has-text("Tout accepter")',
        'button:has-text("Accept all")',
    ]
    for sel in selectors:
        try:
            btn = page.locator(sel).first
            if await btn.is_visible(timeout=2500):
                await btn.click()
                await _human_delay(400, 900)
                return
        except Exception:
            continue


async def _scroll_feed(page: Page, max_results: int) -> None:
    try:
        await page.locator('div[role="feed"]').wait_for(timeout=12000)
    except Exception:
        return
    feed = page.locator('div[role="feed"]')
    last_count = 0
    stale = 0
    while True:
        count = await page.locator('div[role="article"]').count()
        if count >= max_results:
            break
        for txt in ["Vous avez atteint la fin", "end of the list"]:
            if await page.locator(f'span:has-text("{txt}")').count() > 0:
                return
        await feed.evaluate("el => el.scrollBy(0, 3000)")
        await _human_delay(1800, 3200)
        new_count = await page.locator('div[role="article"]').count()
        stale = 0 if new_count > last_count else stale + 1
        if stale >= 3:
            break
        last_count = new_count


async def _extract_detail(page: Page, name: str) -> dict:
    data: dict = {"raison_sociale": name}

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

    for sel in ['[data-item-id="address"] .fontBodyMedium', 'button[data-item-id="address"] span.fontBodyMedium']:
        addr = await _text(sel)
        if addr:
            data["adresse"] = addr
            data["code_postal"] = _extract_postal_code(addr)
            break

    for sel in ['[data-item-id*="phone"] .fontBodyMedium', 'button[data-item-id*="phone"] span']:
        tel = await _text(sel)
        if tel:
            data["tel"] = re.sub(r"[\s.\-]", "", tel)
            break

    site_url = None
    for sel in ['a[data-item-id="authority"]', 'a[aria-label*="site"]']:
        url = await _attr(sel, "href")
        if url and url.startswith("http"):
            site_url = url
            data["site_web"] = url
            break

    for sel in ['span[aria-label*="etoile"]', 'span[aria-label*="star"]']:
        txt = await _text(sel)
        if txt:
            m = re.search(r"[\d,\.]+", txt)
            if m:
                data["google_rating"] = float(m.group().replace(",", "."))
            break

    cat = await _text('button[jsaction*="category"]')
    if cat:
        data["categorie"] = cat

    if site_url:
        enrichment = await fetch_contact_info(site_url)
        if enrichment.get("email"):
            data["email"] = enrichment["email"]
        if enrichment.get("socials"):
            data["socials"] = enrichment["socials"]

    return data


async def scrape_google_maps_playwright(
    keyword: str,
    city: str,
    max_results: int = 50,
) -> list[dict]:
    results: list[dict] = []
    seen_names: set[str] = set()

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
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
            await page.goto("https://www.google.com/maps", wait_until="networkidle")
            await _human_delay(800, 1600)
            await _accept_cookies(page)

            await page.fill('input#searchboxinput', f"{keyword} {city}")
            await _human_delay(400, 900)
            await page.keyboard.press("Enter")

            try:
                await page.wait_for_selector('div[role="feed"]', timeout=15000)
            except Exception:
                return []

            await _human_delay(1000, 2000)
            await _scroll_feed(page, max_results)

            articles = await page.locator('div[role="article"]').all()

            for article in articles[:max_results]:
                if len(results) >= max_results:
                    break
                try:
                    raw_name = (await article.get_attribute("aria-label") or "").strip()
                    if not raw_name:
                        continue
                    norm = raw_name.lower().strip().replace("'", "").replace("-", "")
                    if norm in seen_names:
                        continue
                    seen_names.add(norm)
                    await article.click()
                    await _human_delay(1500, 2800)
                    data = await _extract_detail(page, raw_name)
                    data["source"] = "google_maps"
                    data["status"] = "new"
                    data["email_verified"] = False
                    data["unsubscribed"] = False
                    results.append(data)
                except Exception:
                    continue
        finally:
            await browser.close()

    return results
