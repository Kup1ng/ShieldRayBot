from __future__ import annotations

"""Reseller plans, applications, and staff management pages."""

import logging
import uuid
from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import Depends, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.spa_pages import spa_response
from app.config import normalize_pg_base_url
from app.db.models import BotUser, ResellerPlan, ResellerProfile, Role
from app.services.miniapp_shop import (
    PERMISSION as MINIAPP_PERMISSION,
    STATE_NO_PERMISSION,
    STATE_OPEN,
    STATE_PLATFORM_OFF,
    STATE_SETUP,
    STATE_SHOP_OFF,
)
from app.api.payg_plan_form import apply_payg_settings, payg_rate_and_settings
from app.api.pg_panel_access_pages import (
    access_target_from_form,
    apply_access_after_save,
    apply_access_before_save,
)
from app.services.reseller_bots import schedule_shop_menu_sync
from app.services.shop_scope import ShopScopeError, assert_bot_user_in_scope
from app.services.platform_identity import is_explicit_owner_staff
from app.services.reseller_panel_edit import load_shop
from app.services.reseller_panel_list import SHOP_FORBIDDEN, SHOP_OK, load_scoped_shop
from app.services.volume_allocation import apply_create_form_oversell, apply_oversell_switch
from app.services.pg_quota import load_staff_limit_snapshot
from app.services.support_button import support_markup
from app.services.resellers import (
    DEFAULT_FEATURE_PERMS,
    FEATURE_PERMS,
    approve_application,
    format_credentials_message,
    get_application,
    get_reseller_panel_base_url,
    join_perms,
    normalize_feature_perms,
    notify_reseller_revoked,
    has_perm,
    parse_perms,
    provision_reseller,
    reject_application,
    revoke_reseller,
)
from app.services.redact import operator_error

logger = logging.getLogger(__name__)


def _q(msg: str) -> str:
    return quote(str(msg), safe="")


def _require_rep_mgmt(staff: dict) -> None:
    """Server deny for Hybrid Owner / L1 without live PG ``admins.create``."""
    from fastapi import HTTPException

    from app.services.representative_unification import (
        RepresentativeUnifyError,
        assert_staff_can_manage_representatives,
    )

    try:
        assert_staff_can_manage_representatives(staff)
    except RepresentativeUnifyError:
        raise HTTPException(status_code=403, detail="forbidden") from None


async def _validate_reseller_capacity_inputs(
    staff: dict,
    *,
    included_gb: int = 0,
    included_users: int = 0,
    addon_gb: int = 0,
    addon_users: int = 0,
    session: AsyncSession | None = None,
) -> None:
    """Single-package guard for limited independent installs before save."""
    snapshot = await load_staff_limit_snapshot(staff, session=session)
    if not snapshot.get("restricted"):
        return
    from app.services.formatting import format_bytes

    total_gb = max(0, int(included_gb or 0)) + max(0, int(addon_gb or 0))
    total_users = max(0, int(included_users or 0)) + max(0, int(addon_users or 0))
    cap_gb = snapshot.get("account_data_limit")
    cap_users = snapshot.get("max_users")
    if cap_gb is not None and cap_gb > 0 and total_gb * (1024**3) > int(cap_gb):
        raise ValueError(
            f"ظرفیت این پلن از سقف حجم ادمین اصلی بیشتر است (حداکثر {format_bytes(cap_gb)})"
        )
    if cap_users is not None and cap_users > 0 and total_users > int(cap_users):
        raise ValueError(
            f"ظرفیت این پلن از سقف کاربر ادمین اصلی بیشتر است (حداکثر {int(cap_users)})"
        )


def _redirect_reseller_edit(user_id: int, *, ok: str | None = None, err: str | None = None):
    """Return to list and reopen edit modal."""
    qs = [f"edit={int(user_id)}"]
    if err:
        qs.append(f"err={_q(err)}")
    elif ok:
        qs.append(f"ok={_q(ok)}")
    return RedirectResponse(f"/resellers?{'&'.join(qs)}", status_code=303)




# The shop's Mini App state as the platform owner reads it on the reseller page.
MINIAPP_STATUS_TEXT = {
    STATE_SETUP: "خاموش — راه‌اندازی ربات فروشگاه کامل نشده یا نماینده غیرفعال است",
    STATE_PLATFORM_OFF: "خاموش — «مینی‌اپ فروشگاه‌ها» در تنظیمات مینی‌اپ پلتفرم روشن نیست",
    STATE_NO_PERMISSION: "خاموش — دسترسی «مینی‌اپ فروشگاه برای مشتریان» در همین صفحه داده نشده است",
    STATE_SHOP_OFF: "خاموش — نماینده هنوز آن را در تنظیمات فروشگاه خود روشن نکرده است",
    STATE_OPEN: "فعال — مشتری‌ها از دکمهٔ «Open» ربات فروشگاه وارد می‌شوند",
}


def _shop_miniapp_may_open(profile: ResellerProfile) -> bool:
    """Whether the profile's own state lets its Mini App open (the platform and shop switches aside)."""
    return bool(profile.is_active and has_perm(profile, MINIAPP_PERMISSION))


def _resync_menu_if_miniapp_changed(profile: ResellerProfile, was_open: bool) -> None:
    """The shop bot's «Open» button follows the permission and the shop's active state."""
    if _shop_miniapp_may_open(profile) != was_open:
        schedule_shop_menu_sync([int(profile.id)])


def _feature_perms_from_form(form) -> str:
    selected = []
    for key, _ in FEATURE_PERMS:
        if form.get(f"perm_{key}"):
            selected.append(key)
    return normalize_feature_perms(join_perms(selected) or DEFAULT_FEATURE_PERMS)


def _parse_nonneg_int(form, key: str, default: int = 0) -> int:
    from app.services.numbers import parse_int

    try:
        return max(0, parse_int(str(form.get(key) or default), default=default))
    except ValueError:
        return default


def _parse_plan_kind(form) -> str:
    kind = str(form.get("plan_kind") or "subscription").strip().lower()
    if kind in {"subscription", "addon_volume", "addon_users"}:
        return kind
    return "subscription"


def _is_addon_plan_kind(kind: str | None) -> bool:
    return str(kind or "").strip().lower() in {"addon_volume", "addon_users"}


def _parse_renew_pricing_mode(form, *, allow_buy_extra: bool = False) -> str:
    """Parse renew mode; buy-extra subscriptions must use from_capacity."""
    if allow_buy_extra:
        return "from_capacity"
    mode = str(form.get("renew_pricing_mode") or "fixed").strip().lower()
    return mode if mode in {"fixed", "from_capacity"} else "fixed"


def _addon_fields_from_form(form, plan_kind: str) -> tuple[int, int]:
    """Validate pack size for addon plans. Raises ValueError on bad size."""
    addon_gb = _parse_nonneg_int(form, "addon_gb")
    addon_users = _parse_nonneg_int(form, "addon_users")
    if plan_kind == "addon_volume":
        if addon_gb <= 0:
            raise ValueError("حجم بسته باید بیشتر از صفر باشد")
        return addon_gb, 0
    if plan_kind == "addon_users":
        if addon_users <= 0:
            raise ValueError("تعداد کاربر بسته باید بیشتر از صفر باشد")
        return 0, addon_users
    return 0, 0


