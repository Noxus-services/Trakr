"""
Scoring et déduplication des contacts.

Indice de fiabilité (0–100) par contact :
  Source officielle  → base haute
  Poste décisionnel  → bonus fort
  Email nominatif    → bonus
  Email vérifié SMTP → bonus fort
  Confirmé multi-source → bonus

Déduplication :
  - Par email exact
  - Fuzzy sur (prénom + nom) si disponible
"""

import logging
import re
import unicodedata
from typing import Optional

from .models import Contact, ContactSource, EmailVerdict

log = logging.getLogger("trakr.scorer")

# ─── Poids source ─────────────────────────────────────────────────────────────

SOURCE_BASE: dict[ContactSource, int] = {
    ContactSource.REGISTRE_OFFICIEL: 40,
    ContactSource.WEBSITE_SCRAPED:   25,
    ContactSource.PATTERN_GENERATED: 12,
    ContactSource.LINKEDIN_INFERRED: 18,
}

# ─── Poids poste (décision score) ─────────────────────────────────────────────

ROLE_PRIORITY: dict[str, int] = {
    "gérant":              35,
    "co-gérant":           33,
    "associé gérant":      33,
    "propriétaire":        32,
    "président":           32,
    "directeur général":   32,
    "pdg":                 32,
    "dg":                  30,
    "directeur":           28,
    "fondateur":           27,
    "responsable qse":     26,
    "responsable qualité": 25,
    "responsable hygiène": 25,
    "responsable":         20,
    "chef de cuisine":     18,
    "chef":                15,
    "manager":             14,
    "autre":               8,
    "dirigeant":           20,
}

# ─── Poids email ──────────────────────────────────────────────────────────────

EMAIL_VERDICT_BONUS: dict[EmailVerdict, int] = {
    EmailVerdict.VERIFIED:  28,
    EmailVerdict.PROBABLE:  18,
    EmailVerdict.PATTERN:   10,
    EmailVerdict.GENERIC:    5,
    EmailVerdict.INVALID:    0,
}


def score_contact(contact: Contact) -> int:
    """
    Calcule le score de fiabilité global d'un contact (0–100).

    Décomposition :
      source_base      : 0–40   (source des données)
      decision_bonus   : 0–35   (importance du poste)
      email_bonus      : 0–28   (présence + qualité email)
      nominatif_bonus  : 0–10   (email = prenom.nom vs contact@)
      confidence_bonus : 0–10   (confiance email source / 10)
    """
    score = SOURCE_BASE.get(contact.source, 10)

    # Bonus poste
    poste = (contact.poste or "").lower()
    role_score = 8  # défaut
    for role, pts in ROLE_PRIORITY.items():
        if role in poste:
            role_score = pts
            break
    score += role_score

    # Bonus email
    best = contact.best_email
    if best:
        score += EMAIL_VERDICT_BONUS.get(best.verdict, 0)
        # Bonus supplémentaire si email nominatif (contient le nom)
        if _is_nominative_email(best.address, contact.prenom, contact.nom):
            score += 10
        # Bonus confiance source
        score += best.confidence // 10

    return min(score, 100)


def score_decision(poste: str) -> int:
    """Retourne l'importance décisionnelle d'un poste (0–100)."""
    p = poste.lower()
    for role, pts in ROLE_PRIORITY.items():
        if role in p:
            return min(pts * 2, 100)
    return 20


def rank_contacts(contacts: list[Contact]) -> list[Contact]:
    """Trie les contacts par score décroissant, recalcule les scores."""
    for c in contacts:
        c.reliability = score_contact(c)
    return sorted(contacts, key=lambda c: -c.reliability)


# ─── Déduplication ────────────────────────────────────────────────────────────

def deduplicate(contacts: list[Contact]) -> list[Contact]:
    """
    Fusionne les doublons :
      1. Email exact → garder le plus fiable
      2. Nom fuzzy (ratio > 80%) → fusionner les champs complémentaires
    """
    if not contacts:
        return []

    # Phase 1 : dédup par email exact
    by_email: dict[str, Contact] = {}
    no_email: list[Contact] = []

    for c in contacts:
        email = c.best_email
        if email and email.verdict != EmailVerdict.INVALID:
            key = email.address.lower()
            if key in by_email:
                existing = by_email[key]
                by_email[key] = _merge(existing, c)
            else:
                by_email[key] = c
        else:
            no_email.append(c)

    merged = list(by_email.values())

    # Phase 2 : dédup par nom fuzzy sur les contacts sans email
    for c in no_email:
        match = _find_name_match(c, merged)
        if match:
            idx = merged.index(match)
            merged[idx] = _merge(match, c)
        else:
            merged.append(c)

    return rank_contacts(merged)


