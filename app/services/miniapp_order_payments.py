"""Paying an order outside the bot chat (Mini App): card, gateway, crypto or online gateway.

The order path is the bot's own: a plan order comes from ``create_order`` (or is the
customer's discounted checkout order), a renewal from ``renew_service_with_plan``, the
payment is opened by ``start_method_payment``, and a receipt goes through
``submit_receipt``, so reviewers, auto-approval and delivery are the same as for a photo
sent to the bot. This module only checks the customer's choices, keeps a repeated request
on the same order and payment, and turns an uploaded image into the Telegram file the
reviewers already work with.

Idempotency: every payment attempt carries a random ``request_key``. It is kept on the order
in the unique ``orders.renewal_request_key`` column: the preview key itself for a renewal
(as ``/api/mini/renew`` does), ``mini-buy:<key>`` for a plan order so it can never match a
renewal key. The payment is opened under an atomic claim of the order (pending or rejected
to awaiting receipt) in the same transaction as ``start_method_payment``, so a double tap or
a retry after a lost reply returns the open payment instead of replacing it.

Every function takes the Mini App's ``shop_id`` (None is the platform) and reads or changes
only that shop's orders of that customer.

The open-payment limit is a count followed by an insert, so starting a payment is serialized
per customer and shop (one process serves the Mini App); different customers never wait on
each other.
"""

from __future__ import annotations

import asyncio
import logging
import re
import weakref
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError
from aiogram.types import BufferedInputFile
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Order, OrderStatus, Payment, PaymentStatus, UserService
from app.services.catalog_pricing import sale_price
from app.services.chat_records import keeps_sent
from app.services.crypto_rates import CryptoQuote, attach_quote, format_amount, quote_from_settings, validity_note
from app.services.db_safe import rollback_quiet
from app.services.funnel_events import STEP_PAY_START, record_order_funnel
from app.services.message_variables import DOMAIN_PAYMENT, render_message_template
from app.services.orders import (
    cancel_order,
    create_order,
    get_catalog_plan,
    renew_service_with_plan,
    start_method_payment,
)
from app.services.payment_settlement import (
    create_card_auto_awaiting,
    create_psp_checkout,
    public_checkout_button_url,
)
from app.services.receipts import submit_receipt
from app.services.rich_text import visible_text
from app.services.service_renewals import renewal_terms
from app.services.service_scope import customer_may_use_service
from app.services.users import on
from app.services.wallet_topup import (
    OUTSIDE_BOT_METHODS,
    RECEIPT_MAX_BYTES,
    RECEIPT_METHODS,
    TOPUP_METHODS,
    ReceiptResult,
    TopupError,
    _choose_destination,
    receipt_image_kind,
    topup_options,
)

logger = logging.getLogger(__name__)

_REQUEST_KEY = re.compile(r"^[0-9a-fA-F]{32}$")
BUY_KEY_PREFIX = "mini-buy:"
_ID_MAX = 2**31 - 1
_PRICE_MAX = 2**31 - 1
# Unpaid order payments without a receipt a customer may open at once in one shop.
OPEN_PAYMENT_LIMIT = 3
OPEN_PAYMENT_WINDOW = timedelta(days=1)
# An order in these states may get its first (or, after a rejection, a new) payment.
_STARTABLE = (OrderStatus.PENDING.value, OrderStatus.REJECTED.value)
# A receipt is accepted only while the order still waits for one.
_RECEIPT_ORDER_STATES = frozenset({OrderStatus.PENDING.value, OrderStatus.AWAITING_RECEIPT.value})
_CARD_AUTO_SECRET_MIN = 16
# One lock per (customer, shop) while a payment starts; entries vanish once nobody holds them.
_START_LOCKS: weakref.WeakValueDictionary[tuple[int, int | None], asyncio.Lock] = weakref.WeakValueDictionary()

STATUS_MESSAGES = {
    "waiting_receipt": "منتظر رسید پرداخت",
    "waiting_payment": "منتظر پرداخت در درگاه",
    "review": "رسید ثبت شد و در حال بررسی است؛ پس از تأیید، سرویس فعال می‌شود",
    "approved": "پرداخت تأیید شد؛ سرویس در حال آماده‌سازی است",
    "delivered": "پرداخت تأیید شد و سرویس فعال است",
    "rejected": "رسید تأیید نشد؛ برای پیگیری با پشتیبانی در تماس باشید",
    "expired": "این پرداخت بسته شده است",
}


