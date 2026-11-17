"""Marketing › «تخفیف و کد هدیه» › «کش‌بک»: a shop's cashback rules and settings.

The page is the React panel's (``frontend/src/panel/pages/marketing/CashbackPage.tsx``); it reads
``/api/panel/cashback`` and posts the form handlers below, which keep the scope checks.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any
from urllib.parse import quote

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.spa_pages import spa_response
from app.db.models import CashbackRule
from app.services.cashback_rules import (
    COMBINE_MODES,
    EVENTS,
    MAX_MONEY,
    RULE_LIMIT,
    CashbackSettings,
    RuleInput,
    budget_used,
    cashback_scope,
    delete_rule,
    list_rules,
    load_settings,
    save_rule,
    save_settings,
    set_rule_enabled,
)
from app.services.marketing_panel import marketing_tabs
from app.services.numbers import parse_int

PAGE = "/cashback"
API_PATH = "/api/panel/cashback"
DENIED = "دسترسی ندارید"
MAX_PERCENT_BPS = 10_000
MAX_HOLD_HOURS = 24 * 90
MAX_PRIORITY = 1_000
MAX_MONTHLY_COUNT = 10_000


def _back(*, ok: str = "", err: str = "") -> RedirectResponse:
    query = f"err={quote(err)}" if err else f"ok={quote(ok)}"
    return RedirectResponse(f"{PAGE}?{query}", status_code=303)


def _int(form: Mapping[str, Any], key: str, *, label: str, upper: int = MAX_MONEY, optional: bool = False) -> int | None:
    raw = str(form.get(key) or "").strip()
    if not raw:
        return None if optional else 0
    try:
        value = parse_int(raw)
    except ValueError:
        raise ValueError(f"«{label}» باید عدد باشد") from None
    if value < 0 or value > upper:
        raise ValueError(f"«{label}» خارج از محدودهٔ مجاز است")
    return value


def _percent_bps(form: Mapping[str, Any]) -> int:
    """Percent typed with up to two decimals («2.5») → basis points."""
    raw = str(form.get("percent") or "").strip().replace("٫", ".")
    if not raw:
        return 0
    try:
        bps = round(float(raw) * 100)
    except ValueError:
        raise ValueError("«درصد» باید عدد باشد") from None
    if not 0 <= bps <= MAX_PERCENT_BPS:
        raise ValueError("«درصد» باید بین ۰ تا ۱۰۰ باشد")
    return int(bps)


def rule_from_form(form: Mapping[str, Any]) -> RuleInput:
    """The submitted rule; raises ``ValueError`` (safe to show)."""
    name = str(form.get("name") or "").strip()[:128]
    if not name:
        raise ValueError("نام قانون الزامی است")
    mode = "fixed" if form.get("mode") == "fixed" else "percent"
    events = [e for e in EVENTS if form.get(f"event_{e}")]
    if not events:
        raise ValueError("حداقل یک نوع خرید را انتخاب کنید")
    data = RuleInput(
        name=name, mode=mode,
        percent_bps=_percent_bps(form) if mode == "percent" else 0,
        fixed_amount=int(_int(form, "fixed_amount", label="مبلغ ثابت") or 0) if mode == "fixed" else 0,
        max_per_order=_int(form, "max_per_order", label="سقف هر سفارش", optional=True),
        min_order_amount=int(_int(form, "min_order_amount", label="حداقل خرید") or 0),
        events=",".join(events),
        first_purchase_only=bool(form.get("first_purchase_only")),
        allow_with_discount=bool(form.get("allow_with_discount")),
        customer_max_count=_int(form, "customer_max_count", label="تعداد در ماه", upper=MAX_MONTHLY_COUNT, optional=True),
        customer_max_amount=_int(form, "customer_max_amount", label="مبلغ در ماه", optional=True),
        priority=int(_int(form, "priority", label="اولویت", upper=MAX_PRIORITY) or 0),
    )
    if data.percent_bps == 0 and data.fixed_amount == 0:
        raise ValueError("درصد یا مبلغ کش‌بک باید بیشتر از صفر باشد")
    return data


def settings_from_form(form: Mapping[str, Any]) -> CashbackSettings:
    combine = str(form.get("combine") or "best")
    return CashbackSettings(
        enabled=bool(form.get("enabled")),
        combine=combine if combine in COMBINE_MODES else "best",
        hold_hours=int(_int(form, "hold_hours", label="دورهٔ انتظار", upper=MAX_HOLD_HOURS) or 0),
        monthly_budget=int(_int(form, "monthly_budget", label="بودجهٔ ماهانه") or 0),
    )


def authorized_scope(staff: dict) -> int | None:
    """The shop whose cashback ``staff`` manages; raises ``HTTPException(403)`` when they may not."""
    try:
        return cashback_scope(staff)
    except PermissionError:
        raise HTTPException(403, DENIED) from None


def _percent_text(percent_bps: int) -> str:
    """Basis points as typed into the form («250» → «2.5»), without float rounding."""
    whole, hundredths = divmod(int(percent_bps), 100)
    return f"{whole}.{hundredths:02d}".rstrip("0").rstrip(".")


def rule_row(rule: CashbackRule) -> dict[str, Any]:
    return {
        "id": int(rule.id),
        "name": rule.name,
        "mode": "fixed" if rule.mode == "fixed" else "percent",
        "percent": _percent_text(rule.percent_bps or 0),
        "fixed_amount": int(rule.fixed_amount or 0),
        "max_per_order": rule.max_per_order,
        "min_order_amount": int(rule.min_order_amount or 0),
        "events": [event for event in (rule.events or "").split(",") if event in EVENTS],
        "first_purchase_only": bool(rule.first_purchase_only),
        "allow_with_discount": bool(rule.allow_with_discount),
        "customer_max_count": rule.customer_max_count,
        "customer_max_amount": rule.customer_max_amount,
        "priority": int(rule.priority or 0),
        "enabled": bool(rule.enabled),
    }


def register_cashback_pages(app: FastAPI, *, require_staff: Callable, get_db: Callable) -> None:
    @app.get(PAGE)
    async def cashback_page(staff: dict = Depends(require_staff)) -> Response:
        authorized_scope(staff)
        return spa_response("cashback")

    @app.get(API_PATH)
    async def cashback_data(
        staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        shop_id = authorized_scope(staff)
        settings = await load_settings(session, shop_id)
        return JSONResponse(
            {
                "sections": marketing_tabs(staff),
                "rules": [rule_row(rule) for rule in await list_rules(session, shop_id)],
                "settings": {
                    "enabled": settings.enabled, "combine": settings.combine,
                    "hold_hours": settings.hold_hours, "monthly_budget": settings.monthly_budget,
                },
                "budget_used": await budget_used(session, shop_id),
                "limits": {
                    "rule_limit": RULE_LIMIT, "max_hold_hours": MAX_HOLD_HOURS,
                    "max_priority": MAX_PRIORITY, "max_monthly_count": MAX_MONTHLY_COUNT,
                },
            },
            headers={"Cache-Control": "no-store"},
        )

    async def _form_action(request: Request, staff: dict, action: Callable) -> RedirectResponse:
        shop_id = authorized_scope(staff)
        form = await request.form()
        try:
            message = await action(shop_id, form)
        except ValueError as exc:
            return _back(err=str(exc))
        return _back(ok=message)

    @app.post(f"{PAGE}/settings")
    async def cashback_settings(
        request: Request, staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db),
    ) -> RedirectResponse:
        async def action(shop_id: int | None, form: Mapping[str, Any]) -> str:
            await save_settings(session, shop_id, settings_from_form(form))
            return "تنظیمات کش‌بک ذخیره شد"
        return await _form_action(request, staff, action)

    _register_rule_routes(app, form_action=_form_action, require_staff=require_staff, get_db=get_db)


def _register_rule_routes(app: FastAPI, *, form_action: Callable, require_staff: Callable, get_db: Callable) -> None:
    @app.post(f"{PAGE}/rules")
    async def cashback_rule_create(
        request: Request, staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db),
    ) -> RedirectResponse:
        async def action(shop_id: int | None, form: Mapping[str, Any]) -> str:
            await save_rule(session, shop_id, rule_from_form(form))
            return "قانون کش‌بک ساخته شد"
        return await form_action(request, staff, action)

    @app.post(PAGE + "/rules/{rule_id}")
    async def cashback_rule_edit(
        rule_id: int, request: Request, staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db),
    ) -> RedirectResponse:
        async def action(shop_id: int | None, form: Mapping[str, Any]) -> str:
            await save_rule(session, shop_id, rule_from_form(form), rule_id=rule_id)
            return "قانون کش‌بک ذخیره شد"
        return await form_action(request, staff, action)

    @app.post(PAGE + "/rules/{rule_id}/toggle")
    async def cashback_rule_toggle(
        rule_id: int, request: Request, staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db),
    ) -> RedirectResponse:
        async def action(shop_id: int | None, form: Mapping[str, Any]) -> str:
            await set_rule_enabled(session, shop_id, rule_id, bool(form.get("enabled")))
            return "وضعیت قانون ذخیره شد"
        return await form_action(request, staff, action)

    @app.post(PAGE + "/rules/{rule_id}/delete")
    async def cashback_rule_delete(
        rule_id: int, request: Request, staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db),
    ) -> RedirectResponse:
        async def action(shop_id: int | None, form: Mapping[str, Any]) -> str:
            await delete_rule(session, shop_id, rule_id)
            return "قانون کش‌بک حذف شد"
        return await form_action(request, staff, action)
