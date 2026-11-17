"""Owner-only «مالی» › «نمایندگان PAYG» report and its CSV export.

The page is the React panel's (``frontend/src/panel/pages/billing/PaygReportPage.tsx``); it reads
``/api/panel/finance/payg`` and links the CSV download below.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.spa_pages import spa_response
from app.services.billing_reports import ShopFinanceRow, rows_csv, shop_finance_rows

PAGE = "/finance/payg"
API_PATH = "/api/panel/finance/payg"


def _month_start() -> datetime:
    return datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def report_row(row: ShopFinanceRow) -> dict[str, Any]:
    return {
        "shop_id": int(row.shop_id),
        "label": row.label,
        "balance": int(row.balance),
        "credit_limit": int(row.credit_limit),
        "credit_status": row.credit_status,
        "month_charges": int(row.month_charges),
        "open_debt": int(row.open_debt),
        "month_cashback": int(row.month_cashback),
        "debt": int(row.debt),
    }


def register_billing_report_pages(app: FastAPI, *, require_admin: Callable, get_db: Callable) -> None:
    @app.get(PAGE)
    async def payg_report(staff: dict = Depends(require_admin)) -> Response:
        return spa_response("finance/payg")

    @app.get(API_PATH)
    async def payg_report_data(
        staff: dict = Depends(require_admin), session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        rows = await shop_finance_rows(session, month_start=_month_start())
        return JSONResponse(
            {
                "rows": [report_row(row) for row in rows],
                "totals": {
                    "debt": sum(row.debt for row in rows),
                    "month_charges": sum(row.month_charges for row in rows),
                    "month_cashback": sum(row.month_cashback for row in rows),
                },
            },
            headers={"Cache-Control": "no-store"},
        )

    @app.get(f"{PAGE}.csv")
    async def payg_report_csv(staff: dict = Depends(require_admin), session: AsyncSession = Depends(get_db)) -> Response:
        rows = await shop_finance_rows(session, month_start=_month_start())
        return Response(
            content="﻿" + rows_csv(rows), media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="payg-shops.csv"', "Cache-Control": "no-store"},
        )