class OrderPayError(ValueError):
    """A rule the customer must see (Persian, safe to show)."""


class OrderPayNotFound(OrderPayError):
    """The order, service or payment is not this customer's in this shop."""


class OrderPayConflict(OrderPayError):
    """The request clashes with what was already done for this order."""


# --- input -------------------------------------------------------------------------


@dataclass(slots=True)
class PayChoice:
    """How the customer wants to pay: a method key and, when the shop offers a choice, a destination."""

    method: str
    dest_id: str | None


@dataclass(slots=True)
class PlanPayment:
    plan_id: int
    price: int
    order_id: int | None
    request_key: str
    choice: PayChoice


@dataclass(slots=True)
class RenewalPayment:
    service_id: int
    plan_id: int
    price: int
    terms: object
    request_key: str
    choice: PayChoice


def _positive_id(value: object, message: str) -> int:
    if type(value) is not int or not 0 < value <= _ID_MAX:
        raise OrderPayError(message)
    return value


def _price(value: object) -> int:
    if type(value) is not int or not 0 <= value <= _PRICE_MAX:
        raise OrderPayError("مبلغ تأییدشده نامعتبر است")
    return value


def clean_request_key(value: object) -> str:
    if not isinstance(value, str) or not _REQUEST_KEY.fullmatch(value):
        raise OrderPayError("شناسهٔ درخواست پرداخت نامعتبر است")
    return value


def _choice(body: dict) -> PayChoice:
    method = body.get("method")
    if not isinstance(method, str) or method not in OUTSIDE_BOT_METHODS:
        raise OrderPayError("روش پرداخت نامعتبر است")
    dest_id = body.get("dest_id")
    if dest_id is not None and not isinstance(dest_id, str):
        raise OrderPayError("مقصد پرداخت نامعتبر است")
    return PayChoice(method=method, dest_id=dest_id)


def parse_plan_payment(body: dict) -> PlanPayment:
    order_id = body.get("order_id")
    return PlanPayment(
        plan_id=_positive_id(body.get("plan_id"), "پلن را انتخاب کنید"),
        price=_price(body.get("price")),
        order_id=None if order_id is None else _positive_id(order_id, "سفارش نامعتبر است"),
        request_key=clean_request_key(body.get("request_key")),
        choice=_choice(body),
    )


def parse_renewal_payment(body: dict) -> RenewalPayment:
    preview = body.get("preview")
    if not isinstance(preview, dict):
        raise OrderPayError("پیش‌نمایش تمدید معتبر نیست؛ دوباره پلن را انتخاب کنید")
    return RenewalPayment(
        service_id=_positive_id(body.get("service_id"), "سرویس را انتخاب کنید"),
        plan_id=_positive_id(body.get("plan_id"), "پلن تمدید را انتخاب کنید"),
        price=_price(preview.get("price")),
        terms=preview.get("terms"),
        request_key=clean_request_key(preview.get("request_key")),
        choice=_choice(body),
    )


# --- methods -------------------------------------------------------------------------


def _card_auto_ready(ui: dict) -> bool:
    """The bot refuses card payments while auto-confirmation is on without its webhook secret."""
    if not on(ui.get("pay_card_auto_enabled")):
        return True
    return len(str(ui.get("card_auto_webhook_secret") or "").strip()) >= _CARD_AUTO_SECRET_MIN


def order_pay_methods(ui: dict) -> dict[str, Any]:
    """The non-wallet ways to pay an order here: the bot's pay buttons that work outside the chat."""
    methods = [
        {
            "id": item["key"],
            "label": item["label"],
            "needs_receipt": item["needs_receipt"],
            "destinations": item["choices"],
        }
        for item in topup_options(ui)["methods"]
        if item["key"] != "card" or _card_auto_ready(ui)
    ]
    return {"wallet_pay_enabled": on(ui.get("pay_wallet_enabled")), "methods": methods}


def _destination(ui: dict, choice: PayChoice, seed: str) -> dict[str, Any]:
    """The card, gateway or wallet to pay to; refuses a method or destination the shop does not offer."""
    if not on(ui.get(TOPUP_METHODS[choice.method][0])):
        raise OrderPayError("این روش پرداخت غیرفعال است")
    if choice.method == "card" and not _card_auto_ready(ui):
        raise OrderPayError("این روش پرداخت در حال حاضر در دسترس نیست")
    try:
        return _choose_destination(choice.method, ui, choice.dest_id, seed)
    except TopupError as exc:
        raise OrderPayError(str(exc)) from None


