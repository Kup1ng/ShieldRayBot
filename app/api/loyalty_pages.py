"""Web panel: Referral + Loyalty / Points admin."""

from __future__ import annotations

from urllib.parse import quote

from fastapi import Depends, Form, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.spa_pages import spa_response
from app.db.models import (
    BotUser,
    LoyaltyReward,
    LoyaltyTier,
    LuckyWheelPrize,
    PointsRule,
)
from app.services.loyalty import (
    REWARD_TYPE_LABELS,
    admin_adjust_points,
)
from app.services.lucky_wheel import (
    DEFAULT_SUBMENU_ORDER,
    SETTING_COOLDOWN,
    SETTING_DAILY_LIMIT,
    SETTING_FREE_SPINS_DAILY,
    SETTING_SPIN_COST,
    SETTING_SUBMENU_ORDER,
    SETTING_WHEEL_ENABLED,
    archive_prize,
    clamp_int,
    parse_submenu_order,
    prize_in_scope,
    upsert_prize,
)
from app.services.shop_manual_adjust import ManualAdjustError, parse_request_key
from app.services.shop_membership import assert_customer_in_staff_scope
from app.services.shop_scope import (
    ShopScopeError,
    resolve_shop_scope_id,
)
from app.services.users import set_setting

# Old bookmarks of the page's tabs that now open the settings editor.
LEGACY_SETTINGS_TABS = frozenset({"settings", "rules", "rewards", "tiers", "wheel"})


def _shop_scope(staff: dict) -> int | None:
    """Platform admin → None (platform shop). Reseller → bot_user_id.

    Scopeless staff (pg_staff / broken reseller) raises — never platform fallthrough.
    """
    try:
        return resolve_shop_scope_id(staff)
    except ShopScopeError as e:
        raise ValueError(e.message) from e


def _rule_in_scope(rule: PointsRule, scope: int | None) -> bool:
    if scope is None:
        return rule.reseller_id is None
    return rule.reseller_id is not None and int(rule.reseller_id) == int(scope)


def _reward_in_scope(reward: LoyaltyReward, scope: int | None) -> bool:
    if scope is None:
        return reward.reseller_id is None
    return reward.reseller_id is not None and int(reward.reseller_id) == int(scope)


def _wheel_redirect(err: str | None = None, *, saved: bool = False) -> RedirectResponse:
    q = "/loyalty?tab=overview&settings=wheel"
    if saved:
        q += "&saved=1"
    if err:
        q += f"&err={quote(err)}"
    return RedirectResponse(q, status_code=303)

