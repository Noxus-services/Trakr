"""
Crawleur de site web — extrait emails, noms et postes depuis :
  • Page d'accueil
  • Pages /contact, /equipe, /a-propos, /about, /team
  • Balises mailto: dans le HTML
  • Données structurées JSON-LD (schema.org)
"""

import asyncio
import json
import logging
import re
import unicodedata
from typing import Optional
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from .models import Contact, ContactSource, EmailResult, EmailVerdict

log = logging.getLogger("trakr.website")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

EMAIL_RE = re.compile(
    r"[a-zA-Z0-9._%+\-]{2,}@[a-zA-Z0-9.\-]{2,}\.[a-zA-Z]{2,6}"
)

# Faux positifs fréquents dans les sources JS/CSS
IGNORED_EMAIL_DOMAINS = {
    "example.com", "sentry.io", "w3.org", "schema.org", "google.com",
    "facebook.com", "twitter.com", "jsdelivr.net", "jquery.com",
    "cloudflare.com", "bootstrap.com", "fontawesome.com", "woocommerce.com",
    "wordpress.org", "gravatar.com", "yourdomain.com", "votresite.fr",
    "domain.com", "email.com", "acme.com",
}

# Pages candidates pour trouver contacts/emails (ordre = priorité)
CONTACT_PATHS = [
    "/contact", "/contact-us", "/nous-contacter", "/contactez-nous",
    "/equipe", "/team", "/notre-equipe", "/a-propos", "/about",
    "/about-us", "/qui-sommes-nous", "/direction", "/management",
    "/mentions-legales", "/legal",
]

# Mots-clés indiquant un poste de décideur dans le texte autour d'un email/nom
DECISION_KEYWORDS = [
    "directeur", "gérant", "président", "fondateur", "responsable",
    "manager", "chef", "pdg", "dg", "ceo", "coo", "cto", "direction",
]


async def crawl(url: str, client: httpx.AsyncClient) -> list[EmailResult]:
    """
    Point d'entrée principal.
    Crawle le site et retourne tous les emails uniques trouvés, classés par confiance.
    """
    if not url:
        return []

    base = _normalize_url(url)
    if not base:
        return []

    emails_found: dict[str, EmailResult] = {}

    # Pages à visiter : accueil + pages contact/equipe
    pages_to_visit = [base] + [urljoin(base, p) for p in CONTACT_PATHS]

    # On visite les 5 premières pages en parallèle (accueil + 4 candidates)
    tasks = [_fetch_page(u, client) for u in pages_to_visit[:6]]
    htmls = await asyncio.gather(*tasks, return_exceptions=True)

    for i, html in enumerate(htmls):
        if isinstance(html, Exception) or not html:
            continue
        page_url = pages_to_visit[i]
        is_contact_page = i > 0  # pages /contact et suivantes

        soup = BeautifulSoup(html, "lxml")
        page_emails = _extract_emails_from_soup(soup, page_url, is_contact_page)

        for e in page_emails:
            if e.address not in emails_found:
                emails_found[e.address] = e
            else:
                # Garder la confiance la plus haute
                if e.confidence > emails_found[e.address].confidence:
                    emails_found[e.address] = e

    result = sorted(emails_found.values(), key=lambda e: -e.confidence)
    return result


def _extract_emails_from_soup(
    soup: BeautifulSoup,
    page_url: str,
    is_contact_page: bool,
) -> list[EmailResult]:
    """Extrait les emails depuis une page HTML parsée."""
    results: list[EmailResult] = []
    found: set[str] = set()

    # 1. Balises <a href="mailto:..."> — très fiables
    for a in soup.find_all("a", href=re.compile(r"^mailto:", re.I)):
        email = a["href"].replace("mailto:", "").split("?")[0].strip().lower()
        if _valid_email(email) and email not in found:
            found.add(email)
            confidence = 82 if is_contact_page else 75
            if _is_generic(email):
                confidence -= 20
            results.append(EmailResult(
                address=email,
                verdict=EmailVerdict.PROBABLE,
                confidence=confidence,
                source=f"mailto_tag:{page_url}",
            ))

    # 2. JSON-LD schema.org (très fiable si présent)
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            emails_in_ld = _extract_from_jsonld(data)
            for email in emails_in_ld:
                if email not in found:
                    found.add(email)
                    results.append(EmailResult(
                        address=email,
                        verdict=EmailVerdict.PROBABLE,
                        confidence=85,
                        source=f"json_ld:{page_url}",
                    ))
        except Exception:
            pass

    # 3. Texte visible de la page (fiable sur pages contact/équipe)
    visible_text = soup.get_text(" ")
    for email in EMAIL_RE.findall(visible_text):
        email = email.lower().strip(".")
        if _valid_email(email) and email not in found:
            found.add(email)
            confidence = 70 if is_contact_page else 55
            if _is_generic(email):
                confidence -= 15
            results.append(EmailResult(
                address=email,
                verdict=EmailVerdict.PROBABLE,
                confidence=confidence,
                source=f"page_text:{page_url}",
            ))

    return results


