"""Scraper PagesJaunes via Playwright (headless)."""
import asyncio
import random
from typing import AsyncGenerator
from fake_useragent import UserAgent

ua = UserAgent()

DELAY_MIN = 2.0
DELAY_MAX = 5.0
BASE_URL = "https://www.pagesjaunes.fr/annuaire/chercherlespros"


async def _random_delay():
    await asyncio.sleep(random.uniform(DELAY_MIN, DELAY_MAX))


async def scrape_pages_jaunes(quoi: str, ou: str, max_pages: int = 10) -> list[dict]:
    """Scrappe PagesJaunes avec Playwright headless."""
    from playwright.async_api import async_playwright

    results = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(user_agent=ua.random)
        page = await context.new_page()

        for page_num in range(1, max_pages + 1):
            url = f"{BASE_URL}?quoiqui={quoi}&ou={ou}&page={page_num}"
            try:
                await page.goto(url, wait_until="networkidle", timeout=30000)
                await _random_delay()

                listings = await page.query_selector_all(".bi-content")
                if not listings:
                    break

                for listing in listings:
                    item = await _parse_listing(listing)
                    if item:
                        results.append(item)

                # Check if next page exists
                next_btn = await page.query_selector(".pagination-next:not(.disabled)")
                if not next_btn:
                    break

            except Exception as e:
                print(f"PagesJaunes page {page_num} error: {e}")
                break

        await browser.close()

    return results


async def _parse_listing(el) -> dict | None:
    try:
        name_el = await el.query_selector(".bi-denomination")
        tel_el = await el.query_selector(".bi-phone")
        addr_el = await el.query_selector(".bi-address")
        website_el = await el.query_selector("a.bi-website")
        category_el = await el.query_selector(".bi-tags")

        name = await name_el.inner_text() if name_el else None
        if not name:
            return None

        tel_raw = await tel_el.get_attribute("href") if tel_el else None
        tel = tel_raw.replace("tel:", "").strip() if tel_raw else None

        addr_text = await addr_el.inner_text() if addr_el else ""
        parts = [p.strip() for p in addr_text.split("\n") if p.strip()]

        website = await website_el.get_attribute("href") if website_el else None
        category = await category_el.inner_text() if category_el else None

        # Parse address
        adresse, code_postal, ville = _parse_address(parts)

        return {
            "raison_sociale": name.strip(),
            "tel": tel,
            "adresse": adresse,
            "code_postal": code_postal,
            "ville": ville,
            "site_web": website,
            "code_naf": category,
            "source": "pages_jaunes",
        }
    except Exception:
        return None


def _parse_address(parts: list[str]) -> tuple[str | None, str | None, str | None]:
    import re
    adresse = ville = code_postal = None
    for part in parts:
        cp_match = re.search(r"\b(\d{5})\b\s*(.*)", part)
        if cp_match:
            code_postal = cp_match.group(1)
            ville = cp_match.group(2).strip() or None
        elif part and not adresse:
            adresse = part
    return adresse, code_postal, ville
