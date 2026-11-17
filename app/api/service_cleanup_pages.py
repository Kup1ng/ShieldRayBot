"""The expired-service cleanup page: the shop's (or the platform's) rule and a read-only preview.

The page is the React panel's (``frontend/src/panel/pages/cleanup/ServiceCleanupPage.tsx``); it reads
``/api/panel/service-cleanup`` and posts the form handlers below, which keep the scope checks.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import asdict
from typing import Any
from urllib.parse import quote

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.spa_pages import spa_response
from app.services.action_reasons import ReasonRequired, reason_from_form
from app.services.service_cleanup_manage import (
    AuditEntry,
    extend_deadline,
    list_exempt,
    parse_hold_days,
    set_exempt,
)
from app.services.shop_scope import resolve_shop_scope_id
from app.services.staff_audit import actor_from_staff
from app.services.service_cleanup import (
    MAX_DAYS,
    MIN_DAYS,
    CleanupPolicy,
    CleanupPolicyError,
    build_preview,
    cleanup_scope,
    load_policy,
    parse_policy_form,
    save_policy,
)

SERVICE_CLEANUP_PATH = "/service-cleanup"
API_PATH = "/api/panel/service-cleanup"
SAVED_TEXT = "تنظیمات پاکسازی سرویس‌ها ذخیره شد"
FORBIDDEN_TEXT = "دسترسی ندارید"


def _scope_or_403(staff: dict) -> int | None:
    """The shop whose cleanup rule ``staff`` manages (``None`` = platform); 403 when they may not.

    A refusal is a 403, never a redirect: the React panel would read a redirect as success.
    """
    try:
        return cleanup_scope(staff)
    except PermissionError:
        raise HTTPException(403, FORBIDDEN_TEXT) from None


def _back(**flash: str) -> RedirectResponse:
    key, value = next(iter(flash.items()))
    return RedirectResponse(f"{SERVICE_CLEANUP_PATH}?{key}={quote(value)}", status_code=303)


def _policy_json(policy: CleanupPolicy) -> dict[str, Any]:
    return {
        "time_on": policy.time_on,
        "time_days": policy.time_days,
        "warn_first": policy.warn_first,
        "warn_last": policy.warn_last,
        "volume_on": policy.volume_on,
        "volume_days": policy.volume_days,
    }


async def _exempt_service(
    session: AsyncSession, staff: dict, form: Mapping[str, Any], *, shop_id: int | None, service_id: int
) -> RedirectResponse:
    try:
        reason = reason_from_form(form)
    except ReasonRequired as exc:
        return _back(err=str(exc))
    keep = str(form.get("value") or "") == "1"
    audit = AuditEntry(
        actor_from_staff(staff, shop_id=resolve_shop_scope_id(staff)),
        "service_cleanup_exempt" if keep else "service_cleanup_unexempt",
        reason,
    )
    try:
        await set_exempt(session, shop_id=shop_id, service_id=service_id, exempt=keep, audit=audit)
    except ValueError as exc:
        return _back(err=str(exc))
    return _back(ok="سرویس از پاکسازی معاف شد" if keep else "سرویس دوباره در پاکسازی قرار گرفت")


async def _hold_service(
    session: AsyncSession, staff: dict, form: Mapping[str, Any], *, shop_id: int | None, service_id: int
) -> RedirectResponse:
    try:
        reason = reason_from_form(form)
        days = parse_hold_days(form.get("days"))
    except (ReasonRequired, CleanupPolicyError) as exc:
        return _back(err=str(exc))
    policy = await load_policy(session, shop_id=shop_id)
    audit = AuditEntry(actor_from_staff(staff, shop_id=resolve_shop_scope_id(staff)), "service_cleanup_hold", reason)
    try:
        until = await extend_deadline(session, shop_id=shop_id, service_id=service_id, days=days, policy=policy, audit=audit)
    except ValueError as exc:
        return _back(err=str(exc))
    return _back(ok=f"مهلت حذف تا {until} تمدید شد")


def register_service_cleanup_pages(app: FastAPI, *, require_staff: Callable, get_db: Callable) -> None:
    @app.get(SERVICE_CLEANUP_PATH)
    async def service_cleanup_page(staff: dict = Depends(require_staff)) -> Response:
        try:
            cleanup_scope(staff)
        except PermissionError:
            return RedirectResponse("/home", status_code=303)
        return spa_response("service-cleanup")

    @app.get(API_PATH)
    async def service_cleanup_data(
        staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db)
    ) -> JSONResponse:
        shop_id = _scope_or_403(staff)
        policy = await load_policy(session, shop_id=shop_id)
        preview = await build_preview(session, shop_id=shop_id, policy=policy)
        exempt = await list_exempt(session, shop_id=shop_id)
        return JSONResponse(
            {
                "policy": _policy_json(policy),
                "min_days": MIN_DAYS,
                "max_days": MAX_DAYS,
                "preview": asdict(preview),
                "exempt": [asdict(row) for row in exempt],
            },
            headers={"Cache-Control": "no-store"},
        )

    @app.post(SERVICE_CLEANUP_PATH)
    async def service_cleanup_save(
        request: Request, staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db)
    ) -> Response:
        shop_id = _scope_or_403(staff)
        form = await request.form()
        try:
            policy = parse_policy_form(form)
        except CleanupPolicyError as exc:
            return _back(err=str(exc))
        await save_policy(session, shop_id=shop_id, policy=policy)
        return _back(ok=SAVED_TEXT)

    @app.post(SERVICE_CLEANUP_PATH + "/{service_id}/exempt")
    async def service_cleanup_exempt(
        service_id: int, request: Request, staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db)
    ) -> Response:
        shop_id = _scope_or_403(staff)
        return await _exempt_service(session, staff, await request.form(), shop_id=shop_id, service_id=service_id)

    @app.post(SERVICE_CLEANUP_PATH + "/{service_id}/hold")
    async def service_cleanup_hold(
        service_id: int, request: Request, staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db)
    ) -> Response:
        shop_id = _scope_or_403(staff)
        return await _hold_service(session, staff, await request.form(), shop_id=shop_id, service_id=service_id)