def _extract_from_jsonld(data) -> list[str]:
    """Extrait récursivement les emails depuis un objet JSON-LD."""
    emails = []
    if isinstance(data, dict):
        for key in ("email", "contactEmail", "Email"):
            val = data.get(key, "")
            if val and "@" in str(val):
                emails.append(str(val).lower().strip())
        for v in data.values():
            emails.extend(_extract_from_jsonld(v))
    elif isinstance(data, list):
        for item in data:
            emails.extend(_extract_from_jsonld(item))
    return emails


def generate_email_patterns(
    prenom: str,
    nom: str,
    domain: str,
) -> list[EmailResult]:
    """
    Génère tous les patterns d'email possibles pour un contact.
    Retourne une liste triée par confiance décroissante.
    """
    if not prenom or not nom or not domain:
        return []

    p  = _clean_name(prenom)
    n  = _clean_name(nom)
    p1 = p[0] if p else ""
    n1 = n[0] if n else ""

    patterns = [
        (f"{p}.{n}@{domain}",    88, "prenom.nom"),
        (f"{p1}.{n}@{domain}",   76, "p.nom"),
        (f"{p}{n}@{domain}",     65, "prenomnom"),
        (f"{p1}{n}@{domain}",    62, "pnom"),
        (f"{n}.{p}@{domain}",    58, "nom.prenom"),
        (f"{n}{p1}@{domain}",    52, "nomp"),
        (f"{p}_{n}@{domain}",    48, "prenom_nom"),
        (f"{n}@{domain}",        42, "nom seul"),
        (f"contact@{domain}",    38, "générique contact"),
        (f"info@{domain}",       30, "générique info"),
        (f"direction@{domain}",  25, "générique direction"),
    ]

    results = []
    seen = set()
    for email, confidence, pattern_name in patterns:
        if email not in seen:
            seen.add(email)
            results.append(EmailResult(
                address=email,
                verdict=EmailVerdict.GENERIC if "générique" in pattern_name else EmailVerdict.PATTERN,
                confidence=confidence,
                source=f"pattern:{pattern_name}",
                patterns_tried=[pattern_name],
            ))

    return results


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _clean_name(s: str) -> str:
    s = s.lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9]", "", s)
    return s


def _normalize_url(url: str) -> str:
    if not url:
        return ""
    if not url.startswith("http"):
        url = "https://" + url
    try:
        p = urlparse(url)
        return f"{p.scheme}://{p.netloc}"
    except Exception:
        return ""


def _valid_email(email: str) -> bool:
    if not EMAIL_RE.fullmatch(email):
        return False
    domain = email.split("@")[-1].lower()
    if domain in IGNORED_EMAIL_DOMAINS:
        return False
    if domain.endswith((".png", ".jpg", ".svg", ".gif", ".js", ".css")):
        return False
    if len(email) > 80:
        return False
    return True


def _is_generic(email: str) -> bool:
    local = email.split("@")[0].lower()
    return local in {
        "contact", "info", "hello", "bonjour", "accueil", "direction",
        "admin", "support", "commercial", "secretariat", "reception",
        "noreply", "no-reply", "webmaster", "postmaster",
    }


async def _fetch_page(url: str, client: httpx.AsyncClient) -> Optional[str]:
    try:
        r = await client.get(url, headers=HEADERS, follow_redirects=True, timeout=12)
        if r.status_code == 200 and "text/html" in r.headers.get("content-type", ""):
            return r.text
    except Exception:
        pass
    return None
