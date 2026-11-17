"""Mini App order payments: pay a plan or a renewal by card, gateway or crypto, upload the receipt, poll.

Thin routes over ``app.services.miniapp_order_payments``. The customer comes from initData
and the shop from the verified Mini App scope: a shop's Mini App pays that shop's orders
with that shop's own cards and gateways, and its receipts go through that shop's bot to its
reviewers. Every order and payment id is re-checked against the customer and the shop in
the service.
"""

from __future__ import annotations

import logging

from fastapi import Depends, FastAPI, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.miniapp_buy_extras import check_buy_extras, service_name_field
from app.api.miniapp_pages import _no_store, _require_commerce_ready, _scope_ui
from app.api.miniapp_topup import _json_object, _read_capped, _valid_id
from app.services.db_safe import rollback_quiet
from app.services.miniapp_auth import load_mini_user
from app.services.miniapp_order_payments import (
    OrderPayConflict,
    OrderPayNotFound,
    order_pay_methods,
    order_payment_status,
    parse_plan_payment,
    parse_renewal_payment,
    pay_plan_order,
    pay_renewal_order,
    submit_order_receipt,
)
from app.services.miniapp_shop import mini_scope
from app.services.redact import user_safe_error
from app.services.reseller_bots import ShopBotUnavailable, open_notify_bot_for_user
from app.services.wallet_topup import RECEIPT_MAX_BYTES

logger = logging.getLogger(__name__)

_PAY_FAILED = "شروع پرداخت ناموفق بود"


def _refusal(exc: ValueError, *, fallback: str) -> HTTPException:
    if isinstance(exc, OrderPayNotFound):
        return HTTPException(404, str(exc))
    if isinstance(exc, OrderPayConflict):
        return HTTPException(409, str(exc))
    return HTTPException(400, user_safe_error(exc, fallback=fallback))


def register_miniapp_order_payments(app: FastAPI, *, get_db) -> None:
    @app.get("/api/mini/pay/methods")
    async def mini_pay_methods(request: Request, session: AsyncSession = Depends(get_db)):
        user = await load_mini_user(session, request)
        await _require_commerce_ready(session, user)
        return _no_store(order_pay_methods(await _scope_ui(session, request)))

    @app.post("/api/mini/order/pay")
    async def mini_order_pay(request: Request, session: AsyncSession = Depends(get_db)):
        user = await load_mini_user(session, request)
        await _require_commerce_ready(session, user)
        user_id = int(user.id)
        body = await _json_object(request)
        service_name = service_name_field(body)
        # A shop that requires a name refuses a missing or invalid one before any order exists.
        await check_buy_extras(session, user, mini_scope(request), staff_free=False, service_name=service_name)
        ui = await _scope_ui(session, request)
        try:
            result = await pay_plan_order(
                session, user_id=user_id, shop_id=mini_scope(request).shop_id, ui=ui, req=parse_plan_payment(body),
                service_name=service_name,
            )
        except ValueError as exc:
            await rollback_quiet(session)
            raise _refusal(exc, fallback=_PAY_FAILED) from None
        except Exception:
            await rollback_quiet(session)
            logger.exception("mini order pay failed user=%s", user_id)
            raise HTTPException(500, _PAY_FAILED) from None
        return _no_store(result.payload())

    @app.post("/api/mini/renew/pay")
    async def mini_renew_pay(request: Request, session: AsyncSession = Depends(get_db)):
        user = await load_mini_user(session, request)
        await _require_commerce_ready(session, user)
        user_id = int(user.id)
        body = await _json_object(request)
        ui = await _scope_ui(session, request)
        try:
            result = await pay_renewal_order(
                session, user_id=user_id, shop_id=mini_scope(request).shop_id, ui=ui, req=parse_renewal_payment(body)
            )
        except ValueError as exc:
            await rollback_quiet(session)
            raise _refusal(exc, fallback="شروع پرداخت تمدید ناموفق بود") from None
        except Exception:
            await rollback_quiet(session)
            logger.exception("mini renewal pay failed user=%s", user_id)
            raise HTTPException(500, "شروع پرداخت تمدید ناموفق بود") from None
        return _no_store(result.payload())

    @app.get("/api/mini/order/payments/{payment_id}")
    async def mini_order_payment(payment_id: int, request: Request, session: AsyncSession = Depends(get_db)):
        user = await load_mini_user(session, request)
        await _require_commerce_ready(session, user)
        try:
            status = await order_payment_status(
                session, user_id=int(user.id), shop_id=mini_scope(request).shop_id, payment_id=_valid_id(payment_id)
            )
        except ValueError as exc:
            raise _refusal(exc, fallback="دریافت وضعیت پرداخت ناموفق بود") from None
        return _no_store(status)

    @app.post("/api/mini/order/payments/{payment_id}/receipt")
    async def mini_order_receipt(payment_id: int, request: Request, session: AsyncSession = Depends(get_db)):
        user = await load_mini_user(session, request)
        await _require_commerce_ready(session, user)
        payment_id = _valid_id(payment_id)
        image = await _read_capped(request, RECEIPT_MAX_BYTES)
        shop_id = mini_scope(request).shop_id
        try:
            bot, should_close = await open_notify_bot_for_user(session, user, shop_id=shop_id)
        except ShopBotUnavailable:
            logger.warning("mini order receipt: shop bot unavailable shop=%s", shop_id, exc_info=True)
            raise HTTPException(503, "ربات فروشگاه در دسترس نیست؛ کمی بعد دوباره تلاش کنید") from None
        try:
            result = await submit_order_receipt(
                session, bot=bot, user_id=int(user.id), shop_id=shop_id, telegram_id=int(user.telegram_id),
                payment_id=payment_id, image=image,
            )
        except ValueError as exc:
            raise _refusal(exc, fallback="ثبت رسید ناموفق بود") from None
        finally:
            if should_close:
                await bot.session.close()
        return _no_store({"status": result.status, "message": result.message})
