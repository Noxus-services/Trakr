from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.prospect import Prospect

TARGET_NAF_CODES = {
    "5610A", "5610C", "5630Z",  # restauration
    "5510Z",                     # hôtellerie
    "4711D",                     # supermarchés
    "1013A", "1089Z",            # IAA
}


def compute_icp_score(prospect: "Prospect") -> int:
    score = 0

    # +30 si code NAF dans liste cible
    if prospect.code_naf and prospect.code_naf in TARGET_NAF_CODES:
        score += 30

    # +20 si effectif 10-200
    if prospect.effectif and 10 <= prospect.effectif <= 200:
        score += 20

    # +15 si établissement créé < 5 ans
    if prospect.date_creation:
        age_years = (datetime.now(timezone.utc) - prospect.date_creation.replace(tzinfo=timezone.utc)).days / 365
        if age_years < 5:
            score += 15

    # +20 si téléphone trouvé
    if prospect.tel:
        score += 20

    # +15 si email trouvé
    if prospect.email:
        score += 15

    return min(score, 100)
