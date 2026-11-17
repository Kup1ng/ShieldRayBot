"""Mini App entry gate: show the shop's entry terms and accept them (with an optional referral code).

Thin routes over ``app.services.miniapp_access``. They are the only Mini App routes that load
the person without the terms gate, so the page can show the terms while every other route
answers 403 with ``X-Mini-Error: terms``. Force-join, blocking and shop membership still apply.
"""

from __future__ import annotations

from fastapi import Depends, FastAPI, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.miniapp_pages import _no_store, _scope_ui
from app.api.miniapp_topup import _json_object
from app.services.db_safe import rollback_quiet
from app.services.miniapp_access import AccessError, accept_access, access_state
from app.services.miniapp_auth import is_gated_customer, load_mini_user
from app.services.miniapp_shop import mini_scope


def register_miniapp_access(app: FastAPI, *, get_db) -> None:
    @app.get("/api/mini/access")
    async def mini_access(request: Request, session: AsyncSession = Depends(get_db)):
        user = await load_mini_user(session, request, terms_gate=False)
        scope = mini_scope(request)
        state = await access_state(
            session, user, shop_id=scope.shop_id, gated=is_gated_customer(user, scope),
            ui=await _scope_ui(session, request),
        )
        return _no_store(state.payload())

    @app.post("/api/mini/access")
    async def mini_access_accept(request: Request, session: AsyncSession = Depends(get_db)):
        user = await load_mini_user(session, request, terms_gate=False)
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
