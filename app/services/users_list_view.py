"""What the staff users list shows: one shop's customers, filtered, searched and summarised.

The list is limited to the staff member's shop (``None`` = the platform) before anything is
read, so a second shop's customers, purses and marks never reach the result.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import BotUser
from app.services.color_tags import normalize_color_filter
from app.services.customer_marks import CustomerMarks, color_filter_clause, marks_for
from app.services.list_query import filter_by_search, normalize_search_q
from app.services.bot_user_admin import customer_service_actions
from app.services.platform_identity import is_explicit_owner_staff
from app.services.shop_scope import resolve_shop_scope_id
from app.services.subscription_lookup import link_token
from app.services.user_search import clean_handle, with_search_matches
from app.services.users_ops import (
    UserFilter,
    UserOpsRow,
    build_users_ops_page,
    parse_focus_uid,
    scoped_users_where,
)
from app.services.wallet import wallet_balances_for_scope

LIST_LIMIT = 200
SEARCH_LIST_LIMIT = 500


@dataclass(frozen=True, slots=True)
class UsersListAbilities:
    """What the staff member may do from the list (the same axes as the action routes)."""

    manage: bool
    provision: bool
    edit_services: bool
    pg_update: bool


@dataclass(slots=True)
class UsersListView:
    rows: list[UserOpsRow]
    counts: dict[str, int]
    filter_key: UserFilter
    focus_uid: int | None
    query: str
    color_filter: str | None
    marks: dict[int, CustomerMarks] = field(default_factory=dict)
    abilities: UsersListAbilities = UsersListAbilities(False, False, False, False)


def list_abilities(staff: dict, scope: int | None) -> UsersListAbilities:
    pg_acts = customer_service_actions(staff)
    in_shop = is_explicit_owner_staff(staff) or scope is not None
    return UsersListAbilities(
        manage=is_explicit_owner_staff(staff),
        provision=in_shop,
        edit_services=in_shop and bool(pg_acts.get("create") or pg_acts.get("update") or pg_acts.get("delete")),
        pg_update=bool(pg_acts.get("update")),
    )


async def load_users_list(
    session: AsyncSession,
    staff: dict,
    *,
    search: str | None,
    filter_raw: str | None,
    uid_raw: str | None,
    color_raw: str | None,
) -> UsersListView:
    """Raises ``ShopScopeError`` for staff without a shop scope."""
    scope = resolve_shop_scope_id(staff)
    query = normalize_search_q(search)
    if query and link_token(query):
        # A subscription link is a bearer secret: it is looked up by POST (/users/find-by-link),
        # never searched for here or sent back in the list.
        query = ""
    focus_uid = parse_focus_uid(uid_raw)
    color_filter = normalize_color_filter(color_raw)

    # Owner → platform users only; reseller → own customers. Pure resellers stay on /resellers.
    where = scoped_users_where(scope)
    if color_filter:
        where = and_(where, color_filter_clause(scope, color_filter))
    fetched = await session.execute(
        select(BotUser).where(where).order_by(BotUser.id.desc()).limit(SEARCH_LIST_LIMIT if query else LIST_LIMIT)
    )
    users = list(fetched.scalars().all())
    if query:
        users = await with_search_matches(session, users, where, query)
    # The scoped purse only: never another shop's balance, and the platform's only for the Owner.
    wallets = await wallet_balances_for_scope(session, [int(u.id) for u in users], shop_id=scope)
    if query:
        users = filter_by_search(
            users,
            clean_handle(query),
            lambda u: (
                u.id,
                u.telegram_id,
                u.username,
                u.full_name,
                u.role,
                wallets.get(int(u.id), 0),
                "مسدود" if u.is_blocked else "فعال",
            ),
        )
    rows, counts, filter_key = await build_users_ops_page(
        session, users, filter_key=filter_raw, focus_uid=focus_uid, shop_id=scope, wallet_by_uid=wallets
    )
    # A deep-linked uid outside this shop is ignored (no cross-tenant hint).
    if focus_uid and not any(int(u.id) == focus_uid for u in users):
        focus_uid = None
    return UsersListView(
        rows=rows,
        counts=counts,
        filter_key=filter_key,
        focus_uid=focus_uid,
        query=query,
        color_filter=color_filter,
        marks=await marks_for(session, scope, [int(r.user.id) for r in rows]),
        abilities=list_abilities(staff, scope),
    )
