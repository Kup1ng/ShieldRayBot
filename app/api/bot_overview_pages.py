"""Bot overview (/dashboard) and its live server meters (/dashboard/metrics)."""

from __future__ import annotations

import asyncio
import logging

from fastapi import Depends
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.spa_pages import spa_response
from app.services import bot_overview as overview
from app.services.dashboard_trend import empty_trend, sales_trend
from app.services.db_safe import rollback_quiet
from app.services.host_gauges import gauges_json, local_host_gauges
from app.services.ux20 import count_stuck_paid_orders

logger = logging.getLogger(__name__)

TREND_DAYS = 7


async def local_host() -> dict:
    host = await asyncio.to_thread(local_host_gauges, wait_cpu=0.0)
    if host.get("cpu_percent") is None:
        host = await asyncio.to_thread(local_host_gauges, wait_cpu=0.12)
    return host


async def shop_figures(session: AsyncSession, viewer: overview.Viewer, period: str) -> dict:
    """Everything the page draws for one shop; a failed part shows empty, never an error page."""
    totals = await overview.shop_totals(session, viewer)
    try:
        kpis = await overview.period_kpis(session, reseller_id=viewer.shop_id, period=period)
        deliveries = await count_stuck_paid_orders(session, reseller_id=viewer.shop_id)
        trend = await sales_trend(session, reseller_id=viewer.shop_id, days=TREND_DAYS)
        payments, orders = await overview.recent_rows(session, viewer)
    except Exception:
        logger.exception("bot overview figures failed shop=%s", viewer.shop_id)
        await rollback_quiet(session)
        empty = overview.PeriodFigures(revenue=0, delivered=0, new_users=0)
        kpis = overview.PeriodKpis(period=period, current=empty, previous=empty)
        deliveries, trend, payments, orders = 0, empty_trend(TREND_DAYS), [], []
    bot = await overview.bot_status(await overview.shop_bot_token(session, viewer))
    return {
        "stats": totals,
        "kpis": kpis,
        "deliveries": deliveries,
        "trend": trend,
        "recent_payments": payments,
        "recent_orders": orders,
        "bot": bot,
    }


def register_bot_overview_pages(app, *, render, require_perm, require_admin, get_db) -> None:
    # ``render`` stays in the signature shared by every page registration; the React page needs none.
    del render, get_db

    @app.get("/dashboard", response_class=HTMLResponse)
    async def dashboard(staff: dict = Depends(require_perm("dashboard"))):
        """The React bot overview; its figures come from /api/panel/dashboard (same permission there)."""
        return spa_response("dashboard")

    @app.get("/dashboard/metrics")
    async def dashboard_host_metrics_json(staff: dict = Depends(require_admin)):
        """CPU/RAM of the bot's own server: the platform owner only (``require_admin``)."""
        return JSONResponse(gauges_json(await local_host()), headers={"Cache-Control": "private, no-store"})