def _merge(a: Contact, b: Contact) -> Contact:
    """Fusionne deux contacts en conservant les meilleures données."""
    # Choisir la source la plus fiable comme base
    base, other = (a, b) if score_contact(a) >= score_contact(b) else (b, a)

    # Compléter les champs manquants
    if not base.prenom and other.prenom:
        base.prenom = other.prenom
    if not base.nom and other.nom:
        base.nom = other.nom
    if not base.poste or base.poste == "Dirigeant":
        if other.poste and other.poste != "Dirigeant":
            base.poste = other.poste

    # Fusionner les emails (éviter doublons)
    existing_addrs = {e.address for e in base.emails}
    for email in other.emails:
        if email.address not in existing_addrs:
            base.emails.append(email)
            existing_addrs.add(email.address)

    # Trier les emails par confiance
    base.emails.sort(key=lambda e: -e.confidence)

    return base


def _find_name_match(contact: Contact, pool: list[Contact]) -> Optional[Contact]:
    """Cherche un contact dans pool dont le nom est similaire (fuzzy > 80%)."""
    if not contact.nom:
        return None
    target = _normalize(f"{contact.prenom} {contact.nom}")
    for c in pool:
        candidate = _normalize(f"{c.prenom} {c.nom}")
        if _fuzzy_ratio(target, candidate) > 80:
            return c
    return None


# ─── Scoring ICP entreprise ────────────────────────────────────────────────────

NAF_ICP_SCORES: dict[str, int] = {
    # Restauration — cible principale
    "56.10A": 90, "5610A": 90,
    "56.10C": 85, "5610C": 85,
    "56.30Z": 80, "5630Z": 80,
    # Hôtellerie
    "55.10Z": 88, "5510Z": 88,
    # Grande distribution alimentaire
    "47.11D": 75, "4711D": 75,
    "47.11F": 70, "4711F": 70,
    # IAA
    "10.13A": 72, "1013A": 72,
    "10.89Z": 68, "1089Z": 68,
    "10.20Z": 65, "1020Z": 65,
    # Santé
    "86.10Z": 82, "8610Z": 82,
    "86.21Z": 78, "8621Z": 78,
    # EHPAD
    "87.10A": 85, "8710A": 85,
    "87.10B": 83, "8710B": 83,
}

EFFECTIF_BONUS: dict[str, int] = {
    "0 salarié": -10,
    "1–2":        0,
    "3–5":        5,
    "6–9":       10,
    "10–19":     15,
    "20–49":     20,
    "50–99":     25,
    "100–199":   30,
    "200–249":   35,
}


def compute_icp_score(code_naf: str, effectif: str, note: str, nb_avis: str) -> int:
    """
    Calcule le score ICP (Ideal Customer Profile) d'une entreprise.
    Retourne 0–100.
    """
    # Base NAF
    naf_clean = code_naf.replace(".", "")
    score = NAF_ICP_SCORES.get(code_naf, NAF_ICP_SCORES.get(naf_clean, 40))

    # Bonus effectif
    score += EFFECTIF_BONUS.get(effectif, 0)

    # Bonus note Google (entreprise active, clientèle établie)
    try:
        n = float(note.replace(",", "."))
        if n >= 4.5:
            score += 5
        elif n >= 4.0:
            score += 3
        elif n < 3.0:
            score -= 5
    except (ValueError, AttributeError):
        pass

    # Bonus nombre d'avis (indicateur de taille/activité)
    try:
        nb = int(str(nb_avis).replace(" ", "").replace("\xa0", ""))
        if nb >= 500:
            score += 8
        elif nb >= 100:
            score += 5
        elif nb >= 20:
            score += 2
    except (ValueError, AttributeError):
        pass

    return max(0, min(score, 100))


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _normalize(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", " ", s).strip()


def _fuzzy_ratio(a: str, b: str) -> int:
    """Ratio de similarité simplifié sans bibliothèque externe (0–100)."""
    if a == b:
        return 100
    if not a or not b:
        return 0
    wa, wb = set(a.split()), set(b.split())
    if not wa or not wb:
        return 0
    common = wa & wb
    ratio = 2 * len(common) / (len(wa) + len(wb))
    return int(ratio * 100)


def _is_nominative_email(email: str, prenom: str, nom: str) -> bool:
    """Vérifie si l'email contient le nom de famille (email non générique)."""
    if not nom or not email:
        return False
    local = email.split("@")[0].lower()
    nom_clean = _normalize(nom).replace(" ", "")
    return nom_clean in local and len(nom_clean) >= 3