# --- orders --------------------------------------------------------------------------


def _shop_orders(shop_id: int | None):
    return Order.reseller_id.is_(None) if shop_id is None else Order.reseller_id == int(shop_id)


def _is_shop_order(order: Order, user_id: int, shop_id: int | None) -> bool:
    shop = int(order.reseller_id) if order.reseller_id else None
    return int(order.user_id) == int(user_id) and shop == shop_id


async def _keyed_order(session: AsyncSession, key: str, user_id: int, shop_id: int | None) -> Order | None:
    return await session.scalar(
        select(Order).where(Order.renewal_request_key == key, Order.user_id == int(user_id), _shop_orders(shop_id))
    )


def _start_lock(user_id: int, shop_id: int | None) -> asyncio.Lock:
    key = (int(user_id), shop_id)
    lock = _START_LOCKS.get(key)
    if lock is None:
        lock = asyncio.Lock()
        _START_LOCKS[key] = lock
    return lock


async def _assert_open_payment_room(session: AsyncSession, user_id: int, shop_id: int | None) -> None:
    open_count = await session.scalar(
        select(func.count())
        .select_from(Payment)
        .join(Order, Order.id == Payment.order_id)
        .where(
            Payment.user_id == int(user_id),
            Payment.is_wallet_topup.is_(False),
            Payment.status == PaymentStatus.PENDING.value,
            Payment.receipt_file_id.is_(None),
            Payment.created_at >= datetime.now(timezone.utc) - OPEN_PAYMENT_WINDOW,
            _shop_orders(shop_id),
        )
    )
    if int(open_count or 0) >= OPEN_PAYMENT_LIMIT:
        raise OrderPayError("چند پرداخت نیمه‌تمام دارید؛ ابتدا رسید یکی را بفرستید یا کمی بعد دوباره تلاش کنید")


async def _claim_key(session: AsyncSession, order_id: int, key: str) -> bool:
    """Write the request key on an order that has none; False when the key or the order is taken."""
    try:
        claim = await session.execute(
            update(Order)
            .where(Order.id == order_id, Order.renewal_request_key.is_(None))
            .values(renewal_request_key=key)
            .execution_options(synchronize_session=False)
        )
        await session.commit()
    except IntegrityError:
        await rollback_quiet(session)
        return False
    return claim.rowcount == 1


async def _new_plan_order(session: AsyncSession, user_id: int, shop_id: int | None, req: PlanPayment) -> Order:
    """A new order of this shop's plan carrying the request key; a racing twin is cancelled."""
    plan = await get_catalog_plan(session, req.plan_id)
    if plan is None or not plan.is_active:
        raise OrderPayError("پلن یافت نشد")
    if plan.is_trial or sale_price(plan) <= 0:
        raise OrderPayError("این پلن پرداخت لازم ندارد؛ آن را از خرید با کیف پول بگیرید")
    await _assert_open_payment_room(session, user_id, shop_id)
    order = await create_order(session, user_id=user_id, plan_id=req.plan_id, expected_price=req.price)
    order_id = int(order.id)
    key = BUY_KEY_PREFIX + req.request_key
    if await _claim_key(session, order_id, key):
        await record_order_funnel(session, order, STEP_PAY_START, key=f"pay_start:order:{order_id}")
        return order
    # Another request with the same key won: drop this copy before anything was paid.
    try:
        await cancel_order(session, await session.get(Order, order_id), note="mini app duplicate payment request")
    except ValueError:
        logger.warning("mini order pay: duplicate order not cancelled order=%s", order_id, exc_info=True)
    winner = await _keyed_order(session, key, user_id, shop_id)
    if winner is None or winner.plan_id != req.plan_id:
        raise OrderPayConflict("درخواست پرداخت نامعتبر است؛ صفحه را تازه کنید و دوباره تلاش کنید")
    return winner


