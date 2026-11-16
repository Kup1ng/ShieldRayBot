"""Internal panel ticketing pages: reseller / pg_staff ↔ platform admin."""

from __future__ import annotations

from urllib.parse import quote

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.spa_pages import spa_response
from app.db.models import BotUser, Ticket
from app.services.ticket_scope import staff_ticket_in_scope
from app.services.panel_tickets import (
    can_access_panel_tickets,
    create_ticket,
    get_ticket,
    reply_ticket,
    resolve_ticket_attachment_path,
    save_ticket_attachment,
    set_status,
    sidebar_unread_count,
)
from app.services.redact import user_safe_error
from app.services.shop_scope import is_platform_admin
from app.services.tickets_panel import staff_can_manage_bot_tickets
import logging

logger = logging.getLogger(__name__)

async def _bot_ticket_in_scope(session: AsyncSession, staff: dict, ticket: Ticket) -> bool:
    """Tenant isolation for Telegram Ticket rows."""
    return staff_ticket_in_scope(staff, ticket)


async def _staff_sender_tg(session: AsyncSession, staff: dict) -> int:
    uid = staff.get("bot_user_id")
    if not uid:
        return 0
    try:
        row = await session.get(BotUser, int(uid))
    except Exception:
        return 0
    if row and row.telegram_id:
        return int(row.telegram_id)
    return 0


async def _notify_bot_ticket_staff_reply(
    session: AsyncSession,
    ticket: Ticket,
    body: str,
    *,
    actor_name: str | None = None,
) -> None:
    """Send staff reply to the Telegram user (same path as in-bot ticket reply)."""
    from app.bot import create_bot
    from app.services.notifications import notify_ticket_message

    bot = create_bot()
    try:
        await notify_ticket_message(
            bot,
            session,
            ticket_id=int(ticket.id),
            subject=ticket.subject,
            body=body,
            from_staff=True,
            ticket_user_id=int(ticket.user_id),
            actor_name=actor_name,
            ticket_reseller_id=ticket.reseller_id,
        )
    finally:
        try:
            await bot.session.close()
        except Exception:
            logger.debug("_notify_bot_ticket_staff_reply: ignored failure", exc_info=True)


