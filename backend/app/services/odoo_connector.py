"""Connecteur Odoo 18 via XML-RPC."""
import xmlrpc.client
from app.core.config import settings
from app.models.prospect import Prospect


def _get_odoo_connection():
    if not all([settings.ODOO_URL, settings.ODOO_DB, settings.ODOO_USERNAME, settings.ODOO_PASSWORD]):
        raise ValueError("Variables Odoo non configurées (ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD)")

    common = xmlrpc.client.ServerProxy(f"{settings.ODOO_URL}/xmlrpc/2/common")
    uid = common.authenticate(settings.ODOO_DB, settings.ODOO_USERNAME, settings.ODOO_PASSWORD, {})
    if not uid:
        raise ValueError("Authentification Odoo échouée")

    models = xmlrpc.client.ServerProxy(f"{settings.ODOO_URL}/xmlrpc/2/object")
    return uid, models


def _prospect_to_partner(prospect: Prospect) -> dict:
    data = {
        "name": prospect.raison_sociale,
        "is_company": True,
        "phone": prospect.tel or "",
        "email": prospect.email or "",
        "city": prospect.ville or "",
        "zip": prospect.code_postal or "",
        "country_id": 75,  # France
        "website": prospect.site_web or "",
        "comment": prospect.notes or "",
    }
    if prospect.siret:
        data["vat"] = f"FR{prospect.siret[:9]}"
    return data


async def push_to_odoo(prospect: Prospect) -> int | None:
    """Crée ou met à jour un res.partner dans Odoo."""
    try:
        import asyncio
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, lambda: _sync_push(prospect))
        return result
    except Exception as e:
        print(f"Odoo push error: {e}")
        return None


def _sync_push(prospect: Prospect) -> int:
    uid, models = _get_odoo_connection()
    db = settings.ODOO_DB
    pw = settings.ODOO_PASSWORD
    partner_data = _prospect_to_partner(prospect)

    # Check if partner already exists
    if prospect.odoo_partner_id:
        models.execute_kw(db, uid, pw, "res.partner", "write", [[prospect.odoo_partner_id], partner_data])
        partner_id = prospect.odoo_partner_id
    else:
        partner_id = models.execute_kw(db, uid, pw, "res.partner", "create", [partner_data])

    # Create CRM lead if prospect is interested or beyond
    interested_statuses = {"interested", "demo", "won"}
    if prospect.status in interested_statuses:
        existing_leads = models.execute_kw(
            db, uid, pw, "crm.lead", "search",
            [[["partner_id", "=", partner_id]]],
        )
        if not existing_leads:
            models.execute_kw(db, uid, pw, "crm.lead", "create", [{
                "name": f"Prospection — {prospect.raison_sociale}",
                "partner_id": partner_id,
                "description": prospect.notes or "",
                "type": "opportunity",
            }])

    return partner_id


async def push_all_won_to_odoo(db_session) -> dict:
    from sqlalchemy import select
    from app.models.prospect import Prospect, ProspectStatus

    result = await db_session.execute(
        select(Prospect).where(Prospect.status == ProspectStatus.won)
    )
    prospects = result.scalars().all()
    pushed = 0
    errors = 0
    for p in prospects:
        odoo_id = await push_to_odoo(p)
        if odoo_id:
            p.odoo_partner_id = odoo_id
            pushed += 1
        else:
            errors += 1
    await db_session.flush()
    return {"pushed": pushed, "errors": errors}
