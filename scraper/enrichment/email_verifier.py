"""
Vérificateur d'email — DNS MX + SMTP RCPT TO.
Détermine si un email est valide sans l'envoyer.

Pipeline :
  1. Validation syntaxe regex
  2. DNS MX lookup (dnspython)
  3. Connexion SMTP + RCPT TO (asyncio)
  4. Détection catch-all (test avec fausse adresse)

Aucune clé API requise.
"""

import asyncio
import logging
import re
import socket
import smtplib
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

log = logging.getLogger("trakr.smtp")

# Délais de connexion / réponse SMTP
SMTP_TIMEOUT   = 10        # secondes
SMTP_PORTS     = [25, 587] # essai dans l'ordre
HELO_DOMAIN    = "trakr-prospector.fr"
FROM_ADDR      = "verify@trakr-prospector.fr"

EMAIL_RE = re.compile(
    r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$"
)

# Domaines connus catch-all → on évite le SMTP (perd du temps)
KNOWN_CATCHALL_PROVIDERS = {
    "gmail.com", "yahoo.fr", "yahoo.com", "hotmail.com", "hotmail.fr",
    "outlook.com", "orange.fr", "sfr.fr", "free.fr", "laposte.net",
    "wanadoo.fr", "numericable.fr", "bbox.fr",
}


@dataclass
class SmtpResult:
    email:      str
    valid:      bool                 # SMTP a accepté RCPT TO
    catch_all:  bool = False         # serveur accepte tout
    confidence: int  = 0            # 0–100
    mx_host:    str  = ""
    mx_valid:   bool = False
    smtp_code:  Optional[int] = None
    error:      str  = ""
    checked_at: str  = field(default_factory=lambda: datetime.utcnow().isoformat())

    @property
    def verdict_label(self) -> str:
        if not self.mx_valid:
            return "❌ Domaine invalide"
        if self.catch_all:
            return "🟡 Catch-all (probable)"
        if self.valid:
            return f"✅ Vérifié SMTP ({self.confidence}%)"
        return "❌ Rejeté SMTP"


# ─── 1. Validation syntaxe ────────────────────────────────────────────────────

def syntax_valid(email: str) -> bool:
    return bool(EMAIL_RE.match(email))


# ─── 2. DNS MX lookup ─────────────────────────────────────────────────────────

def get_mx_hosts(domain: str) -> list[tuple[int, str]]:
    """
    Retourne [(priority, hostname), ...] trié par priorité.
    Lève une exception si aucun MX trouvé.
    """
    try:
        import dns.resolver
        answers = dns.resolver.resolve(domain, "MX", lifetime=8)
        records = [(int(r.preference), str(r.exchange).rstrip(".")) for r in answers]
        return sorted(records, key=lambda x: x[0])
    except ImportError:
        # Fallback si dnspython non installé : socket MX via DNS simple
        return _mx_fallback(domain)
    except Exception as e:
        log.debug(f"MX lookup failed for {domain}: {e}")
        return []


def _mx_fallback(domain: str) -> list[tuple[int, str]]:
    """Fallback sans dnspython : essaie mail.{domain} directement."""
    candidates = [f"mail.{domain}", f"smtp.{domain}", domain]
    for host in candidates:
        try:
            socket.gethostbyname(host)
            return [(10, host)]
        except Exception:
            continue
    return []


# ─── 3. Vérification SMTP ────────────────────────────────────────────────────

def _smtp_check_sync(email: str, mx_host: str, port: int = 25) -> tuple[bool, int, bool]:
    """
    Connexion SMTP synchrone (dans un thread pour ne pas bloquer asyncio).
    Retourne (valid, smtp_code, is_catch_all).
    """
    domain = email.split("@")[1]

    try:
        with smtplib.SMTP(timeout=SMTP_TIMEOUT) as smtp:
            smtp.connect(mx_host, port)
            smtp.ehlo(HELO_DOMAIN)

            # MAIL FROM
            code, _ = smtp.mail(FROM_ADDR)
            if code != 250:
                return False, code, False

            # RCPT TO — email cible
            code, _ = smtp.rcpt(email)
            valid = (code == 250)

            # Test catch-all : si valide, tester une fausse adresse
            catch_all = False
            if valid:
                fake = f"zz_fake_99xyz_zz@{domain}"
                try:
                    fake_code, _ = smtp.rcpt(fake)
                    catch_all = (fake_code == 250)
                except Exception:
                    pass

            smtp.quit()
            return valid, code, catch_all

    except (smtplib.SMTPConnectError, ConnectionRefusedError, OSError) as e:
        log.debug(f"SMTP connect error {mx_host}:{port} → {e}")
        return False, 0, False
    except smtplib.SMTPServerDisconnected:
        log.debug(f"SMTP disconnected prematurely from {mx_host}")
        return False, 0, False
    except Exception as e:
        log.debug(f"SMTP error: {e}")
        return False, 0, False