def register_panel_tickets_pages(app: FastAPI, *, render, require_staff, get_db) -> None:
    @app.get("/tickets", response_class=HTMLResponse)
    async def tickets_page(staff: dict = Depends(require_staff)):
        # The page is the React app; its data comes from /api/panel/tickets.
        if not can_access_panel_tickets(staff):
            return RedirectResponse("/home", status_code=303)
        return spa_response("tickets")

    @app.post("/tickets/panel/create")
    async def tickets_panel_create(
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
        subject: str = Form(...),
        body: str = Form(""),
        priority: str = Form("normal"),
        attachment: UploadFile | None = File(None),
    ):
        if staff.get("role") not in {"reseller", "pg_staff"}:
            return RedirectResponse(
                "/tickets?err=" + quote("فقط نماینده / ادمین فرعی می‌تواند تیکت بسازد"),
                status_code=303,
            )
        try:
            att = await save_ticket_attachment(attachment)
            ticket = await create_ticket(
                session,
                staff,
                subject=subject,
                body=body,
                priority=priority,
                attachment=att,
            )
            return RedirectResponse(f"/tickets?ok=created&view={ticket.id}", status_code=303)
        except Exception as exc:
            logger.warning("Ticket action failed", exc_info=True)
            return RedirectResponse(
                f"/tickets?err={quote(user_safe_error(exc))}&new=1",
                status_code=303,
            )

    @app.get("/tickets/panel/{ticket_id}/attachment/{message_id}")
    async def tickets_panel_attachment(
        ticket_id: int,
        message_id: int,
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ):
        if not can_access_panel_tickets(staff):
            raise HTTPException(403, "forbidden")
        ticket = await get_ticket(session, staff, ticket_id)
        if not ticket:
            raise HTTPException(404, "not found")
        msg = next((m for m in (ticket.messages or []) if int(m.id) == int(message_id)), None)
        if not msg or not msg.attachment_path:
            raise HTTPException(404, "not found")
        path = resolve_ticket_attachment_path(msg.attachment_path)
        if not path:
            raise HTTPException(404, "not found")
        return FileResponse(
            path,
            filename=msg.attachment_name or path.name,
            media_type=msg.attachment_mime or "application/octet-stream",
            content_disposition_type="attachment",
            headers={
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )

    @app.post("/tickets/panel/{ticket_id}/reply")
    async def tickets_panel_reply(
        ticket_id: int,
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
        body: str = Form(""),
        attachment: UploadFile | None = File(None),
    ):
        if not can_access_panel_tickets(staff):
            return RedirectResponse("/tickets?err=" + quote("دسترسی ندارید"), status_code=303)
        # Authorize ticket access before writing any bytes to disk
        existing = await get_ticket(session, staff, ticket_id)
        if not existing:
            return RedirectResponse("/tickets?err=" + quote("تیکت یافت نشد"), status_code=303)
        att = None
        try:
            att = await save_ticket_attachment(attachment, ticket_id=ticket_id)
            await reply_ticket(session, staff, ticket_id, body=body, attachment=att)
            return RedirectResponse(f"/tickets?ok=replied&view={ticket_id}", status_code=303)
        except Exception as exc:
            logger.warning("Ticket action failed", exc_info=True)
            if att and att[0]:
                path = resolve_ticket_attachment_path(att[0])
                if path:
                    try:
                        path.unlink(missing_ok=True)
                    except OSError:
                        pass
            return RedirectResponse(
                f"/tickets?err={quote(user_safe_error(exc))}&view={ticket_id}",
                status_code=303,
            )

    @app.post("/tickets/panel/{ticket_id}/status")
    async def tickets_panel_status(
        ticket_id: int,
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
        status: str = Form(...),
    ):
        if not can_access_panel_tickets(staff):
            return RedirectResponse("/tickets?err=" + quote("دسترسی ندارید"), status_code=303)
        try:
            await set_status(session, staff, ticket_id, status=status)
            return RedirectResponse(f"/tickets?ok=status&view={ticket_id}", status_code=303)
        except Exception as exc:
            logger.warning("Ticket action failed", exc_info=True)
            return RedirectResponse(
                f"/tickets?err={quote(user_safe_error(exc))}&view={ticket_id}",
                status_code=303,
            )

    @app.post("/tickets/bot/{ticket_id}/reply")
    async def tickets_bot_reply(
        ticket_id: int,
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
        body: str = Form(""),
    ):
        from app.services import tickets as bot_tickets

        if not staff_can_manage_bot_tickets(staff):
            return RedirectResponse("/tickets?err=" + quote("دسترسی ندارید"), status_code=303)
        text = (body or "").strip()
        if not text:
            return RedirectResponse(
                f"/tickets?err={quote('متن پاسخ خالی است')}&tg={ticket_id}",
                status_code=303,
            )
        ticket = await bot_tickets.get_ticket(session, int(ticket_id))
        if not ticket or not await _bot_ticket_in_scope(session, staff, ticket):
            return RedirectResponse("/tickets?err=" + quote("تیکت یافت نشد"), status_code=303)
        try:
            sender_tg = await _staff_sender_tg(session, staff)
            await bot_tickets.reply_ticket(
                session, ticket, text, sender_tg, is_staff=True
            )
        except Exception as exc:
            logger.warning("Ticket action failed", exc_info=True)
            return RedirectResponse(
                f"/tickets?err={quote(user_safe_error(exc))}&tg={ticket_id}",
                status_code=303,
            )
        try:
            await _notify_bot_ticket_staff_reply(
                session,
                ticket,
                text,
                actor_name=staff.get("username") or staff.get("role"),
            )
        except Exception:
            # Reply is persisted; Telegram delivery failure should not roll back UX.
            pass
        return RedirectResponse(
            f"/tickets?ok=tg_replied&tg={ticket_id}", status_code=303
        )

    @app.post("/tickets/bot/{ticket_id}/close")
    async def tickets_bot_close(
        ticket_id: int,
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ):
        from app.services import tickets as bot_tickets

        if not staff_can_manage_bot_tickets(staff):
            return RedirectResponse("/tickets?err=" + quote("دسترسی ندارید"), status_code=303)
        ticket = await bot_tickets.get_ticket(session, int(ticket_id))
        if not ticket or not await _bot_ticket_in_scope(session, staff, ticket):
            return RedirectResponse("/tickets?err=" + quote("تیکت یافت نشد"), status_code=303)
        try:
            await bot_tickets.close_ticket(session, ticket)
            return RedirectResponse(
                f"/tickets?ok=tg_closed&tg={ticket_id}", status_code=303
            )
        except Exception as exc:
            logger.warning("Ticket action failed", exc_info=True)
            return RedirectResponse(
                f"/tickets?err={quote(user_safe_error(exc))}&tg={ticket_id}",
                status_code=303,
            )


async def panel_ticket_dashboard_alert(
    session: AsyncSession,
    staff: dict,
    *,
    unread: int | None = None,
) -> dict | None:
    """Banner data for dashboards — links to list only (no auto-open modal).

    Pass ``unread`` from ``request.state.panel_tickets_unread`` to avoid a second COUNT.
    """
    if unread is None:
        n = await sidebar_unread_count(session, staff)
    else:
        n = int(unread or 0)
    if n <= 0:
        return None

    if is_platform_admin(staff):
        return {
            "title": f"{n} تیکت خوانده‌نشده" if n > 1 else "یک تیکت خوانده‌نشده",
            "detail": "نماینده یا ادمین فرعی پیام جدیدی فرستاده است.",
            "href": "/tickets",
        }

    if n == 1:
        title = "پاسخ جدید برای تیکت پشتیبانی"
        detail = "ادمین اصلی به تیکت شما پاسخ داده است."
    else:
        title = f"{n} تیکت پاسخ‌داده‌شده دارید"
        detail = "پاسخ‌های جدید در صفحه پشتیبانی منتظر مشاهده‌اند."
    return {"title": title, "detail": detail, "href": "/tickets"}