async def _checkout_order(session: AsyncSession, user_id: int, shop_id: int | None, req: PlanPayment) -> Order:
    """The customer's own unpaid discounted checkout order of this plan, now carrying the request key."""
    order = await session.get(Order, int(req.order_id or 0))
    if (
        order is None
        or not _is_shop_order(order, user_id, shop_id)
        or order.plan_id != req.plan_id
        or order.service_id is not None
    ):
        raise OrderPayNotFound("سفارش پیدا نشد")
    if order.status not in _STARTABLE:
        raise OrderPayConflict("این سفارش دیگر قابل پرداخت نیست")
    if int(order.amount) <= 0:
        raise OrderPayError("این سفارش پرداخت لازم ندارد")
    if int(order.amount) != req.price:
        raise OrderPayError("قیمت تغییر کرده است؛ صفحه را تازه کنید و دوباره تأیید کنید")
    await _assert_open_payment_room(session, user_id, shop_id)
    order_id = int(order.id)
    key = BUY_KEY_PREFIX + req.request_key
    if not await _claim_key(session, order_id, key) and not await _rekey_unstarted(session, order_id, key):
        raise OrderPayConflict("برای این سفارش پرداخت دیگری شروع شده است")
    return await session.get(Order, order_id, populate_existing=True)


async def _rekey_unstarted(session: AsyncSession, order_id: int, key: str) -> bool:
    """Move a checkout to a new request key when its earlier key never opened a payment.

    A start can fail after the key was written (a phone number the shop requires, say); the
    page then sends a fresh key, which must not leave the order unpayable forever.
    """
    has_payment = await session.scalar(
        select(Payment.id)
        .where(
            Payment.order_id == order_id,
            Payment.status.in_((PaymentStatus.PENDING.value, PaymentStatus.APPROVED.value)),
        )
        .limit(1)
    )
    if has_payment is not None:
        return False
    old = await session.scalar(select(Order.renewal_request_key).where(Order.id == order_id))
    if not old or not str(old).startswith(BUY_KEY_PREFIX):
        return False
    try:
        claim = await session.execute(
            update(Order)
            .where(Order.id == order_id, Order.renewal_request_key == old, Order.status.in_(_STARTABLE))
            .values(renewal_request_key=key)
            .execution_options(synchronize_session=False)
        )
        await session.commit()
    except IntegrityError:
        await rollback_quiet(session)
        return False
    return claim.rowcount == 1


async def _plan_order(session: AsyncSession, user_id: int, shop_id: int | None, req: PlanPayment) -> Order:
    existing = await _keyed_order(session, BUY_KEY_PREFIX + req.request_key, user_id, shop_id)
    if existing is not None:
        if existing.plan_id != req.plan_id or (req.order_id is not None and int(existing.id) != req.order_id):
            raise OrderPayConflict("این درخواست پرداخت برای سفارش دیگری است")
        return existing
    if req.order_id is not None:
        return await _checkout_order(session, user_id, shop_id, req)
    return await _new_plan_order(session, user_id, shop_id, req)


async def _renewal_service(session: AsyncSession, user_id: int, shop_id: int | None, service_id: int) -> UserService:
    svc = await session.get(UserService, service_id)
    if not await customer_may_use_service(session, svc, user_id, shop_id):
        raise OrderPayNotFound("سرویس پیدا نشد")
    if (svc.remark or "").strip() == "linked":
        raise OrderPayError("سرویس متصل‌شده فقط مشاهده است؛ تمدید از این مسیر ممکن نیست")
    return svc


async def _renewal_order(session: AsyncSession, user_id: int, shop_id: int | None, req: RenewalPayment) -> Order:
    """The renewal order of this preview: created once, found again on a repeat."""
    svc = await _renewal_service(session, user_id, shop_id, req.service_id)
    plan = await get_catalog_plan(session, req.plan_id)
    if plan is None or not plan.is_active or plan.is_trial:
        raise OrderPayError("پلن تمدید نامعتبر است")
    if req.terms != renewal_terms(plan) or req.price != sale_price(plan):
        raise OrderPayError("پیش‌نمایش تمدید معتبر نیست یا پلن تغییر کرده؛ دوباره پلن را انتخاب کنید")
    if req.price <= 0:
        raise OrderPayError("این تمدید پرداخت لازم ندارد؛ آن را با کیف پول انجام دهید")
    if await _keyed_order(session, req.request_key, user_id, shop_id) is None:
        await _assert_open_payment_room(session, user_id, shop_id)
    return await renew_service_with_plan(
        session, user_id=user_id, service=svc, plan=plan, request_key=req.request_key, expected_price=req.price,
    )


