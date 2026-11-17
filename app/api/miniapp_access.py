"""Mini App entry gate: show the shop's entry terms and accept them (with an optional referral code).

Thin routes over ``app.services.miniapp_access``. They load the person without the terms and
entry-approval gates (``load_mini_principal``), so the page can show the terms while every other
route answers 403 with ``X-Mini-Error: terms``. The signature, blocking, shop and force-join
checks still apply.
"""

from __future__ import annotations

from fastapi import Depends, FastAPI, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.miniapp_pages import _no_store, _scope_ui
from app.api.miniapp_topup import _json_object
from app.services.db_safe import rollback_quiet
from app.services.miniapp_access import AccessError, accept_access, access_state
from app.db.models import BotUser
from app.services.miniapp_auth import (
    REFERRAL_REQUIRED,
    assert_mini_force_join,
    is_gated_customer,
    load_mini_principal,
    mini_reject,
)
from app.services.miniapp_shop import mini_scope
from app.services.referral_registration import ReferralRequired


async def _person_before_terms(session: AsyncSession, request: Request) -> BotUser:
    """The signed, registered person who passed the required channels; the terms are this page's job."""
    try:
        user = await load_mini_principal(session, request)
    except ReferralRequired:
        raise mini_reject(403, REFERRAL_REQUIRED) from None
    await assert_mini_force_join(session, user, scope=mini_scope(request))
    return user


def register_miniapp_access(app: FastAPI, *, get_db) -> None:
    @app.get("/api/mini/access")
    async def mini_access(request: Request, session: AsyncSession = Depends(get_db)):
        user = await _person_before_terms(session, request)
        scope = mini_scope(request)
        state = await access_state(
            session, user, shop_id=scope.shop_id, gated=is_gated_customer(user, scope),
            ui=await _scope_ui(session, request),
        )
        return _no_store(state.payload())

    @app.post("/api/mini/access")
    async def mini_access_accept(request: Request, session: AsyncSession = Depends(get_db)):
        user = await _person_before_terms(session, request)
        scope = mini_scope(request)
        body = await _json_object(request)
        try:
            await accept_access(
                session, user, shop_id=scope.shop_id, gated=is_gated_customer(user, scope),
                ui=await _scope_ui(session, request), accept=body.get("accept"),
                referral_code=body.get("referral_code"),
            )
        except AccessError as exc:
            await rollback_quiet(session)
            raise HTTPException(400, str(exc)) from None
        return _no_store({"ok": True})
