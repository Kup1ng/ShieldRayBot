"""What the staff customer screen shows for one customer, as one shop sees them.

Everything is limited to the staff member's shop: its purse, its ledger, its services, its own
note and risk tag. The caller has already checked that the customer is in the staff's scope.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import BotUser, Plan, WalletTransaction
from app.services.authz import authz_from_staff, can_shop
from app.services.bot_user_admin import (
    ServiceSnapshot,
    customer_service_actions,
    list_service_snapshots,
    list_wallet_txs,
    may_manage_customer_services,
)
from app.services.color_tags import ColorTag, color_tag_meta
from app.services.customer_marks import CustomerMarks, marks_for_staff, may_edit_private_marks
from app.services.demo_users import DEMO_USERS_PERMISSION
from app.services.plans_catalog import list_catalog_plans
from app.services.platform_identity import is_explicit_owner_staff
from app.services.loyalty import points_balance
from app.services.shop_customer_block import shop_block_form_context
from app.services.shop_manual_adjust import ManualAdjustError, adjustable_customer, new_request_key
from app.services.shop_points_adjust import points_adjust_shop, shop_points_form_context
from app.services.shop_scope import ShopScopeError, resolve_shop_scope_id
from app.services.shop_wallet_adjust import shop_wallet_form_context
from app.services.wallet import get_wallet_balance

WALLET_LEDGER_LIMIT = 20


@dataclass(slots=True)
class UserEditView:
    user: BotUser
    marks: CustomerMarks
    tag: ColorTag
    wallet_balance: int
    wallet_txs: list[WalletTransaction]
    wallet_nonce: str
    services: list[ServiceSnapshot]
    can_view_services: bool
    plans: list[Plan]
    can_edit_private_marks: bool
    can_manage_users: bool
    can_manage_demo_users: bool
    can_pg_create: bool
    can_pg_update: bool
    can_pg_delete: bool
    shop_wallet: dict[str, object]
    shop_block: dict[str, object]
    points_balance: int
    shop_points: dict[str, object]
    platform_points_nonce: str | None


async def _shop_points_form(session: AsyncSession, staff: dict, user: BotUser) -> dict[str, object]:
    """The shop points form, only when this staff member may change THIS customer's points."""
    context = shop_points_form_context(staff)
    if not context.get("can_adjust_shop_points"):
        return context
    try:
        await adjustable_customer(session, points_adjust_shop(staff), int(user.id))
    except (ManualAdjustError, PermissionError):
        return {"can_adjust_shop_points": False}
    return context


async def load_user_edit_view(session: AsyncSession, staff: dict, user: BotUser) -> UserEditView:
    try:
        shop_scope = resolve_shop_scope_id(staff)
    except ShopScopeError:
        shop_scope = None
    user_id = int(user.id)
    # The purse and the ledger are the staff's own shop's; no other tenant's rows are mixed in.
    wallet_balance = await get_wallet_balance(session, user, shop_id=shop_scope)
    # A customer's services are shown and changed only with the customer_services permission.
    can_view_services = may_manage_customer_services(staff)
    services = await list_service_snapshots(session, user_id, shop_id=shop_scope) if can_view_services else []
    wallet_txs = await list_wallet_txs(session, user_id, limit=WALLET_LEDGER_LIMIT, shop_id=shop_scope)
    plans = await list_catalog_plans(session, staff, include_trial=False)
    pg_acts = customer_service_actions(staff)
    marks = await marks_for_staff(session, staff, user)
    is_owner = is_explicit_owner_staff(staff)
    return UserEditView(
        user=user,
        marks=marks,
        tag=color_tag_meta(marks.tag),
        wallet_balance=wallet_balance,
        wallet_txs=wallet_txs,
        wallet_nonce=secrets.token_hex(8),
        services=services,
        can_view_services=can_view_services,
        plans=plans,
        can_edit_private_marks=await may_edit_private_marks(session, staff, user),
        # Role, account-wide block, delete and the platform purse stay Owner-only.
        can_manage_users=is_owner,
        can_manage_demo_users=can_shop(authz_from_staff(staff), DEMO_USERS_PERMISSION),
        can_pg_create=bool(pg_acts.get("create")),
        can_pg_update=bool(pg_acts.get("update")),
        can_pg_delete=bool(pg_acts.get("delete")),
        shop_wallet=shop_wallet_form_context(staff),
        shop_block=await shop_block_form_context(session, staff, user),
        points_balance=await points_balance(session, user, shop_scope),
        shop_points=await _shop_points_form(session, staff, user),
        platform_points_nonce=new_request_key() if is_owner else None,
    )