# --- payment -------------------------------------------------------------------------


async def _open_payment(session: AsyncSession, order_id: int, user_id: int, method: str) -> Payment:
    """The payment an earlier request opened on this order (a repeat never opens a second one)."""
    payment = await session.scalar(
        select(Payment)
        .where(
            Payment.order_id == order_id,
            Payment.user_id == int(user_id),
            Payment.status.in_((PaymentStatus.PENDING.value, PaymentStatus.APPROVED.value)),
        )
        .order_by(Payment.id.desc())
        .limit(1)
    )
    if payment is None:
        raise OrderPayConflict("این سفارش دیگر قابل پرداخت نیست")
    if payment.method != TOPUP_METHODS[method][1]:
        raise OrderPayConflict("برای این سفارش روش پرداخت دیگری انتخاب شده است")
    return payment


async def _start_once(session: AsyncSession, order: Order, user_id: int, method: str) -> tuple[Payment, bool]:
    """Open the order's payment under an atomic claim; (payment, True) only for the request that opened it.

    The claim and ``start_method_payment`` commit together, so a failed start leaves the order
    as it was, and a concurrent repeat waits on the claimed row and then finds the payment.
    """
    order_id = int(order.id)
    await session.commit()
    with session.no_autoflush:
        claim = await session.execute(
            update(Order)
            .where(Order.id == order_id, Order.status.in_(_STARTABLE))
            .values(status=OrderStatus.AWAITING_RECEIPT.value)
            .execution_options(synchronize_session=False)
        )
    if claim.rowcount != 1:
        await rollback_quiet(session)
        return await _open_payment(session, order_id, user_id, method), False
    try:
        payment = await start_method_payment(session, order, user_id, TOPUP_METHODS[method][1])
    except ValueError:
        await rollback_quiet(session)
        raise
    return payment, True


def _gateway_link(destination: dict[str, Any], order: Order, payment: Payment) -> str | None:
    link = str(destination.get("link") or "").strip()
    if not link:
        return None
    try:
        link = render_message_template(
            link, domain=DOMAIN_PAYMENT, amount=payment.amount, order_id=int(order.id),
            payment_id=int(payment.id), html=False,
        )
    except ValueError:
        logger.warning("order gateway link template rejected payment=%s", payment.id, exc_info=True)
    return link if link.startswith(("https://", "http://")) else None


async def _card_details(session: AsyncSession, payment: Payment, destination: dict[str, Any], ui: dict) -> dict:
    out: dict[str, Any] = {
        "card_number": str(destination.get("number") or ""),
        "holder": str(destination.get("holder") or "") or None,
    }
    if on(ui.get("pay_card_auto_enabled")) and payment.status == PaymentStatus.PENDING.value:
        # Registers (or reuses) the payment's single open card-auto settlement, as the bot does.
        await create_card_auto_awaiting(session, payment)
        out["note"] = visible_text(ui.get("card_auto_hint_text")) or None
    return out


async def _psp_details(session: AsyncSession, order: Order, payment: Payment, destination: dict, ui: dict) -> dict:
    if payment.status != PaymentStatus.PENDING.value:
        return {}
    # Creates the gateway checkout, or reuses the open one: a repeat never opens a second.
    settlement = await create_psp_checkout(
        session, payment, description=f"سفارش #{order.id}", gateway_id=str(destination["id"])
    )
    url = public_checkout_button_url(settlement, ui=ui)
    return {"link": url if url.startswith(("https://", "http://")) else None, "settlement_id": int(settlement.id)}


@dataclass(slots=True)
class _SavedQuote:
    """The validity of a quote saved on a payment, for ``validity_note``."""

    expires_at: datetime


def _crypto_details(payment: Payment, destination: dict[str, Any]) -> dict:
    out: dict[str, Any] = {
        "asset": str(destination.get("asset") or "USDT"),
        "network": str(destination.get("network") or "") or None,
        "address": str(destination.get("address") or ""),
    }
    if payment.crypto_amount_micro and payment.crypto_asset:
        out["crypto_amount"] = format_amount(int(payment.crypto_amount_micro))
        out["asset"] = str(payment.crypto_asset)
        expires = payment.crypto_quote_expires_at
        if isinstance(expires, datetime) and payment.status == PaymentStatus.PENDING.value:
            quote = _SavedQuote(expires if expires.tzinfo else expires.replace(tzinfo=timezone.utc))
            out["note"] = validity_note(quote).strip()
    return out