async def smtp_verify(email: str, mx_host: str) -> tuple[bool, int, bool]:
    """Version async de _smtp_check_sync — exécutée dans un thread."""
    loop = asyncio.get_event_loop()

    for port in SMTP_PORTS:
        try:
            valid, code, catch_all = await asyncio.wait_for(
                loop.run_in_executor(None, _smtp_check_sync, email, mx_host, port),
                timeout=SMTP_TIMEOUT + 2,
            )
            if code != 0:  # connexion établie (même si rejet)
                return valid, code, catch_all
        except asyncio.TimeoutError:
            log.debug(f"SMTP timeout {mx_host}:{port}")
            continue

    return False, 0, False


# ─── 4. Orchestrateur complet ─────────────────────────────────────────────────

async def verify_email(email: str) -> SmtpResult:
    """
    Vérifie un email complet : syntaxe → MX → SMTP → catch-all.
    Retourne un SmtpResult avec confidence 0–100.
    """
    email = email.lower().strip()

    # Étape 1 — syntaxe
    if not syntax_valid(email):
        return SmtpResult(email=email, valid=False, confidence=0, error="syntax_invalid")

    domain = email.split("@")[1]

    # Étape 2 — providers connus catch-all (pas de SMTP possible)
    if domain in KNOWN_CATCHALL_PROVIDERS:
        # MX existe forcément, on marque catch-all sans tester
        return SmtpResult(
            email=email, valid=True, catch_all=True,
            mx_valid=True, mx_host=f"mail.{domain}",
            confidence=40, smtp_code=None,
            error="known_catchall_provider",
        )

    # Étape 3 — DNS MX
    mx_records = await asyncio.get_event_loop().run_in_executor(
        None, get_mx_hosts, domain
    )
    if not mx_records:
        return SmtpResult(
            email=email, valid=False, mx_valid=False,
            confidence=0, error="no_mx_record",
        )

    mx_host = mx_records[0][1]

    # Étape 4 — SMTP
    valid, code, catch_all = await smtp_verify(email, mx_host)

    # Calcul confidence
    confidence = _compute_confidence(valid, catch_all, code)

    return SmtpResult(
        email=email,
        valid=valid,
        catch_all=catch_all,
        confidence=confidence,
        mx_host=mx_host,
        mx_valid=True,
        smtp_code=code,
        error="" if code != 0 else "smtp_timeout",
    )


async def verify_batch(emails: list[str], concurrency: int = 5) -> dict[str, SmtpResult]:
    """Vérifie plusieurs emails en parallèle avec contrôle de concurrence."""
    sem = asyncio.Semaphore(concurrency)

    async def _verify_one(email: str) -> tuple[str, SmtpResult]:
        async with sem:
            result = await verify_email(email)
            await asyncio.sleep(0.3)  # politesse
            return email, result

    tasks = [_verify_one(e) for e in emails]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    output = {}
    for r in results:
        if isinstance(r, tuple):
            output[r[0]] = r[1]
    return output


def _compute_confidence(valid: bool, catch_all: bool, smtp_code: int) -> int:
    """
    Calcule la confiance (0–100) d'un email selon le résultat SMTP.

    Grille :
      SMTP 250 + non catch-all → 95
      SMTP 250 + catch-all      → 50  (serveur accepte tout, on ne sait pas)
      SMTP timeout (code=0)     → 30  (probablement filtré, peut être valide)
      SMTP 550/551/552          → 5   (rejeté = très probablement invalide)
      Autre erreur              → 15
    """
    if valid and not catch_all:
        return 95
    if valid and catch_all:
        return 50
    if smtp_code == 0:
        return 30   # timeout = serveur trop prudent pour conclure
    if smtp_code in (550, 551, 552, 553, 554):
        return 5    # SMTP explicitement rejeté
    if smtp_code in (421, 450, 451, 452):
        return 35   # temporaire / greylisting
    return 15
