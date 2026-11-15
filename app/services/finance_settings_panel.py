"""Data of the finance settings dialog (payment, PAYG, cleanup, purge) for the React panel.

The forms still post the existing settings handlers; this module only describes their fields. Secret
fields (``password`` kind) are never sent back, only whether a value is saved, and the online gateway
list is the credential-free editor form.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.finance_panel import SCOPE_UNKNOWN, FinanceAccess, FinanceScopeError
from app.services.order_purge import purge_panel_context
from app.services.psp_gateways import psp_gateways_form_json
from app.services.shop_scope import shop_owner_id
from app.services.stale_order_cleanup import cleanup_status
from app.services.users import SETTING_GROUPS, SETTING_VISIBILITY, TAB_SETTING_GROUPS, get_all_settings

TRUE_VALUES = frozenset({"1", "true", "yes", "on"})
NEXT_BASE = "/finance?tab=orders"
# A payment-method card is shown only while its switch is on.
PAYMENT_GROUP_GATES = {
    "کارت به کارت": "pay_card_enabled",
    "تأیید خودکار کارت به کارت": "pay_card_auto_enabled",
    "درگاه پرداخت": "pay_gateway_enabled",
    "درگاه آنلاین API": "pay_psp_enabled",
    "بزن به کارت": "pay_bbc_enabled",
    "رمزارز": "pay_crypto_enabled",
    "استارز تلگرام": "pay_stars_enabled",
}
LIST_KINDS = frozenset({"payment_cards", "payment_gateways", "payment_crypto_wallets"})


def _field_payload(field: tuple, values: dict[str, str]) -> dict[str, Any]:
    key, label = field[0], field[1]
    kind = field[2] if len(field) > 2 else "text"
    help_text = field[3] if len(field) > 3 else ""
    options = field[4] if len(field) > 4 else []
    raw = str(values.get(key, "") or "")
    payload: dict[str, Any] = {"key": key, "label": label, "kind": kind, "help": help_text, "options": []}
    if kind == "toggle":
        payload["value"] = raw in TRUE_VALUES
    elif kind == "password":
        payload["value"] = ""
        payload["has_value"] = bool(raw)
    elif kind == "psp_gateways":
        payload["value"] = psp_gateways_form_json(values)
    elif kind in LIST_KINDS:
        payload["value"] = str(values.get(key, "") or "[]")
    elif kind == "select":
        payload["options"] = [{"value": value, "label": text} for value, text in options]
        payload["value"] = raw or (options[0][0] if options else "")
    else:
        payload["value"] = raw
    rule = SETTING_VISIBILITY.get(key)
    payload["show_when"] = {"key": rule[0], "values": list(rule[1])} if rule else None
    return payload


def _groups_payload(tab: str, values: dict[str, str]) -> list[dict[str, Any]]:
    gates = PAYMENT_GROUP_GATES if tab == "payment" else {}
    return [
        {
            "name": name,
            "gate": gates.get(name),
            "fields": [_field_payload(field, values) for field in SETTING_GROUPS[name]],
        }
        for name in TAB_SETTING_GROUPS.get(tab, [])
        if name in SETTING_GROUPS
    ]


def _purge_payload(purge: dict[str, Any]) -> dict[str, Any]:
    ready = purge["ready"]
    last = purge["last_run"]
    return {
        "sections": [
            {
                "title": section.title,
                "rows": [
                    {"token": row.tag.token, "status": row.tag.status, "label": row.tag.label, "on": bool(row.on)}
                    for row in section.rows
                ],
            }
            for section in purge["sections"]
        ],
        "days": int(purge["days"]),
        "min_days": int(purge["min_days"]),
        "max_days": int(purge["max_days"]),
        "ready": {"orders": int(ready.orders), "payments": int(ready.payments), "total": int(ready.total)},
        "auto_on": bool(purge["auto_on"]),
        "last_run": (
            {"at": str(last["at"]), "kind": str(last["kind"]), "orders": int(last["orders"]), "payments": int(last["payments"])}
            if last
            else None
        ),
        "rules_action": str(purge["rules_action"]),
        "run_action": str(purge["run_action"]),
    }


def _cleanup_payload(status: dict[str, Any] | None) -> dict[str, Any] | None:
    if status is None:
        return None
    return {
        "ready_count": int(status["ready_count"]),
        "last_run": str(status["last_run"]),
        "last_count": int(status["last_count"]),
    }


def _next(settings_tab: str) -> str:
    return quote(f"{NEXT_BASE}&settings={settings_tab}")


async def settings_payload(session: AsyncSession, staff: dict, access: FinanceAccess) -> dict[str, Any]:
    """The dialog's tabs with their fields, saved values and the existing handlers they post to."""
    if not access.can_settings:
        raise PermissionError("دسترسی تنظیمات مالی ندارید")
    if access.platform:
        values = await get_all_settings(session)
        base, pending_path = "/settings", "/settings/cancel-pending-orders"
        can_cleanup = staff.get("role") == "admin"
        cleanup = await cleanup_status(session, values, reseller_id=None)
    else:
        shop_id = shop_owner_id(staff)
        if not shop_id:
            # Never fall back to the Owner's settings for staff without a shop.
            raise FinanceScopeError(SCOPE_UNKNOWN)
        values = await get_all_settings(session, reseller_id=shop_id)
        base, pending_path = "/shop-settings", "/shop-settings/cancel-pending-orders"
        can_cleanup = True
        cleanup = await cleanup_status(session, values, reseller_id=int(shop_id))
    purge = await purge_panel_context(session, staff, values, return_to=f"{NEXT_BASE}&settings=purge")
    tabs = [{"id": "payment", "label": "پرداخت"}]
    if access.can_billing:
        tabs.append({"id": "billing", "label": "مدیریت PAYG"})
    if can_cleanup:
        tabs.append({"id": "cleanup", "label": "پاکسازی"})
    if purge:
        tabs.append({"id": "purge", "label": "حذف کامل"})
    return {
        "tabs": tabs,
        "groups": {
            "payment": _groups_payload("payment", values),
            "billing": _groups_payload("billing", values) if access.can_billing else [],
            "cleanup": _groups_payload("cleanup", values) if can_cleanup else [],
        },
        "actions": {
            "payment": f"{base}?tab=payment&next={_next('payment')}",
            "billing": f"{base}?tab=billing&next={_next('billing')}",
            "cleanup": f"{base}?tab=cleanup&next={_next('cleanup')}",
            "pending_orders": f"{pending_path}?next={_next('cleanup')}",
        },
        "cleanup_status": _cleanup_payload(cleanup) if can_cleanup else None,
        "purge": _purge_payload(purge) if purge else None,
    }