async def _payment_payload(
    session: AsyncSession, order: Order, payment: Payment, method: str, destination: dict[str, Any], ui: dict
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": int(payment.id), "amount": int(payment.amount), "method": method,
        "needs_receipt": method in RECEIPT_METHODS,
    }
    if method == "card":
        out.update(await _card_details(session, payment, destination, ui))
    elif method == "gateway":
        out.update({"gateway_name": str(destination.get("name") or "درگاه"),
                    "link": _gateway_link(destination, order, payment)})
    elif method == "psp":
        out.update(await _psp_details(session, order, payment, destination, ui))
    else:
        out.update(_crypto_details(payment, destination))
    return {k: v for k, v in out.items() if v is not None}


@dataclass(slots=True)
class OrderPayment:
    order_id: int
    payment: dict[str, Any]

    def payload(self) -> dict[str, Any]:
        return {"order_id": self.order_id, "payment": self.payment}


def _crypto_quote(ui: dict, destination: dict[str, Any], amount: int) -> CryptoQuote | None:
    """The bot's crypto conversion for this wallet (None when the shop does not convert)."""
    return quote_from_settings(ui, wallet_asset=str(destination.get("asset") or "USDT"), toman=int(amount))


async def _pay(session: AsyncSession, order: Order, user_id: int, choice: PayChoice, ui: dict) -> OrderPayment:
    order_id = int(order.id)
    # Same seed as the bot's card button: a card the shop picks stays the same for this order.
    destination = _destination(ui, choice, f"order:{order_id}")
    quote = _crypto_quote(ui, destination, int(order.amount)) if choice.method == "crypto" else None
    payment, opened = await _start_once(session, order, user_id, choice.method)
    payment_id = int(payment.id)
    if opened and quote is not None:
        await attach_quote(session, payment_id, quote)
    # A rollback or commit above may have expired the loaded rows; read them again.
    order = await session.get(Order, order_id, populate_existing=True)
    payment = await session.get(Payment, payment_id, populate_existing=True)
    return OrderPayment(order_id, await _payment_payload(session, order, payment, choice.method, destination, ui))


async def pay_plan_order(
    session: AsyncSession, *, user_id: int, shop_id: int | None, ui: dict, req: PlanPayment
) -> OrderPayment:
    """Open (or find again) the payment of a plan order of this shop.

    The caller has set the shop context to ``shop_id``, so ``create_order`` sells only that
    shop's plans and records the order as that shop's.
    """
    _destination(ui, req.choice, "order:new")
    async with _start_lock(user_id, shop_id):
        order = await _plan_order(session, user_id, shop_id, req)
        return await _pay(session, order, user_id, req.choice, ui)


async def pay_renewal_order(
    session: AsyncSession, *, user_id: int, shop_id: int | None, ui: dict, req: RenewalPayment
) -> OrderPayment:
    """Open (or find again) the payment of the renewal this preview describes."""
    _destination(ui, req.choice, "order:new")
    async with _start_lock(user_id, shop_id):
        order = await _renewal_order(session, user_id, shop_id, req)
        return await _pay(session, order, user_id, req.choice, ui)


# --- receipt and status ----------------------------------------------------------------


async def _own_order_payment(
    session: AsyncSession, *, user_id: int, shop_id: int | None, payment_id: int
) -> tuple[Payment, Order]:
    payment = await session.get(Payment, int(payment_id))
    order = await session.get(Order, int(payment.order_id)) if payment is not None and payment.order_id else None
    if (
        payment is None
        or order is None
        or payment.is_wallet_topup
        or int(payment.user_id) != int(user_id)
        or not _is_shop_order(order, user_id, shop_id)
    ):
        raise OrderPayNotFound("پرداخت پیدا نشد")
    return payment, order


def payment_state(payment: Payment, order: Order) -> str:
    if payment.status == PaymentStatus.APPROVED.value:
        return "delivered" if order.status == OrderStatus.DELIVERED.value else "approved"
    if payment.status == PaymentStatus.PENDING.value:
        return "review" if payment.receipt_file_id else "waiting_receipt"
    return "rejected" if payment.receipt_file_id else "expired"


def _state_message(state: str, payment: Payment) -> str:
    if state == "waiting_receipt" and payment.method == TOPUP_METHODS["psp"][1]:
        return STATUS_MESSAGES["waiting_payment"]
    return STATUS_MESSAGES[state]


