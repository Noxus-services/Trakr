"""
Orchestrateur principal du pipeline d'enrichissement.

Pour chaque lead issu de Google Maps ou Sirène :
  1. Enrichissement Sirène (SIRET, dirigeants officiels)
  2. Crawl site web (emails depuis mailto, JSON-LD, texte)
  3. Génération patterns email pour les dirigeants sans email
  4. Vérification SMTP/DNS des emails candidats
  5. Fusion + déduplication des contacts
  6. Scoring ICP + fiabilité
  7. Export CSV enrichi

Usage CLI :
  python -m enrichment.pipeline --input leads_raw.csv --output leads_enriched.csv
Usage API :
  from enrichment import enrich_lead
  lead = await enrich_lead(lead_dict)
"""

import asyncio
import csv
import logging
import argparse
from dataclasses import asdict
from datetime import datetime
from typing import Optional

import httpx
import pandas as pd

from .models import Lead, Contact, ContactSource, EmailResult, EmailVerdict
from . import sirene as sirene_mod
from . import website as website_mod
from .email_verifier import verify_email, verify_batch
from .scorer import (
    deduplicate, rank_contacts, compute_icp_score,
    score_decision, score_contact,
)

log = logging.getLogger("trakr.pipeline")

# Concurrence : enrichir N leads en parallèle
PIPELINE_CONCURRENCY = 5
SMTP_VERIFY_TOP_N    = 3    # vérifie les N meilleurs emails par contact