def register_loyalty_pages(app, *, render, require_perm, require_admin, get_db):
    require_loyalty = require_perm("loyalty")

    @app.get("/loyalty")
    async def loyalty_overview(
        staff: dict = Depends(require_loyalty),
        tab: str = "overview",
    ):
        try:
            _shop_scope(staff)
        except ValueError:
            return RedirectResponse("/home", status_code=303)
        # Legacy page tabs moved into the settings editor.
        if tab in LEGACY_SETTINGS_TABS:
            settings_key = "1" if tab == "settings" else tab
            return RedirectResponse(f"/loyalty?tab=overview&settings={settings_key}", status_code=303)
        return spa_response("loyalty")

    @app.post("/loyalty/settings")
    async def loyalty_settings_save(
        request: Request,
        staff: dict = Depends(require_loyalty),
        session: AsyncSession = Depends(get_db),
        loyalty_enabled: str = Form("0"),
        points_to_wallet_rate: str = Form("100"),
        next_tab: str = Form("overview"),
    ):
        try:
            scope = _shop_scope(staff)
        except ValueError:
            return RedirectResponse("/home", status_code=303)
        page_tab = str(next_tab or "overview").strip()
        if page_tab not in {"overview", "transactions"}:
            page_tab = "overview"
        enabled = "1" if str(loyalty_enabled) in {"1", "on", "true", "yes"} else "0"
        try:
            rate = int(str(points_to_wallet_rate).replace(",", "").strip() or "0")
            if rate < 0:
                raise ValueError("نرخ نامعتبر")
        except ValueError:
            return RedirectResponse(
                f"/loyalty?tab={page_tab}&settings=club&err={quote('نرخ تبدیل نامعتبر است')}",
                status_code=303,
            )
        await set_setting(session, "loyalty_enabled", enabled, reseller_id=scope)
        await set_setting(session, "points_to_wallet_rate", str(rate), reseller_id=scope)
        return RedirectResponse(f"/loyalty?tab={page_tab}&settings=club&saved=1", status_code=303)

    @app.post("/loyalty/rules/{rule_id}/save")
    async def loyalty_rule_save(
        rule_id: int,
        staff: dict = Depends(require_loyalty),
        session: AsyncSession = Depends(get_db),
        name: str = Form(...),
        amount: int = Form(0),
        amount_mode: str = Form("fixed"),
        enabled: str = Form("0"),
        first_time_only: str = Form("0"),
        min_purchase_toman: int = Form(0),
        min_purchase_gb: int = Form(0),
        max_reward: str = Form(""),
        cooldown_hours: int = Form(0),
    ):
        try:
            scope = _shop_scope(staff)
        except ValueError:
            return RedirectResponse("/home", status_code=303)
        rule = await session.get(PointsRule, rule_id)
        if not rule or not _rule_in_scope(rule, scope):
            return RedirectResponse(
                f"/loyalty?tab=overview&settings=rules&err={quote('قانون پیدا نشد')}", status_code=303
            )
        rule.name = (name or rule.name).strip()[:128]
        rule.amount = max(0, int(amount))
        rule.amount_mode = amount_mode if amount_mode in {"fixed", "per_gb"} else "fixed"
        rule.enabled = str(enabled) in {"1", "on", "true", "yes"}
        rule.first_time_only = str(first_time_only) in {"1", "on", "true", "yes"}
        rule.min_purchase_toman = max(0, int(min_purchase_toman))
        rule.min_purchase_gb = max(0, int(min_purchase_gb))
        rule.cooldown_hours = max(0, int(cooldown_hours))
        mr = str(max_reward or "").strip()
        rule.max_reward = int(mr) if mr.isdigit() else None
        await session.commit()
        return RedirectResponse("/loyalty?tab=overview&settings=rules&saved=1", status_code=303)

    @app.post("/loyalty/rules/{rule_id}/toggle")
    async def loyalty_rule_toggle(
        rule_id: int,
        staff: dict = Depends(require_loyalty),
        session: AsyncSession = Depends(get_db),
    ):
        try:
            scope = _shop_scope(staff)
        except ValueError:
            return RedirectResponse("/home", status_code=303)
        rule = await session.get(PointsRule, rule_id)
        if rule and _rule_in_scope(rule, scope):
            rule.enabled = not bool(rule.enabled)
            await session.commit()
        return RedirectResponse("/loyalty?tab=overview&settings=rules&saved=1", status_code=303)

    @app.post("/loyalty/rewards/create")
    async def loyalty_reward_create(
        staff: dict = Depends(require_loyalty),
        session: AsyncSession = Depends(get_db),
        name: str = Form(...),
        description: str = Form(""),
        reward_type: str = Form(...),
        reward_value: int = Form(...),
        points_cost: int = Form(...),
        sort_order: int = Form(100),
        min_purchase_toman: int = Form(0),
        max_discount_toman: str = Form(""),
        expires_days: str = Form(""),
    ):
        try:
            scope = _shop_scope(staff)
        except ValueError:
            return RedirectResponse("/home", status_code=303)
        if reward_type not in REWARD_TYPE_LABELS:
            return RedirectResponse(
                f"/loyalty?tab=overview&settings=rewards&err={quote('نوع جایزه نامعتبر')}", status_code=303
            )
        if int(reward_value) <= 0 or int(points_cost) <= 0:
            return RedirectResponse(
                f"/loyalty?tab=overview&settings=rewards&err={quote('مقدار و هزینه باید مثبت باشند')}",
                status_code=303,
            )
        if reward_type == "discount_percent" and int(reward_value) > 100:
            return RedirectResponse(
                f"/loyalty?tab=overview&settings=rewards&err={quote('درصد تخفیف حداکثر ۱۰۰ است')}",
                status_code=303,
            )
        mx = str(max_discount_toman or "").strip()
        ex = str(expires_days or "").strip()
        session.add(
            LoyaltyReward(
                name=(name or "").strip()[:128] or "جایزه",
                description=(description or "").strip() or None,
                reward_type=reward_type,
                reward_value=int(reward_value),
                points_cost=int(points_cost),
                enabled=True,
                archived=False,
                sort_order=int(sort_order),
                reseller_id=scope,
                min_purchase_toman=max(0, int(min_purchase_toman or 0))
                if reward_type == "discount_percent"
                else 0,
                max_discount_toman=int(mx) if mx.isdigit() and reward_type == "discount_percent" else None,
                expires_days=int(ex) if ex.isdigit() and reward_type == "discount_percent" else None,
            )
        )
        await session.commit()
        return RedirectResponse("/loyalty?tab=overview&settings=rewards&saved=1", status_code=303)

    @app.post("/loyalty/rewards/{reward_id}/save")
    async def loyalty_reward_save(
        reward_id: int,
        staff: dict = Depends(require_loyalty),
        session: AsyncSession = Depends(get_db),
        name: str = Form(...),
        description: str = Form(""),
        reward_value: int = Form(...),
        points_cost: int = Form(...),
        sort_order: int = Form(100),
        enabled: str = Form("0"),
        max_redemptions_global: str = Form(""),
        max_redemptions_per_user: str = Form(""),
        min_purchase_toman: int = Form(0),
        max_discount_toman: str = Form(""),
        expires_days: str = Form(""),
    ):
        try:
            scope = _shop_scope(staff)
        except ValueError:
            return RedirectResponse("/home", status_code=303)
        reward = await session.get(LoyaltyReward, reward_id)
        if not reward or not _reward_in_scope(reward, scope):
            return RedirectResponse(
                f"/loyalty?tab=overview&settings=rewards&err={quote('جایزه پیدا نشد')}", status_code=303
            )
        reward.name = (name or reward.name).strip()[:128]
        reward.description = (description or "").strip() or None
        reward.reward_value = max(1, int(reward_value))
        if reward.reward_type == "discount_percent":
            reward.reward_value = min(100, reward.reward_value)
        reward.points_cost = max(1, int(points_cost))
        reward.sort_order = int(sort_order)
        reward.enabled = str(enabled) in {"1", "on", "true", "yes"}
        g = str(max_redemptions_global or "").strip()
        u = str(max_redemptions_per_user or "").strip()
        reward.max_redemptions_global = int(g) if g.isdigit() else None
        reward.max_redemptions_per_user = int(u) if u.isdigit() else None
        if reward.reward_type == "discount_percent":
            reward.min_purchase_toman = max(0, int(min_purchase_toman or 0))
            mx = str(max_discount_toman or "").strip()
            ex = str(expires_days or "").strip()
            reward.max_discount_toman = int(mx) if mx.isdigit() else None
            reward.expires_days = int(ex) if ex.isdigit() else None
        await session.commit()
        return RedirectResponse("/loyalty?tab=overview&settings=rewards&saved=1", status_code=303)

    @app.post("/loyalty/rewards/{reward_id}/archive")
    async def loyalty_reward_archive(
        reward_id: int,
        staff: dict = Depends(require_loyalty),
        session: AsyncSession = Depends(get_db),
    ):
        try:
            scope = _shop_scope(staff)
        except ValueError:
            return RedirectResponse("/home", status_code=303)
        reward = await session.get(LoyaltyReward, reward_id)
        if reward and _reward_in_scope(reward, scope):
            reward.archived = True
            reward.enabled = False
            await session.commit()
        return RedirectResponse("/loyalty?tab=overview&settings=rewards&saved=1", status_code=303)

    @app.post("/loyalty/tiers/{tier_id}/save")
    async def loyalty_tier_save(
        tier_id: int,
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
        name: str = Form(...),
        min_points: int = Form(0),
        max_points: str = Form(""),
        multiplier_bps: int = Form(10000),
        enabled: str = Form("0"),
    ):
        # Tiers are platform-global — admin only (no reseller mutation).
        tier = await session.get(LoyaltyTier, tier_id)
        if not tier:
            return RedirectResponse(
                f"/loyalty?tab=overview&settings=tiers&err={quote('سطح پیدا نشد')}", status_code=303
            )
        tier.name = (name or tier.name).strip()[:64]
        tier.min_points = max(0, int(min_points))
        mx = str(max_points or "").strip()
        tier.max_points = int(mx) if mx.isdigit() else None
        tier.multiplier_bps = max(0, int(multiplier_bps))
        tier.enabled = str(enabled) in {"1", "on", "true", "yes"}
        await session.commit()
        return RedirectResponse("/loyalty?tab=overview&settings=tiers&saved=1", status_code=303)

    @app.post("/loyalty/adjust")
    async def loyalty_adjust(
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
        user_id: int = Form(...),
        delta: int = Form(...),
        reason: str = Form(...),
        nonce: str = Form(""),
    ):
        try:
            request_key = parse_request_key(nonce)
        except ManualAdjustError as e:
            return RedirectResponse(f"/loyalty?tab=transactions&err={quote(str(e))}", status_code=303)
        user = await session.get(BotUser, int(user_id))
        if not user:
            return RedirectResponse(
                f"/loyalty?tab=transactions&err={quote('کاربر پیدا نشد')}", status_code=303
            )
        try:
            await assert_customer_in_staff_scope(session, staff, user)
        except ShopScopeError as e:
            return RedirectResponse(
                f"/loyalty?tab=transactions&err={quote(e.message)}", status_code=303
            )
        admin_id = str(staff.get("username") or staff.get("telegram_id") or staff.get("id") or "admin")
        shop_id = _shop_scope(staff)
        try:
            change = await admin_adjust_points(
                session,
                user,
                int(delta),
                reason=reason,
                admin_identity=admin_id,
                shop_id=shop_id,
                request_key=request_key,
            )
        except ValueError as e:
            return RedirectResponse(
                f"/loyalty?tab=transactions&err={quote(str(e)[:200])}", status_code=303
            )
        from app.services.manual_adjust_notices import schedule_points_notice

        schedule_points_notice(
            user_id=int(user.id),
            mode="credit" if int(delta) > 0 else "debit",
            points=abs(int(delta)),
            balance=int(change.tx.balance_after),
            shop_id=shop_id,
            replayed=change.replayed,
        )
        return RedirectResponse(
            f"/loyalty?tab=transactions&saved=1&msg={quote('تعدیل ثبت شد')}",
            status_code=303,
        )

    @app.post("/loyalty/wheel/settings")
    async def loyalty_wheel_settings_save(
        staff: dict = Depends(require_loyalty),
        session: AsyncSession = Depends(get_db),
        lucky_wheel_enabled: str = Form("0"),
        lucky_wheel_spin_cost_points: str = Form("10"),
        lucky_wheel_daily_limit: str = Form("3"),
        lucky_wheel_cooldown_seconds: str = Form("0"),
        lucky_wheel_free_spins_daily: str = Form("0"),
        loyalty_submenu_order: str = Form(",".join(DEFAULT_SUBMENU_ORDER)),
    ):
        try:
            scope = _shop_scope(staff)
        except ValueError:
            return RedirectResponse("/home", status_code=303)
        enabled = "1" if str(lucky_wheel_enabled) in {"1", "on", "true", "yes"} else "0"
        cost = clamp_int(lucky_wheel_spin_cost_points, lo=0, hi=1_000_000, default=10)
        daily = clamp_int(lucky_wheel_daily_limit, lo=0, hi=100, default=3)
        cool = clamp_int(lucky_wheel_cooldown_seconds, lo=0, hi=86_400, default=0)
        free_d = clamp_int(lucky_wheel_free_spins_daily, lo=0, hi=50, default=0)
        # Respect intentional omissions from the DnD list (no forced re-inject).
        order = ",".join(parse_submenu_order(loyalty_submenu_order, fill_missing=False))
        await set_setting(session, SETTING_WHEEL_ENABLED, enabled, reseller_id=scope)
        await set_setting(session, SETTING_SPIN_COST, str(cost), reseller_id=scope)
        await set_setting(session, SETTING_DAILY_LIMIT, str(daily), reseller_id=scope)
        await set_setting(session, SETTING_COOLDOWN, str(cool), reseller_id=scope)
        await set_setting(session, SETTING_FREE_SPINS_DAILY, str(free_d), reseller_id=scope)
        await set_setting(session, SETTING_SUBMENU_ORDER, order, reseller_id=scope)
        return _wheel_redirect(saved=True)

    @app.post("/loyalty/wheel/prizes/create")
    async def loyalty_wheel_prize_create(
        staff: dict = Depends(require_loyalty),
        session: AsyncSession = Depends(get_db),
        label: str = Form(...),
        prize_type: str = Form(...),
        prize_value: int = Form(0),
        weight: int = Form(10),
        sort_order: int = Form(100),
        min_purchase_toman: int = Form(0),
        max_discount_toman: str = Form(""),
        expires_days: str = Form(""),
    ):
        try:
            scope = _shop_scope(staff)
        except ValueError:
            return RedirectResponse("/home", status_code=303)
        mx = str(max_discount_toman or "").strip()
        ex = str(expires_days or "").strip()
        try:
            await upsert_prize(
                session,
                reseller_id=scope,
                label=label,
                prize_type=prize_type,
                prize_value=int(prize_value),
                weight=int(weight),
                sort_order=int(sort_order),
                enabled=True,
                min_purchase_toman=max(0, int(min_purchase_toman or 0)),
                max_discount_toman=int(mx) if mx.isdigit() else None,
                expires_days=int(ex) if ex.isdigit() else None,
            )
        except ValueError as e:
            return _wheel_redirect(str(e)[:200])
        return _wheel_redirect(saved=True)

    @app.post("/loyalty/wheel/prizes/{prize_id}/save")
    async def loyalty_wheel_prize_save(
        prize_id: int,
        staff: dict = Depends(require_loyalty),
        session: AsyncSession = Depends(get_db),
        label: str = Form(...),
        prize_value: int = Form(0),
        weight: int = Form(1),
        sort_order: int = Form(0),
        enabled: str = Form("0"),
        max_wins_global: str = Form(""),
        max_wins_per_user: str = Form(""),
        min_purchase_toman: int = Form(0),
        max_discount_toman: str = Form(""),
        expires_days: str = Form(""),
    ):
        try:
            scope = _shop_scope(staff)
        except ValueError:
            return RedirectResponse("/home", status_code=303)
        prize = await session.get(LuckyWheelPrize, int(prize_id))
        if not prize or not prize_in_scope(prize, scope):
            return _wheel_redirect("جایزه پیدا نشد")
        g = str(max_wins_global or "").strip()
        u = str(max_wins_per_user or "").strip()
        mx = str(max_discount_toman or "").strip()
        ex = str(expires_days or "").strip()
        try:
            await upsert_prize(
                session,
                reseller_id=scope,
                prize_id=int(prize_id),
                label=label,
                prize_type=prize.prize_type,
                prize_value=int(prize_value),
                weight=int(weight),
                sort_order=int(sort_order),
                enabled=str(enabled) in {"1", "on", "true", "yes"},
                max_wins_global=int(g) if g.isdigit() else None,
                max_wins_per_user=int(u) if u.isdigit() else None,
                min_purchase_toman=max(0, int(min_purchase_toman or 0)),
                max_discount_toman=int(mx) if mx.isdigit() else None,
                expires_days=int(ex) if ex.isdigit() else None,
            )
        except ValueError as e:
            return _wheel_redirect(str(e)[:200])
        return _wheel_redirect(saved=True)

    @app.post("/loyalty/wheel/prizes/{prize_id}/archive")
    async def loyalty_wheel_prize_archive(
        prize_id: int,
        staff: dict = Depends(require_loyalty),
        session: AsyncSession = Depends(get_db),
    ):
        try:
            scope = _shop_scope(staff)
        except ValueError:
            return RedirectResponse("/home", status_code=303)
        ok = await archive_prize(session, int(prize_id), reseller_id=scope)
        if not ok:
            return _wheel_redirect("جایزه پیدا نشد")
        return _wheel_redirect(saved=True)