async def order_payment_status(
    session: AsyncSession, *, user_id: int, shop_id: int | None, payment_id: int
) -> dict[str, Any]:
    payment, order = await _own_order_payment(session, user_id=user_id, shop_id=shop_id, payment_id=payment_id)
    state = payment_state(payment, order)
    paid_at = None
    if payment.status == PaymentStatus.APPROVED.value:
        paid_at = _iso(payment.receipt_at or payment.created_at)
    return {
        "status": state,
        "message": _state_message(state, payment),
        "order_id": int(order.id),
        "service_id": int(order.service_id) if order.service_id else None,
        "amount": int(payment.amount),
        "method": payment.method,
        "paid_at": paid_at,
    }


async def _receipt_target(
    session: AsyncSession, *, user_id: int, shop_id: int | None, payment_id: int
) -> tuple[Payment, Order]:
    """The caller's own order payment in this shop that still waits for its first receipt."""
    payment, order = await _own_order_payment(session, user_id=user_id, shop_id=shop_id, payment_id=payment_id)
    if payment.method not in {TOPUP_METHODS[key][1] for key in RECEIPT_METHODS}:
        raise OrderPayError("این پرداخت رسید لازم ندارد")
    if payment.status != PaymentStatus.PENDING.value or order.status not in _RECEIPT_ORDER_STATES:
        raise OrderPayError("این پرداخت دیگر باز نیست")
    if payment.receipt_file_id:
        raise OrderPayError("رسید این پرداخت قبلاً ثبت شده است")
    return payment, order


def _checked_image(image: bytes) -> str:
    if not image or len(image) > RECEIPT_MAX_BYTES:
        raise OrderPayError("حجم تصویر رسید باید کمتر از ۸ مگابایت باشد")
    kind = receipt_image_kind(image)
    if kind is None:
        raise OrderPayError("فقط تصویر JPG یا PNG رسید را بفرستید")
    return kind


@keeps_sent
async def submit_order_receipt(
    session: AsyncSession,
    *,
    bot: Bot,
    user_id: int,
    shop_id: int | None,
    telegram_id: int,
    payment_id: int,
    image: bytes,
) -> ReceiptResult:
    """Send the image to the customer's own chat, then hand that photo to ``submit_receipt``.

    The photo in their chat is the customer's copy and gives reviewers the same Telegram
    file as a receipt sent in the bot, so ``bot`` must be the shop's own bot. Only the
    first receipt is accepted.
    """
    kind = _checked_image(image)
    payment, order = await _receipt_target(session, user_id=user_id, shop_id=shop_id, payment_id=payment_id)
    # End the read transaction before talking to Telegram.
    await session.commit()
    try:
        sent = await bot.send_photo(
            chat_id=int(telegram_id),
            photo=BufferedInputFile(image, filename=f"receipt-{int(payment.id)}.{kind}"),
            caption=f"رسید سفارش #{int(order.id)} از مینی‌اپ",
        )
    except TelegramAPIError as exc:
        logger.warning("mini app order receipt upload failed payment=%s", payment.id, exc_info=True)
        raise OrderPayError("ارسال رسید ناموفق بود؛ مطمئن شوید ربات را در تلگرام Start کرده‌اید و دوباره تلاش کنید") from exc
    photo = (sent.photo or [None])[-1]
    if photo is None:
        raise OrderPayError("ارسال رسید ناموفق بود؛ دوباره تلاش کنید")
    try:
        await submit_receipt(
            session, payment, bot=bot, file_id=photo.file_id,
            file_unique_id=photo.file_unique_id, user_tg_id=int(telegram_id), first_only=True,
        )
    except ValueError as exc:
        raise OrderPayError("رسید این پرداخت قبلاً ثبت شده یا پرداخت دیگر باز نیست") from exc
    await session.refresh(payment)
    await session.refresh(order)
    if not payment.receipt_file_id:
        # Blocked by the duplicate-receipt policy: nothing was attached.
        raise OrderPayError("این تصویر قبلاً برای پرداخت دیگری ثبت شده است")
    state = payment_state(payment, order)
    return ReceiptResult(status=state, message=_state_message(state, payment))


def _iso(value: datetime | None) -> str | None:
    if not isinstance(value, datetime):
        return None
    return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).isoformat()
