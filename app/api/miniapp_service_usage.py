"""Mini App usage chart of one service: thin route over ``app.services.service_usage_chart``.

The service must be the caller's and sold by this Mini App's shop (the same check as the service
page). A panel that cannot be read answers a Persian message, never the panel's own text.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.miniapp_pages import _no_store, _owned_service_or_404, _require_commerce
from app.db.models import UserService
from app.services.miniapp_auth import load_mini_user
from app.services.miniapp_shop import mini_scope
from app.services.pasarguard import PasarGuardError, get_pg
from app.services.service_usage_chart import parse_usage_range, service_usage_series

logger = logging.getLogger(__name__)

USAGE_UNAVAILABLE = "نمودار مصرف این سرویس فعلاً در دسترس نیست."


def register_miniapp_service_usage(app: FastAPI, *, get_db) -> None:
    @app.get("/api/mini/service/{service_id}/usage")
    async def mini_service_usage(service_id: int, request: Request, session: AsyncSession = Depends(get_db)):
        user = await load_mini_user(session, request)
        _require_commerce(user)
        try:
            range_key = parse_usage_range(request.query_params.get("range"))
        except ValueError:
            raise HTTPException(400, "بازهٔ نمودار نامعتبر است") from None
        svc = await _owned_service_or_404(
            session, await session.get(UserService, service_id), user, shop_id=mini_scope(request).shop_id
        )
        if not svc.pg_user_id:
            raise HTTPException(409, USAGE_UNAVAILABLE)
        pg_user_id = int(svc.pg_user_id)
        # The panel read happens after the last query: no transaction stays open across it.
        await session.rollback()
        try:
            series = await service_usage_series(get_pg(), pg_user_id, range_key, now=datetime.now(timezone.utc))
        except PasarGuardError:
            logger.warning("mini app usage chart read failed service=%s", service_id, exc_info=True)
            raise HTTPException(502, USAGE_UNAVAILABLE) from None
        return _no_store(series)
