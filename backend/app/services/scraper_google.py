"""Scraper Google Maps — Playwright stealth, aucune clé API requise."""
import asyncio
import random
import re
from typing import Optional
from playwright.async_api import async_playwright, Page, BrowserContext


def _extract_postal_code(text: str) -> Optional[str]:
    m = re.search(r"\b\d{5}\b", text)
    return m.group() if m else None


async def _human_delay(min_ms: int = 800, max_ms: int = 2200) -> None:
    await asyncio.sleep(random.uniform(min_ms / 1000, max_ms / 1000))


async def _accept_cookies(page: Page) -> None:
    selectors = [
        'button[aria-label*="Tout accepter"]',
        'button[jsname="higCR"]',
        'form:nth-child(2) button',
        'button:has-text("Tout accepter")',
        'button:has-text("Accept all")',
    ]
    for sel in selectors:
        try:
            btn = page.locator(sel).first
            if await btn.is_visible(timeout=2000):
                await btn.click()
                await _human_delay(400, 900)
                return
        except Exception:
            continue


async def _scroll_feed(page: Page, max_results: int) -> None:
    try:
        feed = page.locator('div[role="feed"]')
        await feed.wait_for(timeout=12000)
    except Exception:
        return

    last_count = 0
    stale_rounds = 0

    while True:
        current_count = await page.locator('div[role="article"]').count()
        if current_count >= max_results:
            break
        for txt in ["Vous avez atteint la fin", "end of the list"]:
            if await page.locator(f'span:has-text("{txt}")').count() > 0:
                return
        await feed.evaluate("el => el.scrollBy(0, 2500)")
        await _human_delay(1400, 2800)
        new_count = await page.locator('div[role="article"]').count()
        if new_count == last_count:
            stale_rounds += 1
            if stale_rounds >= 3:
                break
        else:
            stale_rounds = 0
        last_count = new_count


async def _extract_detail(page: Page, name: str) -> dict:
    data: dict = {"raison_sociale": name}

    async def _text(selector: str) -> Optional[str]:
        try:
            loc = page.locator(selector).first
            if await loc.count() > 0 and await loc.is_visible(timeout=1500):
                return (await loc.inner_text()).strip() or None
        except Exception:
            pass
        return None

    async def _attr(selector: str, attr: str) -> Optional[str]:
        try:
            loc = page.locator(selector).first
            if await loc.count() > 0:
                return await loc.get_attribute(attr)
        except Exception:
            pass
        return None

    for sel in [
        '[data-item-id="address"] .fontBodyMedium',
        'button[data-item-id="address"] span.fontBodyMedium',
    ]:
        addr = await _text(sel)
        if addr:
            data["adresse"] = addr
            data["code_postal"] = _extract_postal_code(addr)
            break

    for sel in [
        '[data-item-id*="phone"] .fontBodyMedium',
        'button[data-item-id*="phone"] span',
    ]:
        tel = await _text(sel)
        if tel:
            data["tel"] = re.sub(r"[\s.\-]", "", tel)
            break

    for sel in ['a[data-item-id="authority"]', 'a[aria-label*="site"]']:
        url = await _attr(sel, "href")
        if url and url.startswith("http"):
            data["site_web"] = url
            break

    for sel in ['span[aria-label*="étoile"]', 'span[aria-label*="star"]']:
        rating_txt = await _text(sel)
        if rating_txt:
            m = re.search(r"[\d,\.]+", rating_txt)
            if m:
                data["google_rating"] = float(m.group().replace(",", "."))
            break

    cat = await _text('button[jsaction*="category"]')
    if cat:
        data["categorie"] = cat

    return data


async def scrape_google_maps_playwright(
    keyword: str,
    city: str,
    max_results: int = 50,
) -> list[dict]:
    results: list[dict] = []
    seen: set[str] = set()

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
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1366, "height": 768},
            locale="fr-FR",
            timezone_id="Europe/Paris",
        )
        await ctx.add_init_script(
            "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});"
            "window.chrome={runtime:{}};"
        )
        page = await ctx.new_page()
        try:
            await page.goto("https://www.google.com/maps", wait_until="domcontentloaded")
            await _human_delay(800, 1600)
            await _accept_cookies(page)

            await page.fill('input#searchboxinput', f"{keyword} {city}")
            await _human_delay(400, 900)
            await page.keyboard.press("Enter")

            try:
                await page.wait_for_selector('div[role="feed"]', timeout=15000)
            except Exception:
                await browser.close()
                return []

            await _human_delay(1000, 2000)
            await _scroll_feed(page, max_results)

            articles = await page.locator('div[role="article"]').all()

            for article in articles[:max_results]:
                try:
                    name = (await article.get_attribute("aria-label") or "").strip()
                    if not name or name in seen:
                        continue
                    seen.add(name)
                    await article.click()
                    await _human_delay(1500, 2800)
                    data = await _extract_detail(page, name)
                    data["source"] = "google_maps"
                    data["status"] = "new"
                    data["email_verified"] = False
                    results.append(data)
                except Exception:
                    continue
        finally:
            await browser.close()

    return results
