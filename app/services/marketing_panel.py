"""Data the React campaigns, funnel and broadcast pages show.

Callers resolve the shop and check permissions first; these functions only read that scope and
return JSON-ready dicts with exactly the fields the screens use.
"""

from __future__ import annotations

import logging
from collections.abc import Mapping
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import TargetedCampaign
from app.services.broadcast import AUDIENCE_LABELS, list_broadcast_history
from app.services.broadcast_queue import ACTIVE_STATUSES, STATUS_LABELS
from app.services.campaigns import AUDIENCES, RECIPIENT_LIMIT, audience_count, campaign_progress_map
from app.services.db_safe import rollback_quiet
from app.services.marketing_nav import marketing_sections
from app.services.ux20 import FUNNEL_STEPS, funnel_summary

logger = logging.getLogger(__name__)

CAMPAIGN_LIST_LIMIT = 50
BROADCAST_HISTORY_LIMIT = 40
BROADCAST_SNIPPET_LENGTH = 120
FUNNEL_DAYS = 7
DEFAULT_AUDIENCE = "trial"
DEFAULT_DAYS = 7

CAMPAIGN_STATUS_LABELS = {
    "draft": "پیش‌نویس",
    "running": "در حال ارسال",
    "paused": "متوقف",
    "completed": "تکمیل‌شده",
    "review": "تکمیل با موارد نیازمند بررسی",
}
RECIPIENT_STATUS_LABELS = {
    "pending": "در صف",
    "sending": "در حال ارسال",
    "sent": "ارسال‌شده",
    "failed": "ناموفق",
    "skipped": "حذف‌شده از ارسال",
    "review": "نتیجه نامشخص",
}
# Campaigns the panel did not create from an audience pick carry a fixed title.
SPECIAL_AUDIENCE_LABELS = {
    "catalog_discount": "اطلاع‌رسانی تغییر قیمت",
    "selected": "پیام به کاربران تست",
}
CAMPAIGN_CONTROLLABLE = ("draft", "paused", "running")


def marketing_tabs(staff: Mapping[str, Any]) -> list[dict[str, str]]:
    """The shared tab strip: only sections the staff member can open."""
    return [{"key": s.key, "label": s.label, "href": s.href} for s in marketing_sections(staff)]


def _audience_title(audience: str) -> str:
    return SPECIAL_AUDIENCE_LABELS.get(audience) or AUDIENCES.get(audience, audience)


def _campaign_row(row: TargetedCampaign, progress: dict[str, int]) -> dict[str, Any]:
    return {
        "id": int(row.id),
        "audience_title": _audience_title(row.audience),
        "status": row.status,
        "status_label": CAMPAIGN_STATUS_LABELS.get(row.status, row.status),
        "text": row.text,
        "progress": [
            {"status": status, "label": RECIPIENT_STATUS_LABELS.get(status, status), "count": int(count)}
            for status, count in progress.items()
        ],
        "has_review": bool(progress.get("review")),
        "can_control": row.status in CAMPAIGN_CONTROLLABLE,
    }


async def campaigns_page(
    session: AsyncSession, *, scope: int | None, audience: str, days: int
) -> dict[str, Any]:
    """Audience preview plus the shop's newest campaigns; ``ValueError`` for a bad audience or range."""
    count = await audience_count(session, shop_id=scope, audience=audience, days=days)
    owner = TargetedCampaign.reseller_id.is_(None) if scope is None else TargetedCampaign.reseller_id == int(scope)
    rows = list(
        (
            await session.scalars(
                select(TargetedCampaign).where(owner).order_by(TargetedCampaign.id.desc()).limit(CAMPAIGN_LIST_LIMIT)
            )
        ).all()
    )
    # Progress is read only for campaigns already scoped to this shop, never by a bare id.
    progress = await campaign_progress_map(session, [row.id for row in rows])
    return {
        "audiences": [{"value": key, "label": label} for key, label in AUDIENCES.items()],
        "audience": audience,
        "days": days,
        "count": count,
        "limit": RECIPIENT_LIMIT,
        "campaigns": [_campaign_row(row, progress[int(row.id)]) for row in rows],
    }


async def funnel_counts(session: AsyncSession, *, scope: int | None) -> dict[str, int]:
    """Step counts of the last week; a failing read shows zeros rather than an error page."""
    try:
        counts = await funnel_summary(session, reseller_id=scope, days=FUNNEL_DAYS)
    except Exception:
        logger.exception("funnel_summary failed reseller_id=%s", scope)
        await rollback_quiet(session)
        counts = {}
    return {step: int((counts or {}).get(step) or 0) for step in FUNNEL_STEPS}


def _broadcast_row(row: Any) -> dict[str, Any]:
    active = row.status in ACTIVE_STATUSES
    text = row.text or ""
    return {
        "id": int(row.id),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "audience_label": AUDIENCE_LABELS.get(row.audience, row.audience),
        "text_snippet": text[:BROADCAST_SNIPPET_LENGTH],
        "text_truncated": len(text) > BROADCAST_SNIPPET_LENGTH,
        "total": int(row.total or 0),
        "ok_count": int(row.ok_count or 0),
        "fail_count": int(row.fail_count or 0),
        "review_count": int(row.review_count or 0),
        "status": row.status,
        "status_label": STATUS_LABELS.get(row.status, row.status),
        "created_by": row.created_by or "",
        "is_active": active,
    }


async def broadcast_history(session: AsyncSession) -> list[dict[str, Any]]:
    rows = await list_broadcast_history(session, limit=BROADCAST_HISTORY_LIMIT)
    return [_broadcast_row(row) for row in rows]
