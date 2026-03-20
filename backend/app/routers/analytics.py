from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from datetime import datetime, timedelta, timezone

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.prospect import Prospect, ProspectStatus
from app.models.log import OutreachLog

router = APIRouter()


@router.get("/dashboard")
async def dashboard_metrics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    # Total prospects
    total_q = await db.execute(select(func.count(Prospect.id)))
    total = total_q.scalar()

    # New this week
    new_week_q = await db.execute(
        select(func.count(Prospect.id)).where(Prospect.created_at >= week_ago)
    )
    new_week = new_week_q.scalar()

    # By status
    status_q = await db.execute(
        select(Prospect.status, func.count(Prospect.id).label("n")).group_by(Prospect.status)
    )
    status_counts = {row.status: row.n for row in status_q.all()}

    total_contacted = sum(
        status_counts.get(s, 0)
        for s in ["contacted", "interested", "demo", "won"]
    )
    won = status_counts.get("won", 0)

    # Avg ICP score
    avg_icp_q = await db.execute(select(func.avg(Prospect.icp_score)))
    avg_icp = round(avg_icp_q.scalar() or 0, 1)

    # Email stats
    emails_sent_q = await db.execute(
        select(func.count(OutreachLog.id)).where(
            and_(OutreachLog.type == "email", OutreachLog.sent_at.isnot(None))
        )
    )
    emails_sent = emails_sent_q.scalar()

    emails_opened_q = await db.execute(
        select(func.count(OutreachLog.id)).where(OutreachLog.opened_at.isnot(None))
    )
    emails_opened = emails_opened_q.scalar()

    emails_clicked_q = await db.execute(
        select(func.count(OutreachLog.id)).where(OutreachLog.clicked_at.isnot(None))
    )
    emails_clicked = emails_clicked_q.scalar()

    return {
        "total_prospects": total,
        "new_this_week": new_week,
        "contact_rate": round(total_contacted / total * 100, 1) if total else 0,
        "conversion_rate": round(won / total_contacted * 100, 1) if total_contacted else 0,
        "avg_icp_score": avg_icp,
        "emails_sent": emails_sent,
        "emails_opened": emails_opened,
        "emails_clicked": emails_clicked,
        "open_rate": round(emails_opened / emails_sent * 100, 1) if emails_sent else 0,
        "click_rate": round(emails_clicked / emails_sent * 100, 1) if emails_sent else 0,
        "status_counts": status_counts,
    }


@router.get("/prospects-by-naf")
async def prospects_by_naf(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Prospect.code_naf, func.count(Prospect.id).label("count"))
        .where(Prospect.code_naf.isnot(None))
        .group_by(Prospect.code_naf)
        .order_by(func.count(Prospect.id).desc())
        .limit(15)
    )
    return [{"code_naf": row.code_naf, "count": row.count} for row in result.all()]


@router.get("/pipeline-evolution")
async def pipeline_evolution(
    weeks: int = 8,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Prospects créés par semaine pour les N dernières semaines."""
    now = datetime.now(timezone.utc)
    data = []
    for i in range(weeks, 0, -1):
        start = now - timedelta(weeks=i)
        end = now - timedelta(weeks=i - 1)
        q = await db.execute(
            select(func.count(Prospect.id)).where(
                and_(Prospect.created_at >= start, Prospect.created_at < end)
            )
        )
        data.append({
            "week": start.strftime("S%W %Y"),
            "count": q.scalar(),
        })
    return data


@router.get("/email-by-template")
async def email_by_template(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(
            OutreachLog.template_name,
            func.count(OutreachLog.id).label("sent"),
            func.count(OutreachLog.opened_at).label("opened"),
            func.count(OutreachLog.clicked_at).label("clicked"),
        )
        .where(OutreachLog.template_name.isnot(None))
        .group_by(OutreachLog.template_name)
    )
    return [
        {
            "template": row.template_name,
            "sent": row.sent,
            "opened": row.opened,
            "clicked": row.clicked,
            "open_rate": round(row.opened / row.sent * 100, 1) if row.sent else 0,
        }
        for row in result.all()
    ]


@router.get("/geo-distribution")
async def geo_distribution(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Prospect.code_postal, Prospect.ville, func.count(Prospect.id).label("count"))
        .where(and_(Prospect.lat.isnot(None), Prospect.lng.isnot(None)))
        .group_by(Prospect.code_postal, Prospect.ville)
        .order_by(func.count(Prospect.id).desc())
        .limit(100)
    )
    return [
        {"code_postal": row.code_postal, "ville": row.ville, "count": row.count}
        for row in result.all()
    ]