class EnrichmentPipeline:
    """
    Pipeline complet d'enrichissement pour un lot de leads.
    Conçu pour être instancié une fois et réutilisé (partage le client HTTP).
    """

    def __init__(
        self,
        verify_smtp: bool = True,
        enrich_sirene: bool = True,
        crawl_website: bool = True,
        concurrency: int = PIPELINE_CONCURRENCY,
    ):
        self.verify_smtp    = verify_smtp
        self.enrich_sirene  = enrich_sirene
        self.crawl_website  = crawl_website
        self.concurrency    = concurrency
        self._client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self):
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(15.0),
            follow_redirects=True,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
        return self

    async def __aexit__(self, *_):
        if self._client:
            await self._client.aclose()

    # ─── Enrichissement d'un seul lead ────────────────────────────────────────

    async def enrich(self, lead: Lead) -> Lead:
        """Enrichit complètement un lead. Retourne le lead modifié."""
        log.info(f"▶ {lead.nom} ({lead.ville})")
        client = self._client

        # ── Étape 1 : Sirène (SIRET + dirigeants officiels) ──────────────────
        if self.enrich_sirene:
            try:
                lead = await sirene_mod.enrich_lead(lead, client)
            except Exception as e:
                log.warning(f"  Sirène error: {e}")

        # ── Étape 2 : Crawl site web → emails ────────────────────────────────
        website_emails: list[EmailResult] = []
        if self.crawl_website and lead.site_web:
            try:
                website_emails = await website_mod.crawl(lead.site_web, client)
                log.info(f"  Web crawl → {len(website_emails)} email(s)")
            except Exception as e:
                log.warning(f"  Website crawl error: {e}")

        # ── Étape 3 : Associer emails du site aux dirigeants ─────────────────
        domain = _extract_domain(lead.site_web)
        self._attach_website_emails_to_contacts(lead.contacts, website_emails, domain)

        # ── Étape 4 : Patterns email pour dirigeants encore sans email ────────
        for contact in lead.contacts:
            if not contact.emails and contact.prenom and contact.nom and domain:
                patterns = website_mod.generate_email_patterns(
                    contact.prenom, contact.nom, domain
                )
                contact.emails = patterns

        # ── Étape 5 : Ajouter emails génériques si site connu ─────────────────
        if domain:
            # Ajouter contact@ uniquement si pas déjà trouvé
            generic_addrs = {e.address for c in lead.contacts for e in c.emails}
            self._add_generic_contacts(lead, domain, generic_addrs, website_emails)

        # ── Étape 6 : Déduplication + scoring ────────────────────────────────
        lead.contacts = deduplicate(lead.contacts)

        # ── Étape 7 : Vérification SMTP des N meilleurs emails ────────────────
        if self.verify_smtp:
            await self._verify_top_emails(lead)

        # ── Étape 8 : Score ICP de l'entreprise ───────────────────────────────
        lead.icp_score = compute_icp_score(
            lead.code_naf, lead.effectif, lead.note, lead.nb_avis
        )
        lead.enrichment_score = self._compute_enrichment_score(lead)

        best_contact = lead.contacts[0] if lead.contacts else None
        best_email = best_contact.best_email if best_contact else None
        log.info(
            f"  ✓ ICP={lead.icp_score} | {len(lead.contacts)} contacts | "
            f"best_email={best_email.address if best_email else '—'} "
            f"({best_email.verdict.value if best_email else '—'})"
        )
        return lead

    # ─── Enrichissement d'un lot ──────────────────────────────────────────────

    async def enrich_batch(self, leads: list[Lead]) -> list[Lead]:
        """Enrichit un lot de leads avec contrôle de concurrence."""
        sem = asyncio.Semaphore(self.concurrency)
        results = []

        async def _one(lead: Lead) -> Lead:
            async with sem:
                try:
                    return await self.enrich(lead)
                except Exception as e:
                    log.error(f"Pipeline error for {lead.nom}: {e}")
                    return lead

        tasks = [_one(l) for l in leads]
        for i, fut in enumerate(asyncio.as_completed(tasks), 1):
            result = await fut
            results.append(result)
            log.info(f"[{i}/{len(leads)}] terminé")

        # Trier par ICP score décroissant
        return sorted(results, key=lambda l: -l.icp_score)

    # ─── Helpers privés ───────────────────────────────────────────────────────

    def _attach_website_emails_to_contacts(
        self,
        contacts: list[Contact],
        website_emails: list[EmailResult],
        domain: str,
    ) -> None:
        """
        Tente d'associer les emails scrapés du site web aux dirigeants connus.
        Stratégie : si l'email contient le nom du contact → haute confiance.
        Sinon : email générique → ajouté en dernier recours.
        """
        from .scorer import _normalize

        for contact in contacts:
            nom_norm = _normalize(contact.nom) if contact.nom else ""

            for email in website_emails:
                local = email.address.split("@")[0].lower()
                # Email nominatif pour ce contact ?
                if nom_norm and len(nom_norm) >= 3 and nom_norm in local:
                    email.confidence = min(email.confidence + 15, 100)
                    if email.address not in {e.address for e in contact.emails}:
                        contact.emails.insert(0, email)
                # Email générique du même domaine → candidat de secours
                elif email.address.split("@")[-1] == domain:
                    if email.address not in {e.address for e in contact.emails}:
                        contact.emails.append(email)

    def _add_generic_contacts(
        self,
        lead: Lead,
        domain: str,
        existing: set[str],
        website_emails: list[EmailResult],
    ) -> None:
        """Ajoute un contact 'Email générique' si aucun email de domaine trouvé."""
        generics = [e for e in website_emails if e.verdict == EmailVerdict.GENERIC]
        if generics or any(domain in a for a in existing):
            return  # déjà couvert

        # Créer un contact générique contact@domain
        generic_email = EmailResult(
            address=f"contact@{domain}",
            verdict=EmailVerdict.GENERIC,
            confidence=38,
            source="pattern:générique",
        )
        generic_contact = Contact(
            prenom="", nom="", poste="Email générique",
            source=ContactSource.PATTERN_GENERATED,
            emails=[generic_email],
        )
        from .scorer import score_contact
        generic_contact.reliability = score_contact(generic_contact)
        lead.contacts.append(generic_contact)

    async def _verify_top_emails(self, lead: Lead) -> None:
        """Vérifie SMTP les N meilleurs emails de chaque contact prioritaire."""
        # Collecte des emails à vérifier
        to_verify: dict[str, EmailResult] = {}

        for contact in lead.contacts[:5]:  # top 5 contacts
            for email in contact.emails[:SMTP_VERIFY_TOP_N]:
                if (
                    email.verdict not in (EmailVerdict.INVALID, EmailVerdict.GENERIC)
                    and email.address not in to_verify
                ):
                    to_verify[email.address] = email

        if not to_verify:
            return

        log.info(f"  SMTP verify → {len(to_verify)} email(s)…")
        smtp_results = await verify_batch(list(to_verify.keys()), concurrency=3)

        # Mettre à jour les EmailResult avec les résultats SMTP
        for addr, smtp in smtp_results.items():
            if addr in to_verify:
                er = to_verify[addr]
                er.mx_valid   = smtp.mx_valid
                er.smtp_code  = smtp.smtp_code
                er.confidence = smtp.confidence

                if not smtp.mx_valid:
                    er.verdict = EmailVerdict.INVALID
                elif smtp.valid and not smtp.catch_all:
                    er.verdict = EmailVerdict.VERIFIED
                elif smtp.catch_all:
                    er.verdict = EmailVerdict.PROBABLE
                elif smtp.smtp_code == 0:
                    er.verdict = EmailVerdict.PROBABLE  # timeout = incertain
                else:
                    er.verdict = EmailVerdict.INVALID

    def _compute_enrichment_score(self, lead: Lead) -> int:
        """Score qualité d'enrichissement du lead (0–100)."""
        score = 0
        if lead.siret:              score += 20
        if lead.contacts:           score += 15
        if lead.code_naf:           score += 10
        if lead.effectif:           score += 5

        # Bonus pour chaque contact avec email vérifié
        verified = sum(
            1 for c in lead.contacts
            if c.best_email and c.best_email.verdict == EmailVerdict.VERIFIED
        )
        probable = sum(
            1 for c in lead.contacts
            if c.best_email and c.best_email.verdict == EmailVerdict.PROBABLE
        )
        score += min(verified * 20, 40)
        score += min(probable * 5, 10)

        return min(score, 100)


