"""Finance hub page, legacy list redirects and the receipt image proxy.

The hub itself is a React page; its data comes from ``app/api/panel_finance_api.py``.
"""

from __future__ import annotations

import logging
from urllib.parse import urlencode

from fastapi import Depends, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.spa_pages import spa_response
from app.db.models import Order, Payment
from app.services.authz import authz_from_staff, can_shop
from app.services.receipt_files import fetch_telegram_file, payment_bot_token
from app.services.shop_scope import is_platform_admin, payment_shop_id, shop_owner_id

logger = logging.getLogger(__name__)


async def _authorize_receipt_access(
    session: AsyncSession,
    staff: dict,
    payment: Payment,
) -> tuple[Order | None, int | None] | None:
    """Return (order, payment shop id) if staff may view this receipt, else None.

    The shop of a payment is its own: a top-up's wallet shop or its order's shop, never the payer's
    attribution. Platform admins see platform payments only; shop staff only their shop's.
    """
    order: Order | None = None
    if payment.order_id:
        order = await session.get(Order, int(payment.order_id))

    tenant_rid = payment_shop_id(payment, order)

    if is_platform_admin(staff):
        if tenant_rid:
            return None
        return order, None

    rid = shop_owner_id(staff)
    if not rid or not tenant_rid or int(tenant_rid) != int(rid):
        return None
    return order, int(tenant_rid)


def _legacy_finance_redirect(tab: str):
    async def _redir(request: Request):
        params = {"tab": tab}
        for k in ("q", "ok", "err", "saved", "settings"):
            v = request.query_params.get(k)
            if v:
                params[k] = v
        return RedirectResponse(f"/finance?{urlencode(params)}", status_code=303)

    return _redir


def register_finance_pages(app, *, render, require_staff, get_db):
    @app.get("/finance", response_class=HTMLResponse)
    async def finance_page(request: Request, staff: dict = Depends(require_staff)):
        authz = authz_from_staff(staff)
        if not (can_shop(authz, "orders") or can_shop(authz, "payments")):
            return RedirectResponse("/home", status_code=303)
        if (request.query_params.get("tab") or "").strip() == "behavior":
            # The customer-behaviour panel moved to the marketing section.
            return RedirectResponse("/funnel", status_code=303)
        return spa_response("finance")

    app.add_api_route("/orders", _legacy_finance_redirect("orders"), methods=["GET"], response_class=HTMLResponse)
    app.add_api_route("/payments", _legacy_finance_redirect("payments"), methods=["GET"], response_class=HTMLResponse)

    @app.get("/payments/{payment_id}/receipt")
    async def payment_receipt(
        payment_id: int,
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ):
        authz = authz_from_staff(staff)
        if not can_shop(authz, "payments"):
            return RedirectResponse("/home", status_code=303)
        payment = await session.get(Payment, int(payment_id))
        if not payment:
            return Response(status_code=404, content="رسید یافت نشد")
        file_id = (payment.receipt_file_id or "").strip()
        if not file_id or file_id.startswith("stars:"):
            return Response(status_code=404, content="رسید تصویری نیست")

        scoped = await _authorize_receipt_access(session, staff, payment)
        if scoped is None:
            return Response(status_code=403, content="دسترسی ندارید")
        order, payer_reseller_id = scoped

        token = await payment_bot_token(
            session,
            payment,
            order=order,
            payer_reseller_id=payer_reseller_id,
        )
        if not token:
            return Response(status_code=503, content="توکن ربات تنظیم نشده")
        try:
            fetched = await fetch_telegram_file(token, file_id)
        except Exception:
            logger.exception("receipt getFile failed payment_id=%s", payment_id)
            fetched = None
        if not fetched:
            return Response(status_code=502, content="دریافت رسید از تلگرام ناموفق بود")
        body, ctype = fetched
        return Response(
            content=body,
            media_type=ctype,
            headers={
                "Cache-Control": "private, no-store",
                "Content-Disposition": f'inline; filename="receipt-{payment_id}"',
                "X-Content-Type-Options": "nosniff",
            },
        )
