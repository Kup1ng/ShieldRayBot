"""Credit line of one PAYG shop for the owner's reseller edit screen.

Everything is read through ``shop_credit.credit_overview`` for exactly one shop id, so the
statements and changes of another shop can never appear on this shop's card.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import CreditEvent, CreditStatement
from app.services.shop_credit import CreditOverview, CreditStatus, credit_overview

DATE_FORMAT = "%Y-%m-%d"


def _day(value: datetime | None) -> str:
    return value.strftime(DATE_FORMAT) if value else ""


def _statement(statement: CreditStatement) -> dict[str, Any]:
    return {
        "id": int(statement.id),
        "period": statement.period_start.strftime("%Y-%m") if statement.period_start else "",
        "amount_due": int(statement.amount_due or 0),
        "due_at": _day(statement.due_at),
        "status": str(statement.status),
    }


def _event(event: CreditEvent) -> dict[str, Any]:
    return {
        "id": int(event.id),
        "kind": event.kind,
        "old_value": event.old_value or "",
        "new_value": event.new_value or "",
        "note": event.note or "",
        "actor": event.actor or "",
        "created_at": _day(event.created_at),
    }


def credit_block(overview: CreditOverview) -> dict[str, Any]:
    account = overview.account
    return {
        "status": overview.status,
        "frozen": overview.status == str(CreditStatus.FROZEN),
        "limit": overview.usage.limit,
        "used": overview.usage.used,
        "available": overview.usage.available,
        "percent": overview.usage.percent,
        "credit_limit": int(account.credit_limit or 0) if account else 0,
        "temp_limit": account.temp_limit if account else None,
        "temp_limit_until": _day(account.temp_limit_until) if account else "",
        "statements": [_statement(statement) for statement in overview.statements],
        "events": [_event(event) for event in overview.events],
    }


async def credit_payload(session: AsyncSession, shop_id: int, *, balance: int) -> dict[str, Any]:
    return credit_block(await credit_overview(session, int(shop_id), balance=int(balance)))