# ─── Fonction utilitaire standalone ───────────────────────────────────────────

async def enrich_lead(
    lead_dict: dict,
    verify_smtp: bool = True,
) -> Lead:
    """
    Enrichit un seul lead depuis un dict.
    Pratique pour appels depuis le scraper Maps.
    """
    lead = Lead(**{k: v for k, v in lead_dict.items() if k in Lead.__dataclass_fields__})
    async with EnrichmentPipeline(verify_smtp=verify_smtp) as pipeline:
        return await pipeline.enrich(lead)


# ─── Export CSV ───────────────────────────────────────────────────────────────

def leads_to_dataframe(leads: list[Lead]) -> pd.DataFrame:
    """Convertit une liste de leads enrichis en DataFrame prêt pour CSV."""
    rows = []
    for lead in leads:
        base = {
            "nom":               lead.nom,
            "ville":             lead.ville,
            "code_postal":       lead.code_postal,
            "adresse":           lead.adresse,
            "telephone":         lead.telephone,
            "site_web":          lead.site_web,
            "note":              lead.note,
            "nb_avis":           lead.nb_avis,
            "categorie":         lead.categorie,
            "siret":             lead.siret,
            "code_naf":          lead.code_naf,
            "effectif":          lead.effectif,
            "icp_score":         lead.icp_score,
            "enrichment_score":  lead.enrichment_score,
            "nb_contacts":       len(lead.contacts),
            "localite":          lead.localite_recherche,
        }

        # Aplatir les 3 meilleurs contacts
        for i, contact in enumerate(lead.contacts[:3], 1):
            best = contact.best_email
            base[f"contact{i}_nom"]        = contact.display_name
            base[f"contact{i}_poste"]      = contact.poste
            base[f"contact{i}_email"]      = best.address if best else ""
            base[f"contact{i}_confiance"]  = best.confidence if best else 0
            base[f"contact{i}_verdict"]    = best.verdict.value if best else ""
            base[f"contact{i}_score"]      = contact.reliability
            base[f"contact{i}_source"]     = contact.source.value

        rows.append(base)

    return pd.DataFrame(rows)


def save_enriched_csv(leads: list[Lead], output_file: str) -> None:
    df = leads_to_dataframe(leads)
    df.to_csv(output_file, index=False, encoding="utf-8-sig")
    log.info(f"\n{'═'*60}")
    log.info(f"✓ {len(df)} leads sauvegardés → {output_file}")
    log.info(f"  Avec SIRET          : {df['siret'].astype(bool).sum()}")
    log.info(f"  Avec contact 1      : {df['contact1_email'].astype(bool).sum()}")
    log.info(f"  Email vérifié (c1)  : {(df.get('contact1_verdict','') == 'verified').sum()}")
    log.info(f"  ICP >= 70           : {(df['icp_score'] >= 70).sum()}")
    log.info(f"  Score moyen ICP     : {df['icp_score'].mean():.1f}")


# ─── CLI standalone ───────────────────────────────────────────────────────────

def _parse_args():
    p = argparse.ArgumentParser(description="Enrichissement pipeline Trakr")
    p.add_argument("--input",  required=True, help="CSV brut (sortie gmaps_scraper)")
    p.add_argument("--output", default=None,  help="CSV enrichi (défaut: input_enriched.csv)")
    p.add_argument("--no-smtp",  action="store_true", help="Désactiver vérification SMTP")
    p.add_argument("--no-sirene", action="store_true", help="Désactiver Sirène")
    p.add_argument("--concurrency", type=int, default=5)
    return p.parse_args()


async def _cli_main():
    args = _parse_args()
    output = args.output or args.input.replace(".csv", "_enriched.csv")

    # Lire le CSV brut
    df = pd.read_csv(args.input, dtype=str).fillna("")
    log.info(f"Chargement de {len(df)} leads depuis {args.input}")

    leads = [
        Lead(
            nom=row.get("nom", ""),
            ville=row.get("ville", ""),
            code_postal=row.get("code_postal", ""),
            adresse=row.get("adresse", ""),
            telephone=row.get("telephone", ""),
            site_web=row.get("site_web", ""),
            note=row.get("note", ""),
            nb_avis=row.get("nb_avis", ""),
            categorie=row.get("categorie", ""),
            localite_recherche=row.get("localite_recherche", ""),
        )
        for _, row in df.iterrows()
    ]

    async with EnrichmentPipeline(
        verify_smtp=not args.no_smtp,
        enrich_sirene=not args.no_sirene,
        concurrency=args.concurrency,
    ) as pipeline:
        enriched = await pipeline.enrich_batch(leads)

    save_enriched_csv(enriched, output)


def _extract_domain(url: str) -> str:
    if not url:
        return ""
    try:
        from urllib.parse import urlparse
        u = url if url.startswith("http") else "https://" + url
        return urlparse(u).netloc.replace("www.", "")
    except Exception:
        return ""


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )
    asyncio.run(_cli_main())