def _parse_pg_group_ids(form) -> str | None:
    ids: list[str] = []
    for k, v in form.items():
        key = str(k)
        if key.startswith("group_") and str(v).strip():
            ids.append(str(v).strip())
        elif key == "pg_group_ids" and str(v).strip():
            # comma-separated fallback
            ids.extend(x.strip() for x in str(v).split(",") if x.strip())
    # Preserve order, unique
    seen: list[str] = []
    for x in ids:
        if x not in seen:
            seen.append(x)
    return ",".join(seen) if seen else None


def register_reseller_pages(app, *, render, require_admin, get_db, require_staff=None):
    staff_dep = require_staff or require_admin

    @app.get("/resellers", response_class=HTMLResponse)
    async def resellers_page(
        staff: dict = Depends(staff_dep),
        session: AsyncSession = Depends(get_db),
    ):
        from app.services.representative_unification import (
            RepresentativeUnifyError,
            assert_live_parent_for_child,
        )
        from fastapi import HTTPException

        try:
            await assert_live_parent_for_child(session, staff)
        except RepresentativeUnifyError:
            raise HTTPException(status_code=403, detail="forbidden") from None
        return spa_response("resellers")

    @app.post("/resellers/panel-url")
    async def reseller_panel_url_save(
        request: Request,
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
    ):
        _require_rep_mgmt(staff)
        from app.services.users import set_setting

        form = await request.form()
        bot_url = str(form.get("reseller_panel_base_url") or "").strip().rstrip("/")
        pg_url = normalize_pg_base_url(str(form.get("reseller_pg_panel_base_url") or ""))
        show_apply = "1" if str(form.get("show_reseller_apply") or "") in {
            "1", "on", "true", "yes"
        } else "0"
        await set_setting(session, "reseller_panel_base_url", bot_url)
        await set_setting(session, "reseller_pg_panel_base_url", pg_url)
        await set_setting(session, "show_reseller_apply", show_apply)
        return RedirectResponse(
            f"/resellers?ok={_q('تنظیمات نمایندگی ذخیره شد')}",
            status_code=303,
        )

    @app.post("/resellers")
    async def reseller_create(
        request: Request,
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
    ):
        _require_rep_mgmt(staff)
        form = await request.form()
        try:
            telegram_id = int(str(form.get("telegram_id") or "0"))
        except ValueError:
            return RedirectResponse(f"/resellers?err={_q('آیدی تلگرام نامعتبر')}", status_code=303)
        result = await session.execute(select(BotUser).where(BotUser.telegram_id == telegram_id))
        user = result.scalar_one_or_none()
        if not user:
            return RedirectResponse(
                f"/resellers?err={_q('کاربر با این آیدی در ربات پیدا نشد — اول باید استارت زده باشد')}",
                status_code=303,
            )
        plan_raw = str(form.get("plan_id") or "").strip()
        if not plan_raw.isdigit():
            return RedirectResponse(
                f"/resellers?err={_q('انتخاب پلن نمایندگی الزامی است')}",
                status_code=303,
            )
        plan = await session.get(ResellerPlan, int(plan_raw))
        if not plan or not plan.is_active:
            return RedirectResponse(
                f"/resellers?err={_q('پلن نمایندگی نامعتبر یا غیرفعال است')}",
                status_code=303,
            )
        from app.services.pg_admin_subscription import is_current_capacity_plan

        if is_current_capacity_plan(plan):
            return RedirectResponse(
                f"/resellers?err={_q('پلن «ظرفیت فعلی» فقط برای اعطای نماینده به ادمین از قبل موجود است')}",
                status_code=303,
            )
        perms = _feature_perms_from_form(form)
        create_pg = bool(form.get("create_pg_admin"))
        share_pg = bool(form.get("share_pg_panel_url"))
        pg_role_raw = str(form.get("pg_role_id") or "").strip()
        pg_role_id = int(pg_role_raw) if pg_role_raw.isdigit() else None
        from app.services.color_tags import apply_color_tag

        # Whitelist-only; form omission / junk → green (مطمئن).
        apply_color_tag(user, str(form.get("color_tag") or ""))
        panel_url = await get_reseller_panel_base_url(session)
        try:
            creds = await provision_reseller(
                session,
                user=user,
                plan=plan,
                web_permissions=perms,
                bot_permissions=perms,
                create_pg_admin=create_pg,
                share_pg_panel_url=share_pg,
                pg_role_id=pg_role_id,
                panel_base_url=panel_url,
            )
        except Exception as e:
            return RedirectResponse(f"/resellers?err={_q(str(e))}", status_code=303)
        await apply_create_form_oversell(
            session, int(user.id), form_value=form.get("allow_volume_oversell"),
            actor_is_owner=is_explicit_owner_staff(staff),
        )

        try:
            from app.bot import create_bot

            bot = create_bot()
            try:
                await bot.send_message(
                    user.telegram_id,
                    format_credentials_message(creds),
                    parse_mode="HTML",
                )
            finally:
                await bot.session.close()
        except Exception:
            logger.debug("reseller_create: ignored failure", exc_info=True)
        return RedirectResponse(
            f"/resellers?ok={_q('نماینده فعال شد — اطلاعات ورود (پاسارگارد + وب‌پنل) ارسال شد')}",
            status_code=303,
        )

    @app.post("/resellers/create-child")
    async def reseller_create_child(
        request: Request,
        staff: dict = Depends(staff_dep),
        session: AsyncSession = Depends(get_db),
    ):
        from app.services.platform_identity import is_explicit_owner_staff
        from app.services.principal_child_provisioning import (
            ChildProvisionError,
            Level2ProvisionRequest,
            provision_level2_child,
        )
        from app.services.representative_unification import (
            RepresentativeUnifyError,
            assert_live_parent_for_child,
        )
        from fastapi import HTTPException

        if is_explicit_owner_staff(staff):
            raise HTTPException(status_code=403, detail="forbidden")
        try:
            await assert_live_parent_for_child(session, staff)
        except RepresentativeUnifyError:
            raise HTTPException(status_code=403, detail="forbidden") from None
        form = await request.form()
        _ = form.get("parent_id")
        _ = form.get("depth")
        _ = form.get("principal_id")
        _ = form.get("reseller_profile_id")
        try:
            role_raw = str(form.get("pg_role_id") or "").strip()
            await provision_level2_child(
                session,
                staff,
                Level2ProvisionRequest(
                    pg_username=str(form.get("pg_username") or ""),
                    pg_password=str(form.get("pg_password") or ""),
                    pg_role_id=int(role_raw) if role_raw.isdigit() else None,
                    idempotency_key=str(form.get("idempotency_key") or "")
                    or f"web-child-{uuid.uuid4()}",
                    note=str(form.get("note") or "") or None,
                    parent_id=form.get("parent_id"),
                    depth=form.get("depth"),
                ),
            )
        except ChildProvisionError as exc:
            return RedirectResponse(f"/resellers?err={_q(exc.message)}", status_code=303)
        except Exception:
            return RedirectResponse(
                f"/resellers?err={_q('ساخت نماینده ناموفق بود')}",
                status_code=303,
            )
        return RedirectResponse(
            f"/resellers?ok={_q('نماینده ساخته شد')}",
            status_code=303,
        )

    @app.get("/resellers/{user_id}/edit", response_class=HTMLResponse)
    async def reseller_edit_page(
        user_id: int,
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
    ):
        if await load_shop(session, user_id) is None:
            return RedirectResponse(f"/resellers?err={_q('نماینده یافت نشد')}", status_code=303)
        return spa_response("resellers/edit")

    @app.get("/resellers/{user_id}/color-tag", response_class=HTMLResponse)
    async def reseller_color_tag_page(
        user_id: int,
        staff: dict = Depends(staff_dep),
        session: AsyncSession = Depends(get_db),
    ):
        from app.services.representative_unification import (
            RepresentativeUnifyError,
            assert_live_parent_for_child,
        )
        from fastapi import HTTPException

        # Same live-parent gate as GET /resellers (no weaker color-tag bypass).
        try:
            await assert_live_parent_for_child(session, staff)
        except RepresentativeUnifyError:
            raise HTTPException(status_code=403, detail="forbidden") from None

        user, _profile, status = await load_scoped_shop(session, staff, user_id)
        if status == SHOP_FORBIDDEN:
            raise HTTPException(status_code=403, detail="forbidden")
        if status != SHOP_OK or user is None:
            return RedirectResponse(f"/resellers?err={_q('نماینده یافت نشد')}", status_code=303)
        # The risk-tag picker is a dialog of the list page, not a page of its own.
        return RedirectResponse("/resellers", status_code=303)

    @app.post("/resellers/{user_id}/color-tag")
    async def reseller_color_tag_save(
        user_id: int,
        request: Request,
        staff: dict = Depends(staff_dep),
        session: AsyncSession = Depends(get_db),
    ):
        """Set color tag on a reseller BotUser within actor scope."""
        from app.services.color_tags import apply_color_tag
        from app.services.platform_identity import is_explicit_owner_staff
        from app.services.representative_unification import (
            RepresentativeUnifyError,
            assert_live_parent_for_child,
        )
        from fastapi import HTTPException

        # Same live-parent gate as GET /resellers (no weaker color-tag bypass).
        try:
            await assert_live_parent_for_child(session, staff)
        except RepresentativeUnifyError:
            raise HTTPException(status_code=403, detail="forbidden") from None

        form = await request.form()
        user, _profile, status = await load_scoped_shop(session, staff, user_id)
        if status == SHOP_FORBIDDEN:
            return RedirectResponse("/home", status_code=303)
        if status != SHOP_OK or user is None:
            return RedirectResponse(f"/resellers?err={_q('نماینده یافت نشد')}", status_code=303)
        apply_color_tag(user, str(form.get("color_tag") or ""))
        await session.commit()
        referer = str(request.headers.get("referer") or "")
        if is_explicit_owner_staff(staff) and "/edit" in referer:
            return _redirect_reseller_edit(user_id, ok="تگ ریسک ذخیره شد")
        return RedirectResponse(
            f"/resellers?ok={_q('تگ ریسک ذخیره شد')}",
            status_code=303,
        )
    @app.post("/resellers/{user_id}/edit")
    async def reseller_edit_save(
        user_id: int,
        request: Request,
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
    ):
        form = await request.form()
        user = await session.get(BotUser, user_id)
        profile = (
            await session.execute(select(ResellerProfile).where(ResellerProfile.user_id == user_id))
        ).scalar_one_or_none()
        if not user or not profile:
            return RedirectResponse(f"/resellers?err={_q('نماینده یافت نشد')}", status_code=303)
        perms = _feature_perms_from_form(form)
        miniapp_before = _shop_miniapp_may_open(profile)
        was_active = bool(profile.is_active)
        profile.web_permissions = perms
        profile.bot_permissions = perms  # must stay identical
        profile.can_approve_receipts = "payments" in parse_perms(perms)
        profile.is_active = bool(form.get("is_active"))
        pg_access_target = access_target_from_form(form, profile)
        apply_access_before_save(
            profile,
            target=pg_access_target,
            share_panel_url=bool(form.get("share_pg_panel_url")),
        )
        # An unchecked switch is not posted; the marker says the switch was on the form.
        apply_oversell_switch(
            profile,
            shown=bool(form.get("volume_oversell_shown")),
            allow=bool(form.get("allow_volume_oversell")),
            actor_is_owner=is_explicit_owner_staff(staff),
        )
        pg_role_raw = str(form.get("pg_role_id") or "").strip()
        new_pg_role_id = int(pg_role_raw) if pg_role_raw.isdigit() else None
        profile.pg_role_id = new_pg_role_id
        pg_user = str(form.get("pg_admin_username") or "").strip()
        if pg_user:
            from app.services.pg_staff_access import conflict_message_for_reseller_link

            link_err = await conflict_message_for_reseller_link(
                session, pg_user, exclude_profile_id=int(profile.id)
            )
            if link_err:
                return _redirect_reseller_edit(user_id, err=link_err)
        profile.pg_admin_username = pg_user or None
        # Push role to PasarGuard so edit is not local-only (limited roles depend on live role).
        if profile.pg_admin_username and new_pg_role_id is not None:
            from app.services.pasarguard import PasarGuardError, get_pg

            try:
                await get_pg().modify_admin(
                    profile.pg_admin_username,
                    {"role_id": int(new_pg_role_id)},
                )
            except PasarGuardError as e:
                return _redirect_reseller_edit(user_id, err=e.user_message(fallback=str(e)))
            except Exception as e:
                logger.warning("PasarGuard admin role sync failed", exc_info=True)
                return _redirect_reseller_edit(
                    user_id, err=operator_error(e, prefix="همگام‌سازی نقش پاسارگارد ناموفق")
                )
        from app.services.reseller_access import normalize_telegram_ids_csv

        profile.bot_admin_ids = normalize_telegram_ids_csv(
            str(form.get("bot_admin_ids") or "").strip() or None
        )
        new_pass = str(form.get("web_password") or "").strip()
        if new_pass:
            from app.services.resellers import apply_reseller_panel_password
            from app.services.web_auth import validate_password_strength

            ok, perr = validate_password_strength(new_pass)
            if not ok:
                return _redirect_reseller_edit(user_id, err=perr)
            try:
                await apply_reseller_panel_password(session, profile, new_pass, sync_pg=True)
            except ValueError as e:
                return _redirect_reseller_edit(user_id, err=str(e))
            if profile.web_username and not profile.setup_completed_at:
                profile.setup_completed_at = datetime.now(timezone.utc)
        clear_api_key = str(form.get("clear_pg_api_key") or "").strip().lower() in {
            "1",
            "on",
            "true",
            "yes",
        }
        new_api_key = str(form.get("pg_api_key") or "").strip()
        if clear_api_key or new_api_key:
            from app.services.resellers import apply_reseller_pg_api_key

            try:
                await apply_reseller_pg_api_key(
                    session,
                    profile,
                    api_key=new_api_key if not clear_api_key else None,
                    clear=clear_api_key,
                )
            except ValueError as e:
                return _redirect_reseller_edit(user_id, err=str(e))
        mode = str(form.get("billing_mode") or "").strip().lower()
        if mode in {"fixed", "payg"}:
            from app.services.billing_mode import switch_billing_mode

            try:
                await switch_billing_mode(
                    session,
                    profile,
                    mode,
                    confirmed=bool(form.get("confirm_billing_mode_change")),
                )
            except ValueError as e:
                return _redirect_reseller_edit(user_id, err=str(e))
        user.role = Role.RESELLER.value if profile.is_active else Role.USER.value
        await session.commit()
        if was_active != bool(profile.is_active):
            from app.services.reseller_bots import sync_reseller_bot_runtime

            await sync_reseller_bot_runtime(profile)
        _resync_menu_if_miniapp_changed(profile, miniapp_before)
        access_warning = await apply_access_after_save(session, profile, target=pg_access_target)
        if access_warning:
            return _redirect_reseller_edit(user_id, err=access_warning)
        return _redirect_reseller_edit(user_id, ok='ذخیره شد')

    @app.post("/resellers/{user_id}/billing-topup")
    async def reseller_billing_topup(
        user_id: int,
        request: Request,
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
    ):
        """Manual increase or decrease of a reseller wallet (PAYG or fixed), Super Admin only."""
        from app.services.bot_user_admin import parse_admin_wallet_amount, parse_admin_wallet_mode
        from app.services.reseller_wallet import adjust_reseller_wallet, schedule_followups

        user = await session.get(BotUser, user_id)
        if user is None or await session.scalar(
            select(ResellerProfile.id).where(ResellerProfile.user_id == user_id)
        ) is None:
            return RedirectResponse(f"/resellers?err={_q('نماینده یافت نشد')}", status_code=303)
        form = await request.form()
        note = str(form.get("note") or "").strip()
        try:
            amount = parse_admin_wallet_amount(str(form.get("amount") or "").replace(",", ""))
            # Forms from before the decrease button carry no mode: they were always a charge.
            mode = parse_admin_wallet_mode(str(form.get("mode") or "credit"))
        except ValueError as e:
            return _redirect_reseller_edit(user_id, err=str(e))
        nonce = str(form.get("nonce") or "").strip()
        if len(nonce) < 8:
            return _redirect_reseller_edit(user_id, err='فرم شارژ منقضی شده — صفحه را تازه کنید')
        actor = str(staff.get("username") or staff.get("role") or "admin")
        # The charge key keeps its earlier format so a form opened before the update stays a no-op.
        key = (
            f"manual:{user_id}:{amount}:{note}:{actor}:{nonce}"
            if mode == "credit"
            else f"manual-debit:{user_id}:{amount}:{note}:{actor}:{nonce}"
        )
        try:
            change = await adjust_reseller_wallet(
                session, user, amount, mode=mode, actor=actor, note=note, idempotency_key=key
            )
        except ValueError as e:
            return _redirect_reseller_edit(user_id, err=str(e))
        schedule_followups(change)
        if mode == "credit":
            return _redirect_reseller_edit(user_id, ok=f'شارژ کیف پول به مبلغ {amount:,} تومان ثبت شد')
        return _redirect_reseller_edit(user_id, ok=f'از کیف پول {amount:,} تومان کسر شد')

    @app.post("/resellers/{user_id}/subscription/adjust")
    async def reseller_subscription_adjust(
        user_id: int,
        request: Request,
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
    ):
        user = await session.get(BotUser, user_id)
        profile = (
            await session.execute(select(ResellerProfile).where(ResellerProfile.user_id == user_id))
        ).scalar_one_or_none()
        if not user or not profile:
            return RedirectResponse(f"/resellers?err={_q('نماینده یافت نشد')}", status_code=303)
        form = await request.form()
        days_raw = str(form.get("extra_days") or "0").strip() or "0"
        gb_raw = str(form.get("extra_gb") or "0").strip() or "0"
        try:
            from app.services.numbers import parse_int

            extra_days = parse_int(days_raw)
            extra_gb = parse_int(gb_raw)
        except ValueError:
            return _redirect_reseller_edit(user_id, err="مقادیر تغییر ظرفیت نامعتبر است")
        from app.services.adjust_mode import signed_adjustment
        from app.services.reseller_capacity import admin_adjust_reseller_subscription

        try:
            extra_days, extra_gb_signed = signed_adjustment(
                str(form.get("mode") or "").strip() or None, days=extra_days, gb=extra_gb
            )
            extra_gb = int(extra_gb_signed)
        except ValueError as e:
            return _redirect_reseller_edit(user_id, err=str(e))

        try:
            await admin_adjust_reseller_subscription(
                session, profile, extra_days=extra_days, extra_gb=extra_gb
            )
        except ValueError as e:
            return _redirect_reseller_edit(user_id, err=str(e))
        except Exception as e:
            logger.warning("Reseller capacity adjustment failed", exc_info=True)
            return _redirect_reseller_edit(user_id, err=operator_error(e, prefix="تغییر ظرفیت ناموفق"))
        return _redirect_reseller_edit(user_id, ok="ظرفیت اشتراک به‌روز شد")

    @app.post("/resellers/{user_id}/subscription/sync")
    async def reseller_subscription_sync(
        user_id: int,
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
    ):
        from app.services.platform_identity import is_explicit_owner_staff
        from app.services.reseller_capacity_view import sync_reseller_capacity

        if not is_explicit_owner_staff(staff):
            return _redirect_reseller_edit(user_id, err="فقط مالک اصلی می‌تواند ظرفیت را از پاسارگارد همگام کند")
        profile = (
            await session.execute(select(ResellerProfile).where(ResellerProfile.user_id == user_id))
        ).scalar_one_or_none()
        if not profile:
            return RedirectResponse(f"/resellers?err={_q('نماینده یافت نشد')}", status_code=303)
        try:
            gb, users = await sync_reseller_capacity(session, profile)
        except ValueError as e:
            return _redirect_reseller_edit(user_id, err=str(e))
        gb_text = f"{gb} گیگ" if gb else "حجم نامحدود"
        users_text = f"{users} کاربر" if users else "کاربر نامحدود"
        return _redirect_reseller_edit(user_id, ok=f"ظرفیت از پاسارگارد خوانده شد: {gb_text} · {users_text}")

    @app.post("/resellers/{user_id}/delete")
    async def reseller_delete(
        user_id: int,
        request: Request,
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
    ):
        form = await request.form()
        from app.services.delete_reason import delete_reason_too_short, extract_delete_reason

        reason = extract_delete_reason(form)
        if delete_reason_too_short(reason):
            return RedirectResponse(
                f"/resellers?err={_q('علت حذف نمایندگی الزامی است (حداقل ۳ کاراکتر)')}",
                status_code=303,
            )
        try:
            info = await revoke_reseller(
                session, user_id, delete_pg_admin=True, reason=reason
            )
        except ValueError as e:
            return RedirectResponse(f"/resellers?err={_q(str(e))}", status_code=303)
        except Exception as e:
            from app.services.users import friendly_user_delete_error

            return RedirectResponse(
                f"/resellers?err={_q(friendly_user_delete_error(e))}", status_code=303
            )
        from app.services.notifications import actor_label_from_staff

        user = await session.get(BotUser, user_id)
        notified = False
        if user:
            notified = await notify_reseller_revoked(
                int(info["telegram_id"]),
                reason,
                session=session,
                user=user,
                actor=actor_label_from_staff(staff),
            )
        else:
            notified = await notify_reseller_revoked(int(info["telegram_id"]), reason)
        label = info.get("telegram_id") or user_id
        note = " — پیام علت ارسال شد" if notified else " — پیام تلگرام ارسال نشد"
        pg_note = ""
        if info.get("pg_admin_username"):
            if info.get("pg_admin_deleted"):
                pg_note = f" — ادمین پاسارگارد «{info['pg_admin_username']}» هم حذف شد"
            else:
                pg_note = (
                    f" — ادمین پاسارگارد «{info['pg_admin_username']}» حذف نشد "
                    "(ممکن است از قبل نبوده باشد)"
                )
        return RedirectResponse(
            f"/resellers?ok={_q(f'نمایندگی {label} حذف شد{note}{pg_note}')}",
            status_code=303,
        )

    @app.post("/resellers/{user_id}/role")
    async def reseller_set_role(
        user_id: int,
        request: Request,
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
    ):
        form = await request.form()
        role = str(form.get("role") or "").strip()
        user = await session.get(BotUser, user_id)
        profile = (
            await session.execute(select(ResellerProfile).where(ResellerProfile.user_id == user_id))
        ).scalar_one_or_none()
        if not user or not profile:
            return RedirectResponse(f"/resellers?err={_q('نماینده یافت نشد')}", status_code=303)
        if role not in {Role.USER.value, Role.RESELLER.value, Role.ADMIN.value}:
            return RedirectResponse(f"/resellers?err={_q('نقش نامعتبر')}", status_code=303)

        reason = str(form.get("reason") or "").strip()
        # Reason is optional for role demotion; required only on explicit delete endpoints.

        if role == Role.USER.value:
            try:
                info = await revoke_reseller(
                    session, user_id, delete_pg_admin=True, reason=reason
                )
            except ValueError as e:
                return RedirectResponse(f"/resellers?err={_q(str(e))}", status_code=303)
            except Exception as e:
                from app.services.users import friendly_user_delete_error

                return RedirectResponse(
                    f"/resellers?err={_q(friendly_user_delete_error(e))}", status_code=303
                )
            from app.services.notifications import actor_label_from_staff

            user = await session.get(BotUser, user_id)
            if user:
                await notify_reseller_revoked(
                    int(info["telegram_id"]),
                    reason,
                    session=session,
                    user=user,
                    actor=actor_label_from_staff(staff),
                )
            else:
                await notify_reseller_revoked(int(info["telegram_id"]), reason)
            return RedirectResponse(
                f"/resellers?ok={_q('نقش به کاربر عادی تغییر کرد و اطلاع داده شد')}",
                status_code=303,
            )

        if role == Role.ADMIN.value:
            from app.services.notifications import actor_label_from_staff, notify_account_edit

            old_role = user.role
            profile.is_active = False
            user.role = Role.ADMIN.value
            await session.commit()
            from app.services.reseller_bots import sync_reseller_bot_runtime

            await sync_reseller_bot_runtime(profile)
            await notify_account_edit(
                session,
                user=user,
                event="role",
                reason=reason,
                old_role=old_role,
                new_role=Role.ADMIN.value,
                actor=actor_label_from_staff(staff),
            )
            return RedirectResponse(
                f"/resellers?ok={_q('نقش به مدیر تغییر کرد (پروفایل نماینده غیرفعال شد)')}",
                status_code=303,
            )

        # reseller
        from app.services.notifications import actor_label_from_staff, notify_account_edit

        old_role = user.role
        profile.is_active = True
        user.role = Role.RESELLER.value
        await session.commit()
        from app.services.reseller_bots import sync_reseller_bot_runtime

        await sync_reseller_bot_runtime(profile)
        await notify_account_edit(
            session,
            user=user,
            event="role",
            reason=reason,
            old_role=old_role,
            new_role=Role.RESELLER.value,
            actor=actor_label_from_staff(staff),
        )
        return RedirectResponse(
            f"/resellers?edit={int(user_id)}&ok={_q('نقش نماینده فعال شد')}",
            status_code=303,
        )

    @app.post("/resellers/{user_id}/delete-user")
    async def reseller_delete_user(
        user_id: int,
        request: Request,
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
    ):
        """Full bot-user delete from resellers tab (same cascade as /users delete)."""
        form = await request.form()
        from app.services.delete_reason import delete_reason_too_short, extract_delete_reason

        reason = extract_delete_reason(form)
        if delete_reason_too_short(reason):
            return RedirectResponse(
                f"/resellers?err={_q('علت حذف کاربر الزامی است')}",
                status_code=303,
            )
        from app.services.users import delete_bot_user, friendly_user_delete_error
        from app.services.notifications import actor_label_from_staff, notify_account_edit

        # Notify before delete while telegram_id still available
        user = await session.get(BotUser, user_id)
        if not user:
            return RedirectResponse(f"/resellers?err={_q('کاربر یافت نشد')}", status_code=303)
        try:
            assert_bot_user_in_scope(staff, user)
        except ShopScopeError as e:
            return RedirectResponse(f"/resellers?err={_q(e.message)}", status_code=303)
        try:
            await notify_account_edit(
                session,
                user=user,
                event="user_delete",
                reason=reason,
                actor=actor_label_from_staff(staff),
            )
            info = await delete_bot_user(
                session,
                user_id,
                actor_user_id=staff.get("bot_user_id"),
            )
        except ValueError as e:
            return RedirectResponse(f"/resellers?err={_q(str(e))}", status_code=303)
        except Exception as e:
            return RedirectResponse(
                f"/resellers?err={_q(friendly_user_delete_error(e))}", status_code=303
            )
        label = info.get("name") or info.get("telegram_id")
        return RedirectResponse(
            f"/resellers?ok={_q(f'کاربر {label} کامل حذف شد')}",
            status_code=303,
        )

    # ---- plans ----
    @app.get("/resellers/plans", response_class=HTMLResponse)
    async def reseller_plans_page(
        request: Request,
        staff: dict = Depends(require_admin),
    ):
        # Unified under /plans (audience=resellers section)
        return RedirectResponse("/plans#reseller-plans", status_code=303)

    @app.post("/resellers/plans")
    async def reseller_plan_create(
        request: Request,
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
    ):
        form = await request.form()
        from app.services.button_styles import parse_plan_button_style_form

        button_style = parse_plan_button_style_form(form)
        name = str(form.get("name") or "").strip()
        if not name:
            return RedirectResponse(f"/plans?err={_q('نام الزامی است')}#reseller-plans", status_code=303)
        try:
            price = int(str(form.get("price") or "0").replace(",", "").replace("٬", ""))
        except ValueError:
            price = 0
        plan_kind = _parse_plan_kind(form)
        try:
            sort_order = int(str(form.get("sort_order") or "0") or "0")
        except ValueError:
            sort_order = 0

        # Addon packs: capacity-only — no PG groups/role/perms/admin/share/extras.
        if _is_addon_plan_kind(plan_kind):
            try:
                addon_gb, addon_users = _addon_fields_from_form(form, plan_kind)
                await _validate_reseller_capacity_inputs(
                    staff, addon_gb=addon_gb, addon_users=addon_users, session=session
                )
            except ValueError as e:
                return RedirectResponse(
                    f"/plans?err={_q(str(e))}#reseller-plans", status_code=303
                )
            if max(0, price) <= 0:
                return RedirectResponse(
                    f"/plans?err={_q('قیمت بسته باید بیشتر از صفر باشد')}#reseller-plans",
                    status_code=303,
                )
            category_id = None
            try:
                from app.services.plan_categories import (
                    AUDIENCE_RESELLERS,
                    resolve_category_for_plan_write,
                )
                from app.services.shop_scope import ShopScopeError

                category_id = await resolve_category_for_plan_write(
                    session,
                    staff,
                    form.get("category_id"),
                    expected_audience=AUDIENCE_RESELLERS,
                )
            except (ShopScopeError, ValueError) as e:
                return RedirectResponse(
                    f"/plans?err={_q(str(e))}#reseller-plans-addons",
                    status_code=303,
                )
            plan = ResellerPlan(
                name=name,
                description=str(form.get("description") or "").strip() or None,
                price=max(0, price),
                billing_mode="fixed",
                price_per_gb=0,
                pg_group_ids=None,
                plan_kind=plan_kind,
                duration_days=0,
                included_gb=0,
                included_users=0,
                addon_gb=addon_gb,
                addon_users=addon_users,
                renew_pricing_mode="fixed",
                allow_buy_extra=False,
                extra_gb_price=0,
                extra_user_price=0,
                renew_price=0,
                can_approve_receipts=False,
                web_permissions="",
                bot_permissions="",
                create_pg_admin=False,
                create_web_access=False,
                share_pg_panel_url=False,
                pg_role_id=None,
                button_style=button_style,
                category_id=category_id,
                is_active=bool(form.get("is_active", "1")),
                sort_order=sort_order,
            )
            session.add(plan)
            await session.flush()
            from app.services.billing import sync_plan_billing_rate

            await sync_plan_billing_rate(session, plan)
            await session.commit()
            return RedirectResponse(
                f"/plans?ok={_q('بسته اضافه ذخیره شد')}#reseller-plans-addons",
                status_code=303,
            )

        billing_mode = str(form.get("billing_mode") or "fixed").strip().lower()
        if billing_mode not in {"fixed", "payg"}:
            billing_mode = "fixed"
        try:
            price_per_gb, payg_settings = payg_rate_and_settings(form, billing_mode=billing_mode)
        except ValueError as e:
            return RedirectResponse(f"/plans?err={_q(str(e))}#reseller-plans", status_code=303)
        pg_group_ids = _parse_pg_group_ids(form)
        if not pg_group_ids:
            return RedirectResponse(
                f"/plans?err={_q('حداقل یک گروه پاسارگارد الزامی است')}#reseller-plans",
                status_code=303,
            )
        perms = _feature_perms_from_form(form)
        pg_role_raw = str(form.get("pg_role_id") or "").strip()
        if not pg_role_raw.isdigit():
            return RedirectResponse(
                f"/plans?err={_q('نقش پاسارگارد الزامی است')}#reseller-plans",
                status_code=303,
            )
        try:
            await _validate_reseller_capacity_inputs(
                staff,
                included_gb=_parse_nonneg_int(form, "included_gb"),
                included_users=_parse_nonneg_int(form, "included_users"),
                session=session,
            )
        except ValueError as e:
            return RedirectResponse(
                f"/plans?err={_q(str(e))}#reseller-plans",
                status_code=303,
            )
        category_id = None
        try:
            from app.services.plan_categories import (
                AUDIENCE_RESELLERS,
                resolve_category_for_plan_write,
            )
            from app.services.shop_scope import ShopScopeError

            category_id = await resolve_category_for_plan_write(
                session,
                staff,
                form.get("category_id"),
                expected_audience=AUDIENCE_RESELLERS,
            )
        except (ShopScopeError, ValueError) as e:
            return RedirectResponse(
                f"/plans?err={_q(str(e))}#reseller-plans",
                status_code=303,
            )
        plan = ResellerPlan(
            name=name,
            description=str(form.get("description") or "").strip() or None,
            price=max(0, price),
            billing_mode=billing_mode,
            price_per_gb=price_per_gb,
            pg_group_ids=pg_group_ids,
            plan_kind="subscription",
            duration_days=_parse_nonneg_int(form, "duration_days"),
            included_gb=_parse_nonneg_int(form, "included_gb"),
            included_users=_parse_nonneg_int(form, "included_users"),
            addon_gb=0,
            addon_users=0,
            allow_buy_extra=bool(form.get("allow_buy_extra")) if billing_mode == "fixed" else False,
            extra_gb_price=_parse_nonneg_int(form, "extra_gb_price") if billing_mode == "fixed" else 0,
            extra_user_price=_parse_nonneg_int(form, "extra_user_price")
            if billing_mode == "fixed"
            else 0,
            renew_pricing_mode=_parse_renew_pricing_mode(
                form,
                allow_buy_extra=bool(form.get("allow_buy_extra")) if billing_mode == "fixed" else False,
            ),
            renew_price=_parse_nonneg_int(form, "renew_price"),
            carry_remaining_period=bool(form.get("carry_remaining_period")),
            keep_extras_on_renew=bool(form.get("keep_extras_on_renew")),
            can_approve_receipts="payments" in parse_perms(perms),
            web_permissions=perms,
            bot_permissions=perms,
            create_pg_admin=bool(form.get("create_pg_admin")),
            create_web_access=True,
            share_pg_panel_url=bool(form.get("share_pg_panel_url")),
            allow_pg_panel_access=bool(form.get("allow_pg_panel_access")),
            pg_role_id=int(pg_role_raw) if pg_role_raw.isdigit() else None,
            button_style=button_style,
            category_id=category_id,
            is_active=bool(form.get("is_active", "1")),
            sort_order=sort_order,
        )
        apply_payg_settings(plan, payg_settings)
        session.add(plan)
        await session.flush()
        from app.services.billing import sync_plan_billing_rate
        from app.services.reseller_plan_extra_packs import apply_extra_packs_from_form

        await sync_plan_billing_rate(session, plan)
        try:
            await apply_extra_packs_from_form(session, plan, form)
        except ValueError as e:
            await session.rollback()
            return RedirectResponse(
                f"/plans?err={_q(str(e))}#reseller-plans",
                status_code=303,
            )
        await session.commit()
        return RedirectResponse(f"/plans?ok={_q('پلن نمایندگی ذخیره شد')}#reseller-plans", status_code=303)

    @app.get("/resellers/plans/{plan_id}/edit", response_class=HTMLResponse)
    async def reseller_plan_edit_page(
        plan_id: int,
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
    ):
        plan = await session.get(ResellerPlan, plan_id)
        if not plan:
            return RedirectResponse(f"/plans?err={_q('یافت نشد')}#reseller-plans", status_code=303)
        return spa_response("resellers/plans/edit")

    @app.post("/resellers/plans/{plan_id}/edit")
    async def reseller_plan_edit_save(
        plan_id: int,
        request: Request,
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
    ):
        plan = await session.get(ResellerPlan, plan_id)
        if not plan:
            return RedirectResponse(f"/plans?err={_q('یافت نشد')}#reseller-plans", status_code=303)
        form = await request.form()
        from app.services.button_styles import parse_plan_button_style_form
        from app.services.pg_admin_subscription import is_current_capacity_plan

        button_style = parse_plan_button_style_form(form)

        # System «ظرفیت فعلی»: allow price/duration/perms/renew only — lock kind & capacity.
        if bool(getattr(plan, "is_system", False)) or is_current_capacity_plan(plan):
            plan.button_style = button_style
            plan.description = str(form.get("description") or "").strip() or None
            try:
                plan.price = max(
                    0, int(str(form.get("price") or "0").replace(",", "").replace("٬", ""))
                )
            except ValueError:
                pass
            try:
                plan.sort_order = int(str(form.get("sort_order") or "0") or "0")
            except ValueError:
                pass
            plan.plan_kind = "current_capacity"
            plan.is_system = True
            plan.is_active = True
            plan.billing_mode = "fixed"
            plan.price_per_gb = 0
            plan.pg_group_ids = None
            plan.included_gb = 0
            plan.included_users = 0
            plan.addon_gb = 0
            plan.addon_users = 0
            plan.create_pg_admin = False
            plan.create_web_access = True
            plan.duration_days = _parse_nonneg_int(form, "duration_days")
            plan.renew_price = _parse_nonneg_int(form, "renew_price")
            plan.allow_buy_extra = bool(form.get("allow_buy_extra"))
            plan.extra_gb_price = (
                _parse_nonneg_int(form, "extra_gb_price") if plan.allow_buy_extra else 0
            )
            plan.extra_user_price = (
                _parse_nonneg_int(form, "extra_user_price") if plan.allow_buy_extra else 0
            )
            plan.renew_pricing_mode = _parse_renew_pricing_mode(
                form, allow_buy_extra=bool(plan.allow_buy_extra)
            )
            plan.carry_remaining_period = bool(form.get("carry_remaining_period"))
            plan.keep_extras_on_renew = bool(form.get("keep_extras_on_renew"))
            plan.share_pg_panel_url = bool(form.get("share_pg_panel_url"))
            plan.allow_pg_panel_access = bool(form.get("allow_pg_panel_access"))
            perms = _feature_perms_from_form(form)
            plan.web_permissions = perms
            plan.bot_permissions = perms
            plan.can_approve_receipts = "payments" in parse_perms(perms)
            # Keep name stable for operator recognition.
            from app.services.resellers import CURRENT_CAPACITY_PLAN_NAME

            plan.name = CURRENT_CAPACITY_PLAN_NAME
            from app.services.billing import sync_plan_billing_rate
            from app.services.reseller_plan_extra_packs import apply_extra_packs_from_form

            await sync_plan_billing_rate(session, plan)
            try:
                await apply_extra_packs_from_form(session, plan, form)
            except ValueError as e:
                await session.rollback()
                return RedirectResponse(
                    f"/resellers/plans/{plan_id}/edit?err={_q(str(e))}",
                    status_code=303,
                )
            await session.commit()
            return RedirectResponse(
                f"/plans?ok={_q('پلن ظرفیت فعلی ذخیره شد')}#reseller-plans",
                status_code=303,
            )

        name = str(form.get("name") or "").strip()
        if not name:
            return RedirectResponse(
                f"/resellers/plans/{plan_id}/edit?err={_q('نام الزامی است')}", status_code=303
            )
        plan.name = name
        plan.button_style = button_style
        plan.description = str(form.get("description") or "").strip() or None
        try:
            plan.price = max(0, int(str(form.get("price") or "0").replace(",", "").replace("٬", "")))
        except ValueError:
            pass
        try:
            plan.sort_order = int(str(form.get("sort_order") or "0") or "0")
        except ValueError:
            pass
        plan.is_active = bool(form.get("is_active"))
        plan_kind = _parse_plan_kind(form)

        if _is_addon_plan_kind(plan_kind):
            try:
                addon_gb, addon_users = _addon_fields_from_form(form, plan_kind)
                await _validate_reseller_capacity_inputs(
                    staff, addon_gb=addon_gb, addon_users=addon_users, session=session
                )
            except ValueError as e:
                return RedirectResponse(
                    f"/resellers/plans/{plan_id}/edit?err={_q(str(e))}", status_code=303
                )
            if int(plan.price or 0) <= 0:
                return RedirectResponse(
                    f"/resellers/plans/{plan_id}/edit?err={_q('قیمت بسته باید بیشتر از صفر باشد')}",
                    status_code=303,
                )
            try:
                from app.services.plan_categories import (
                    AUDIENCE_RESELLERS,
                    resolve_category_for_plan_write,
                )
                from app.services.shop_scope import ShopScopeError

                plan.category_id = await resolve_category_for_plan_write(
                    session,
                    staff,
                    form.get("category_id"),
                    expected_audience=AUDIENCE_RESELLERS,
                    allow_inactive_id=plan.category_id,
                )
            except (ShopScopeError, ValueError) as e:
                return RedirectResponse(
                    f"/resellers/plans/{plan_id}/edit?err={_q(str(e))}",
                    status_code=303,
                )
            # Strip subscription-only knobs — addons never provision admins/groups.
            plan.plan_kind = plan_kind
            plan.billing_mode = "fixed"
            plan.price_per_gb = 0
            plan.pg_group_ids = None
            plan.duration_days = 0
            plan.included_gb = 0
            plan.included_users = 0
            plan.addon_gb = addon_gb
            plan.addon_users = addon_users
            plan.renew_pricing_mode = "fixed"
            plan.allow_buy_extra = False
            plan.extra_gb_price = 0
            plan.extra_user_price = 0
            plan.renew_price = 0
            plan.can_approve_receipts = False
            plan.web_permissions = ""
            plan.bot_permissions = ""
            plan.create_pg_admin = False
            plan.create_web_access = False
            plan.share_pg_panel_url = False
            plan.pg_role_id = None
            from app.services.billing import sync_plan_billing_rate

            await sync_plan_billing_rate(session, plan)
            await session.commit()
            return RedirectResponse(
                f"/plans?ok={_q('بسته اضافه ذخیره شد')}#reseller-plans-addons",
                status_code=303,
            )

        billing_mode = str(form.get("billing_mode") or plan.billing_mode or "fixed").strip().lower()
        if billing_mode not in {"fixed", "payg"}:
            billing_mode = "fixed"
        plan.billing_mode = billing_mode
        pg_group_ids = _parse_pg_group_ids(form)
        if not pg_group_ids:
            return RedirectResponse(
                f"/resellers/plans/{plan_id}/edit?err={_q('حداقل یک گروه پاسارگارد الزامی است')}",
                status_code=303,
            )
        try:
            await _validate_reseller_capacity_inputs(
                staff,
                included_gb=_parse_nonneg_int(form, "included_gb"),
                included_users=_parse_nonneg_int(form, "included_users"),
                session=session,
            )
        except ValueError as e:
            return RedirectResponse(
                f"/resellers/plans/{plan_id}/edit?err={_q(str(e))}",
                status_code=303,
            )
        try:
            payg_rate, payg_settings = payg_rate_and_settings(form, billing_mode=billing_mode)
        except ValueError as e:
            return RedirectResponse(
                f"/resellers/plans/{plan_id}/edit?err={_q(str(e))}",
                status_code=303,
            )
        if billing_mode == "payg":
            plan.price_per_gb = payg_rate
            apply_payg_settings(plan, payg_settings)
            plan.pg_group_ids = pg_group_ids
            plan.allow_buy_extra = False
            plan.extra_gb_price = 0
            plan.extra_user_price = 0
        else:
            plan.price_per_gb = 0
            plan.pg_group_ids = pg_group_ids
            plan.allow_buy_extra = bool(form.get("allow_buy_extra"))
            plan.extra_gb_price = _parse_nonneg_int(form, "extra_gb_price")
            plan.extra_user_price = _parse_nonneg_int(form, "extra_user_price")
        perms = _feature_perms_from_form(form)
        plan.web_permissions = perms
        plan.bot_permissions = perms
        plan.can_approve_receipts = "payments" in parse_perms(perms)
        plan.create_pg_admin = bool(form.get("create_pg_admin"))
        plan.share_pg_panel_url = bool(form.get("share_pg_panel_url"))
        plan.allow_pg_panel_access = bool(form.get("allow_pg_panel_access"))
        plan.renew_price = _parse_nonneg_int(form, "renew_price")
        plan.carry_remaining_period = bool(form.get("carry_remaining_period"))
        plan.keep_extras_on_renew = bool(form.get("keep_extras_on_renew"))
        plan.plan_kind = "subscription"
        plan.duration_days = _parse_nonneg_int(form, "duration_days")
        plan.included_gb = _parse_nonneg_int(form, "included_gb")
        plan.included_users = _parse_nonneg_int(form, "included_users")
        plan.addon_gb = 0
        plan.addon_users = 0
        plan.renew_pricing_mode = _parse_renew_pricing_mode(
            form, allow_buy_extra=bool(plan.allow_buy_extra)
        )
        plan.create_web_access = True
        pg_role_raw = str(form.get("pg_role_id") or "").strip()
        if not pg_role_raw.isdigit():
            return RedirectResponse(
                f"/resellers/plans/{plan_id}/edit?err={_q('نقش پاسارگارد الزامی است')}",
                status_code=303,
            )
        plan.pg_role_id = int(pg_role_raw)
        try:
            from app.services.plan_categories import (
                AUDIENCE_RESELLERS,
                resolve_category_for_plan_write,
            )
            from app.services.shop_scope import ShopScopeError

            plan.category_id = await resolve_category_for_plan_write(
                session,
                staff,
                form.get("category_id"),
                expected_audience=AUDIENCE_RESELLERS,
                allow_inactive_id=plan.category_id,
            )
        except (ShopScopeError, ValueError) as e:
            return RedirectResponse(
                f"/resellers/plans/{plan_id}/edit?err={_q(str(e))}",
                status_code=303,
            )
        from app.services.billing import sync_plan_billing_rate
        from app.services.reseller_plan_extra_packs import apply_extra_packs_from_form

        await sync_plan_billing_rate(session, plan)
        try:
            await apply_extra_packs_from_form(session, plan, form)
        except ValueError as e:
            await session.rollback()
            return RedirectResponse(
                f"/resellers/plans/{plan_id}/edit?err={_q(str(e))}",
                status_code=303,
            )
        await session.commit()
        return RedirectResponse(
            f"/plans?ok={_q('پلن نمایندگی ذخیره شد')}#reseller-plans", status_code=303
        )

    @app.post("/resellers/plans/{plan_id}/toggle")
    async def reseller_plan_toggle(
        plan_id: int,
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
    ):
        plan = await session.get(ResellerPlan, plan_id)
        if plan:
            if bool(getattr(plan, "is_system", False)):
                return RedirectResponse(
                    f"/plans?err={_q('پلن سیستمی («ظرفیت فعلی») قابل خاموش‌کردن نیست')}#reseller-plans",
                    status_code=303,
                )
            plan.is_active = not plan.is_active
            from app.services.billing import sync_plan_billing_rate

            await sync_plan_billing_rate(session, plan)
            await session.commit()
        return RedirectResponse("/plans#reseller-plans", status_code=303)

    @app.post("/resellers/plans/{plan_id}/delete")
    async def reseller_plan_delete(
        plan_id: int,
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
    ):
        from app.services.plans_catalog import PlanDeleteBlocked, delete_reseller_plan

        plan = await session.get(ResellerPlan, plan_id)
        if not plan:
            return RedirectResponse("/plans#reseller-plans", status_code=303)
        try:
            await delete_reseller_plan(session, plan)
            await session.commit()
        except PlanDeleteBlocked as e:
            try:
                await session.rollback()
            except Exception:
                logger.debug("reseller_plan_delete: ignored failure", exc_info=True)
            return RedirectResponse(
                f"/plans?err={_q(e.message)}#reseller-plans", status_code=303
            )
        return RedirectResponse(f"/plans?ok={_q('حذف شد')}#reseller-plans", status_code=303)

    # ---- applications ----
    @app.get("/resellers/applications", response_class=HTMLResponse)
    async def reseller_apps_page(staff: dict = Depends(require_admin)):
        _require_rep_mgmt(staff)
        return spa_response("resellers/applications")

    @app.post("/resellers/applications/{app_id}/approve")
    async def reseller_app_approve(
        app_id: int,
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
    ):
        _require_rep_mgmt(staff)
        app = await get_application(session, app_id)
        if not app:
            return RedirectResponse(f"/resellers/applications?err={_q('یافت نشد')}", status_code=303)
        try:
            creds = await approve_application(
                session,
                app,
                reviewer_tg=0,
                panel_base_url=await get_reseller_panel_base_url(session),
            )
            user = await session.get(BotUser, app.user_id)
            if user:
                from app.bot import create_bot

                bot = create_bot()
                try:
                    await bot.send_message(
                        user.telegram_id,
                        format_credentials_message(creds),
                        parse_mode="HTML",
                    )
                finally:
                    await bot.session.close()
        except Exception as e:
            return RedirectResponse(
                f"/resellers/applications?err={_q(str(e))}", status_code=303
            )
        return RedirectResponse(
            f"/resellers/applications?ok={_q('تأیید شد — اطلاعات ورود ارسال شد')}",
            status_code=303,
        )

    @app.post("/resellers/applications/{app_id}/reject")
    async def reseller_app_reject(
        app_id: int,
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
    ):
        _require_rep_mgmt(staff)
        app = await get_application(session, app_id)
        if not app:
            return RedirectResponse(f"/resellers/applications?err={_q('یافت نشد')}", status_code=303)
        try:
            await reject_application(session, app, reviewer_tg=0)
            user = await session.get(BotUser, app.user_id)
            if user:
                from app.bot import create_bot

                bot = create_bot()
                try:
                    await bot.send_message(
                        user.telegram_id,
                        "❌ درخواست نمایندگی شما رد شد.\nدر صورت نیاز با پشتیبانی در ارتباط باشید.",
                        reply_markup=support_markup(),
                    )
                finally:
                    await bot.session.close()
        except Exception as e:
            return RedirectResponse(
                f"/resellers/applications?err={_q(str(e))}", status_code=303
            )
        return RedirectResponse(f"/resellers/applications?ok={_q('رد شد')}", status_code=303)
