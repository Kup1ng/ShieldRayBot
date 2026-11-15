"""Data of the support page (``/tickets``) for the React panel.

Two kinds of ticket live there: panel tickets (a shop or sub-admin writing to the Owner) and the
customers' Telegram tickets of one shop. Every read repeats the page's scope rules; customer text is
returned as plain strings and never as markup.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import BotUser, PanelTicket, Ticket
from app.services import tickets as bot_tickets
from app.services.button_styles import item_button_style_options
from app.services.formatting import bot_user_panel_label
from app.services.panel_tickets import (
    PRIORITY_BADGE,
    PRIORITY_LABELS,
    STATUS_BADGE,
    STATUS_LABELS,
    get_ticket,
    list_tickets,
    mark_viewed,
)
from app.services.settings_form_payload import sections_payload
from app.services.shop_scope import is_platform_admin, shop_owner_id
from app.services.support_contacts import get_support_contacts
from app.services.ticket_scope import staff_ticket_in_scope, ticket_shop_clause
from app.services.users import SETTING_GROUPS, TAB_SETTING_GROUPS, get_all_settings

PANEL_TICKET_LIMIT = 150
BOT_TICKET_LIMIT = 100
MESSAGE_LIMIT = 200
CLOSED = "closed"
INHERIT_STYLE_LABEL = "ارث از پشتیبانی"
BOT_STATUS_LABELS = {"open": "باز", "answered": "پاسخ‌داده‌شده", "closed": "بسته"}
UNKNOWN_LABEL = "نامشخص"
# The old badge classes, as the chip colours the panel uses.
BADGE_COLORS = {"open": "warning", "info": "accent", "answered": "success", "neutral": "default", "warn": "warning", "danger": "danger"}


def staff_can_manage_bot_tickets(staff: dict) -> bool:
    if is_platform_admin(staff):
        return True
    return staff.get("role") == "reseller" and "tickets" in (staff.get("permissions") or [])


def can_manage_supports(staff: dict) -> bool:
    return staff.get("role") == "admin" or (staff.get("role") == "reseller" and "shop_settings" in (staff.get("permissions") or []))


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if isinstance(value, datetime) else None


def _bot_status_color(status: str) -> str:
    return {"open": "warning", "closed": "default"}.get(status, "success")


def _panel_row(ticket: PanelTicket, *, owner: bool) -> dict[str, Any]:
    return {
        "id": int(ticket.id),
        "subject": ticket.subject,
        "status": ticket.status,
        "status_label": STATUS_LABELS.get(ticket.status, ticket.status or UNKNOWN_LABEL),
        "status_color": BADGE_COLORS[STATUS_BADGE.get(ticket.status, "neutral")],
        "priority": ticket.priority,
        "priority_label": PRIORITY_LABELS.get(ticket.priority, ticket.priority or UNKNOWN_LABEL),
        "priority_color": BADGE_COLORS[PRIORITY_BADGE.get(ticket.priority, "neutral")],
        "opener_label": ticket.opener_label or "",
        "opener_role": ticket.opener_role,
        "updated_at": _iso(ticket.updated_at),
        "unread": bool(ticket.owner_unread if owner else ticket.answered_unread),
    }


def _bot_row(ticket: Ticket, users: dict[int, BotUser]) -> dict[str, Any]:
    user_id = int(ticket.user_id)
    return {
        "id": int(ticket.id),
        "user_id": user_id,
        "user_label": bot_user_panel_label(users.get(user_id), fallback_id=user_id),
        "subject": ticket.subject,
        "status": ticket.status,
        "status_label": BOT_STATUS_LABELS.get(ticket.status, ticket.status or UNKNOWN_LABEL),
        "status_color": _bot_status_color(ticket.status),
        "updated_at": _iso(ticket.updated_at or ticket.created_at),
    }


async def _bot_tickets(session: AsyncSession, staff: dict) -> list[dict[str, Any]]:
    """The newest Telegram tickets of the staff member's own shop (the platform's for the Owner)."""
    shop_id = None if is_platform_admin(staff) else shop_owner_id(staff)
    if shop_id is None and not is_platform_admin(staff):
        return []
    rows = list(
        (await session.execute(select(Ticket).where(ticket_shop_clause(shop_id)).order_by(Ticket.id.desc()).limit(BOT_TICKET_LIMIT)))
        .scalars()
        .all()
    )
    user_ids = {int(row.user_id) for row in rows if row.user_id}
    users = {}
    if user_ids:
        users = {int(user.id): user for user in (await session.execute(select(BotUser).where(BotUser.id.in_(user_ids)))).scalars().all()}
    return [_bot_row(row, users) for row in rows]


async def overview_payload(session: AsyncSession, staff: dict) -> dict[str, Any]:
    """The two ticket lists and what this staff member may do on the page."""
    owner = is_platform_admin(staff)
    rows = await list_tickets(session, staff, limit=PANEL_TICKET_LIMIT)
    show_bot = staff_can_manage_bot_tickets(staff)
    return {
        "is_owner": owner,
        "can_create": staff.get("role") in {"reseller", "pg_staff"},
        "can_manage_supports": can_manage_supports(staff),
        "show_bot_tickets": show_bot,
        "panel_tickets": [_panel_row(row, owner=owner) for row in rows],
        "bot_tickets": await _bot_tickets(session, staff) if show_bot else [],
        "priorities": [{"value": value, "label": label} for value, label in PRIORITY_LABELS.items()],
        "limit": PANEL_TICKET_LIMIT,
    }


def _message_rows(messages: list[Any], build: Any) -> tuple[list[dict[str, Any]], int]:
    ordered = sorted(messages, key=lambda m: (m.created_at is None, m.created_at, m.id))
    hidden = max(0, len(ordered) - MESSAGE_LIMIT)
    return [build(message) for message in ordered[hidden:]], hidden


async def panel_ticket_detail(session: AsyncSession, staff: dict, ticket_id: int) -> dict[str, Any] | None:
    """One panel ticket with its thread; opening it clears the unread flag the viewer owns."""
    ticket = await get_ticket(session, staff, ticket_id)
    if ticket is None:
        return None
    owner = is_platform_admin(staff)

    def build(message: Any) -> dict[str, Any]:
        has_file = bool(message.attachment_path)
        return {
            "id": int(message.id),
            "from_owner": message.sender_role == "admin",
            "sender_label": message.sender_label or message.sender_role,
            "body": message.body or "",
            "created_at": _iso(message.created_at),
            "attachment": (
                {"name": message.attachment_name or "", "url": f"/tickets/panel/{int(ticket.id)}/attachment/{int(message.id)}"} if has_file else None
            ),
        }

    # Read everything before the unread mark is cleared: that commit refreshes the row's timestamps.
    messages, hidden = _message_rows(list(ticket.messages or []), build)
    row = _panel_row(ticket, owner=owner)
    closed = ticket.status == CLOSED
    changed = await mark_viewed(session, staff, ticket)
    return {
        **row,
        "unread": False if changed else row["unread"],
        "was_unread": changed,
        "messages": messages,
        "hidden_earlier": hidden,
        "can_reply": not closed,
        "can_set_status": owner,
        "can_close": (not owner) and not closed,
        "statuses": [{"value": value, "label": label} for value, label in STATUS_LABELS.items()] if owner else [],
    }


async def bot_ticket_detail(session: AsyncSession, staff: dict, ticket_id: int) -> dict[str, Any] | None:
    """One customer ticket of the staff member's own shop, or None (missing or another shop's)."""
    if not staff_can_manage_bot_tickets(staff):
        return None
    ticket = await bot_tickets.get_ticket(session, int(ticket_id))
    if ticket is None or not staff_ticket_in_scope(staff, ticket):
        return None
    user = await session.get(BotUser, int(ticket.user_id))
    messages, hidden = _message_rows(
        list(ticket.messages or []),
        lambda m: {"id": int(m.id), "from_staff": bool(m.is_staff), "body": m.body or "", "created_at": _iso(m.created_at)},
    )
    return {
        **_bot_row(ticket, {int(user.id): user} if user else {}),
        "messages": messages,
        "hidden_earlier": hidden,
        "can_reply": ticket.status != CLOSED,
        "user_known": user is not None,
    }


async def supports_payload(session: AsyncSession, staff: dict) -> dict[str, Any]:
    """Support contacts and the support texts the «پشتیبان‌ها» dialog edits (empty when no shop is known)."""
    owner = is_platform_admin(staff)
    shop_id = None if owner else shop_owner_id(staff)
    payload: dict[str, Any] = {
        "contacts": [],
        "style_options": [{"value": value, "label": label, "tone": tone} for value, label, tone in item_button_style_options(inherit_label=INHERIT_STYLE_LABEL)],
        "sections": [],
        "save_action": "/supports/save" if owner else "/shop-supports/save",
        "text_action": "/settings?tab=supports" if owner else "/shop-settings?tab=supports",
    }
    if not owner and not shop_id:
        # No shop scope: fail closed, never the Owner's contacts.
        return payload
    payload["contacts"] = [
        {
            "id": contact["id"],
            "title": contact["title"],
            "telegram": contact["telegram"],
            "sort": contact["sort"],
            "enabled": bool(contact["enabled"]),
            "button_style": contact.get("button_style"),
        }
        for contact in await get_support_contacts(session, reseller_id=shop_id)
    ]
    values = await get_all_settings(session, reseller_id=shop_id) if shop_id else await get_all_settings(session)
    groups = {name: SETTING_GROUPS[name] for name in TAB_SETTING_GROUPS.get("supports") or [] if name in SETTING_GROUPS}
    payload["sections"] = sections_payload(groups, values)
    return payload
