"""
Modèles de données du pipeline d'enrichissement.
Chaque champ dispose d'un indice de fiabilité (0–100).
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class EmailVerdict(str, Enum):
    """Résultat de la vérification SMTP/DNS."""
    VERIFIED   = "verified"    # MX + SMTP accepté
    PROBABLE   = "probable"    # MX OK, SMTP non testable (greylisting/timeout)
    PATTERN    = "pattern"     # Email généré par pattern, non vérifié
    INVALID    = "invalid"     # MX introuvable ou SMTP rejeté
    GENERIC    = "generic"     # contact@, info@, boîte générique


class ContactSource(str, Enum):
    REGISTRE_OFFICIEL = "registre_officiel"   # Sirène INSEE / infogreffe
    WEBSITE_SCRAPED   = "website_scraped"     # Trouvé sur le site web
    PATTERN_GENERATED = "pattern_generated"   # Généré par pattern prenom.nom@
    LINKEDIN_INFERRED = "linkedin_inferred"   # Déduit depuis LinkedIn public


@dataclass
class EmailResult:
    """Email avec métadonnées de fiabilité."""
    address:    str
    verdict:    EmailVerdict
    confidence: int                    # 0–100
    source:     str                    # d'où vient cet email
    mx_valid:   bool = False
    smtp_code:  Optional[int] = None   # 250 = accepté, 550 = rejeté, None = non testé
    patterns_tried: list[str] = field(default_factory=list)

    @property
    def reliability_label(self) -> str:
        mapping = {
            EmailVerdict.VERIFIED:  "✅ Vérifié",
            EmailVerdict.PROBABLE:  "🟡 Probable",
            EmailVerdict.PATTERN:   "🔵 Pattern",
            EmailVerdict.INVALID:   "❌ Invalide",
            EmailVerdict.GENERIC:   "⚪ Générique",
        }
        return mapping.get(self.verdict, "?")


@dataclass
class Contact:
    """Décideur trouvé pour une entreprise."""
    prenom:          str
    nom:             str
    poste:           str                  # titre / qualité officielle
    source:          ContactSource
    emails:          list[EmailResult] = field(default_factory=list)
    decision_score:  int = 0             # 0–100 : importance décisionnelle
    reliability:     int = 0             # 0–100 : fiabilité globale du contact

    @property
    def best_email(self) -> Optional[EmailResult]:
        if not self.emails:
            return None
        return max(self.emails, key=lambda e: e.confidence)

    @property
    def display_name(self) -> str:
        parts = [p for p in [self.prenom, self.nom] if p]
        return " ".join(parts) or "—"


@dataclass
class Lead:
    """Entreprise issue de Google Maps, prête pour enrichissement."""
    # Données brutes Maps
    nom:          str
    adresse:      str      = ""
    ville:        str      = ""
    code_postal:  str      = ""
    telephone:    str      = ""
    site_web:     str      = ""
    note:         str      = ""
    nb_avis:      str      = ""
    categorie:    str      = ""

    # Enrichissement Sirène
    siret:        str      = ""
    siren:        str      = ""
    code_naf:     str      = ""
    effectif:     str      = ""
    forme_jur:    str      = ""

    # Contacts trouvés
    contacts:     list[Contact] = field(default_factory=list)

    # Score global
    icp_score:    int = 0          # Ideal Customer Profile (0–100)
    enrichment_score: int = 0      # Qualité d'enrichissement (0–100)

    # Meta
    localite_recherche: str = ""
    source: str = "google_maps"
