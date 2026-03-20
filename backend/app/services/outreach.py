"""Service d'envoi d'emails via SendGrid avec tracking RGPD."""
import uuid
from datetime import datetime, timezone
from jinja2 import Environment, BaseLoader
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.models.prospect import Prospect
from app.models.sequence import Sequence, SequenceEnrollment, EmailTemplate
from app.models.log import OutreachLog


def _render_template(body_html: str, context: dict) -> str:
    env = Environment(loader=BaseLoader())
    template = env.from_string(body_html)
    return template.render(**context)


def _build_context(prospect: Prospect, tracking_id: str) -> dict:
    open_pixel = f"{settings.APP_BASE_URL}/api/outreach/track/open/{tracking_id}"
    unsubscribe_url = f"{settings.APP_BASE_URL}/api/outreach/unsubscribe/{tracking_id}"
    return {
        "raison_sociale": prospect.raison_sociale,
        "ville": prospect.ville or "",
        "secteur": prospect.code_naf or "",
        "prenom_contact": prospect.contact_prenom or "Madame/Monsieur",
        "open_pixel": open_pixel,
        "unsubscribe_url": unsubscribe_url,
    }


UNSUBSCRIBE_FOOTER = """
<br><br>
<p style="font-size:11px;color:#888;">
  Vous recevez cet email car votre établissement correspond à nos critères de prospection.
  <a href="{unsubscribe_url}">Se désinscrire</a>
</p>
<img src="{open_pixel}" width="1" height="1" style="display:none;" alt="">
"""


async def send_email_to_prospect(
    db: AsyncSession,
    prospect: Prospect,
    template_name: str,
    sequence_id: int | None = None,
    step_index: int | None = None,
) -> bool:
    if not settings.SENDGRID_API_KEY:
        print("SENDGRID_API_KEY non configurée")
        return False

    if prospect.unsubscribed or not prospect.email:
        return False

    # Fetch template
    result = await db.execute(select(EmailTemplate).where(EmailTemplate.name == template_name))
    tpl = result.scalar_one_or_none()
    if not tpl:
        print(f"Template '{template_name}' non trouvé")
        return False

    tracking_id = str(uuid.uuid4())
    ctx = _build_context(prospect, tracking_id)
    body_html = _render_template(tpl.body_html, ctx)
    footer = UNSUBSCRIBE_FOOTER.format(**ctx)
    full_html = body_html + footer
    subject = _render_template(tpl.subject, ctx)

    import httpx
    payload = {
        "personalizations": [{
            "to": [{"email": prospect.email}],
            "subject": subject,
        }],
        "from": {
            "email": settings.SENDGRID_FROM_EMAIL,
            "name": settings.SENDGRID_FROM_NAME,
        },
        "content": [{"type": "text/html", "value": full_html}],
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://api.sendgrid.com/v3/mail/send",
                json=payload,
                headers={"Authorization": f"Bearer {settings.SENDGRID_API_KEY}"},
            )
        success = resp.status_code in (200, 202)
    except Exception as e:
        print(f"SendGrid error: {e}")
        success = False

    # Log
    log = OutreachLog(
        prospect_id=prospect.id,
        sequence_id=sequence_id,
        step_index=step_index,
        type="email",
        template_name=template_name,
        tracking_id=tracking_id,
        sent_at=datetime.now(timezone.utc) if success else None,
    )
    db.add(log)
    await db.flush()
    return success


async def process_sequences(db: AsyncSession):
    """Tâche périodique : déclenche les steps des séquences actives."""
    from datetime import timedelta

    result = await db.execute(
        select(SequenceEnrollment)
        .where(SequenceEnrollment.is_active.is_(True))
    )
    enrollments = result.scalars().all()

    for enrollment in enrollments:
        seq_result = await db.execute(select(Sequence).where(Sequence.id == enrollment.sequence_id))
        sequence = seq_result.scalar_one_or_none()
        if not sequence or not sequence.is_active:
            continue

        steps = sequence.steps or []
        if enrollment.current_step >= len(steps):
            enrollment.is_active = False
            continue

        step = steps[enrollment.current_step]
        step_day = step.get("day", 0)
        enrolled_at = enrollment.enrolled_at.replace(tzinfo=timezone.utc)
        should_trigger_at = enrolled_at + timedelta(days=step_day)

        if datetime.now(timezone.utc) < should_trigger_at:
            continue

        # Trigger step
        prospect_result = await db.execute(select(Prospect).where(Prospect.id == enrollment.prospect_id))
        prospect = prospect_result.scalar_one_or_none()
        if not prospect or prospect.unsubscribed:
            enrollment.is_active = False
            continue

        step_type = step.get("type", "email")
        if step_type == "email":
            template_name = step.get("template")
            if template_name:
                await send_email_to_prospect(
                    db, prospect, template_name,
                    sequence_id=sequence.id,
                    step_index=enrollment.current_step,
                )

        enrollment.current_step += 1
        enrollment.last_step_at = datetime.now(timezone.utc)

    await db.flush()
