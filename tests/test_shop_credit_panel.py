"""The Owner's credit card of a PAYG shop on the reseller edit screen: the JSON it reads and the forms it posts.

The card is the React panel's (``EditCredit.tsx``). Its data rides on the edit endpoint, so a shop's
statements and changes must never reach another shop's card, and only the Owner may read or post.
The edit endpoint also tells the Owner whether a panel password rotation is still pending.
"""

from __future__ import annotations

import unittest
from collections.abc import AsyncIterator
from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import AsyncMock, patch


import httpx
from fastapi import FastAPI, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.panel_resellers_api import register_panel_resellers_api
from app.api.pg_panel_access_pages import register_pg_panel_access_pages
from app.api.shop_credit_pages import register_shop_credit_pages
from app.db.models import (
    Base,
    BotUser,
    CreditEvent,
    CreditStatement,
    ResellerPlan,
    ResellerProfile,
    ShopCreditAccount,
)
from app.services.platform_identity import is_explicit_owner_staff
from app.services.shop_credit import CreditLimitChange, set_credit_limit
from tests.pgtest import pg_engine

NOW = datetime(2026, 11, 8, tzinfo=timezone.utc)
HOSTILE_NOTE = "<img src=x onerror=1>"
OWNER = {"role": "admin", "web_owner": True, "username": "owner", "org_principal_id": 1, "org_depth": 0,
         "org_parent_id": None, "org_status": "active"}
SHOP_STAFF = {"role": "reseller", "bot_user_id": 5, "permissions": ["dashboard"], "username": "shop"}
L1_STAFF = {"role": "principal", "org_depth": 1, "bot_user_id": 5, "permissions": [], "username": "l1"}


def statement(shop_id: int, amount: int, *, status: str = "issued") -> CreditStatement:
    return CreditStatement(shop_id=shop_id, period_start=NOW - timedelta(days=40), period_end=NOW - timedelta(days=10),
                           amount_due=amount, due_at=NOW + timedelta(days=5), status=status)


class CreditPanelCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.engine = pg_engine()
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False, class_=AsyncSession)
        async with self.Session() as session:
            session.add_all([
                BotUser(id=5, telegram_id=5, referral_code="a", role="reseller", wallet_balance=-15_000),
                BotUser(id=6, telegram_id=6, referral_code="b", role="reseller", wallet_balance=-9_000),
                BotUser(id=7, telegram_id=7, referral_code="c", role="reseller", wallet_balance=100),
                ResellerPlan(id=1, name="payg", billing_mode="payg", price_per_gb=1000, payg_basis="traffic"),
                ResellerPlan(id=2, name="fixed", billing_mode="fixed"),
                ResellerProfile(id=1, user_id=5, plan_id=1, billing_mode="payg", payg_wallet_linked=True),
                ResellerProfile(id=2, user_id=6, plan_id=1, billing_mode="payg", payg_wallet_linked=True),
                ResellerProfile(id=3, user_id=7, plan_id=2, billing_mode="fixed"),
                statement(5, 15_000),
                statement(6, 9_000),
            ])
            await session.commit()
            await set_credit_limit(session, 5, CreditLimitChange(limit=500_000, note=HOSTILE_NOTE), actor="owner")
            await set_credit_limit(session, 6, CreditLimitChange(limit=70_000, note="shop six only"), actor="owner")
        self.staff: dict[str, Any] = dict(OWNER)

        for target, replacement in (
            ("app.services.reseller_panel_edit.get_pg", lambda: AsyncMock(get_admin_roles=AsyncMock(return_value=[]))),
            ("app.services.reseller_panel_edit.build_reseller_pg_overview", AsyncMock(return_value={"ready": False})),
        ):
            patcher = patch(target, replacement)
            patcher.start()
            self.addCleanup(patcher.stop)

        app = FastAPI()

        async def get_db() -> AsyncIterator[AsyncSession]:
            async with self.Session() as session:
                yield session

        async def require_staff() -> dict[str, Any]:
            return self.staff

        async def require_admin() -> dict[str, Any]:
            if self.staff.get("role") != "admin" or not is_explicit_owner_staff(self.staff):
                raise HTTPException(status_code=403, detail="forbidden")
            return self.staff

        register_panel_resellers_api(
            app, require_staff=require_staff, require_admin=require_admin,
            require_perm=lambda _perm: require_staff, require_pg_perm=lambda _perm: require_staff, get_db=get_db,
        )
        register_shop_credit_pages(app, require_admin=require_admin, get_db=get_db)
        register_pg_panel_access_pages(app, require_admin=require_admin, get_db=get_db)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        await self.engine.dispose()

    async def credit_of(self, shop_id: int) -> dict[str, Any]:
        response = await self.client.get(f"/api/panel/resellers/{shop_id}/edit")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["credit"]

    async def statement_status(self, shop_id: int) -> str:
        async with self.Session() as session:
            return str(await session.scalar(select(CreditStatement.status).where(CreditStatement.shop_id == shop_id)))

    async def wallet(self, shop_id: int) -> int:
        async with self.Session() as session:
            return int((await session.get(BotUser, shop_id)).wallet_balance)

    async def statement_id(self, shop_id: int) -> int:
        async with self.Session() as session:
            return int(await session.scalar(select(CreditStatement.id).where(CreditStatement.shop_id == shop_id)))


class CreditOverviewTests(CreditPanelCase):
    async def test_the_edit_json_carries_the_credit_line_use_statements_and_changes(self) -> None:
        credit = await self.credit_of(5)
        self.assertEqual((credit["credit_limit"], credit["limit"], credit["used"], credit["available"], credit["percent"]),
                         (500_000, 500_000, 15_000, 485_000, 3))
        self.assertEqual((credit["status"], credit["frozen"], credit["temp_limit"]), ("active", False, None))
        [row] = credit["statements"]
        self.assertEqual((row["amount_due"], row["status"]), (15_000, "issued"))
        [event] = credit["events"]
        self.assertEqual((event["kind"], event["new_value"], event["actor"]), ("limit", "500000", "owner"))
        self.assertEqual(event["note"], HOSTILE_NOTE, "text is returned raw; the card renders it as text")

    async def test_a_shops_card_never_includes_another_shops_statements_or_changes(self) -> None:
        shop_a = await self.credit_of(5)
        shop_b = await self.credit_of(6)
        async with self.Session() as session:
            ids = {sid: int(shop) for sid, shop in (await session.execute(select(CreditStatement.id, CreditStatement.shop_id))).all()}
            events = {int(eid): int(shop) for eid, shop in (await session.execute(select(CreditEvent.id, CreditEvent.shop_id))).all()}
        self.assertEqual({ids[row["id"]] for row in shop_a["statements"]}, {5})
        self.assertEqual({ids[row["id"]] for row in shop_b["statements"]}, {6})
        self.assertEqual({events[row["id"]] for row in shop_a["events"]}, {5})
        self.assertEqual({events[row["id"]] for row in shop_b["events"]}, {6})
        self.assertNotIn("shop six only", str(shop_a))
        self.assertNotIn(HOSTILE_NOTE, str(shop_b))

    async def test_a_fixed_package_shop_has_no_credit_card(self) -> None:
        response = await self.client.get("/api/panel/resellers/7/edit")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["credit"])

    async def test_nobody_but_the_owner_reads_the_credit_card(self) -> None:
        for staff in (SHOP_STAFF, L1_STAFF, {"role": "pg_staff", "permissions": []}):
            with self.subTest(role=staff["role"]):
                self.staff = staff
                self.assertEqual((await self.client.get("/api/panel/resellers/5/edit")).status_code, 403)


class CreditFormTests(CreditPanelCase):
    async def test_saving_sets_the_limit_and_freezes_only_when_the_switch_was_on_the_form(self) -> None:
        response = await self.client.post("/resellers/5/credit", data={"credit_limit": "800000", "frozen_shown": "1", "frozen": "1"})
        self.assertEqual(response.status_code, 303)
        self.assertIn("ok=", response.headers["location"])
        credit = await self.credit_of(5)
        self.assertEqual((credit["credit_limit"], credit["frozen"], credit["limit"]), (800_000, True, 0))
        # The switch off is not posted; without the marker the status stays as it was.
        await self.client.post("/resellers/5/credit", data={"credit_limit": "800000"})
        self.assertTrue((await self.credit_of(5))["frozen"])
        await self.client.post("/resellers/5/credit", data={"credit_limit": "800000", "frozen_shown": "1"})
        self.assertFalse((await self.credit_of(5))["frozen"])

    async def test_a_temporary_limit_needs_its_duration(self) -> None:
        response = await self.client.post("/resellers/5/credit", data={"credit_limit": "1000", "temp_limit": "9000"})
        self.assertIn("err=", response.headers["location"])
        ok = await self.client.post("/resellers/5/credit", data={"credit_limit": "1000", "temp_limit": "9000", "temp_limit_days": "7"})
        self.assertIn("ok=", ok.headers["location"])
        credit = await self.credit_of(5)
        self.assertEqual((credit["credit_limit"], credit["temp_limit"]), (1000, 9000))
        self.assertTrue(credit["temp_limit_until"])

    async def test_hostile_numbers_are_refused_and_change_nothing(self) -> None:
        for bad in ("abc", "-5", "99999999999"):
            with self.subTest(limit=bad):
                response = await self.client.post("/resellers/5/credit", data={"credit_limit": bad})
                self.assertIn("err=", response.headers["location"])
        self.assertEqual((await self.credit_of(5))["credit_limit"], 500_000)

    async def test_a_fixed_package_shop_cannot_get_a_credit_line(self) -> None:
        response = await self.client.post("/resellers/7/credit", data={"credit_limit": "1000"})
        self.assertIn("err=", response.headers["location"])
        async with self.Session() as session:
            self.assertIsNone(await session.scalar(select(ShopCreditAccount).where(ShopCreditAccount.shop_id == 7)))

    async def test_only_the_owner_may_post_either_form(self) -> None:
        statement_id = await self.statement_id(5)
        for staff in (SHOP_STAFF, L1_STAFF):
            self.staff = staff
            for path in ("/resellers/5/credit", f"/resellers/5/credit/statements/{statement_id}/writeoff"):
                with self.subTest(role=staff["role"], path=path):
                    self.assertEqual((await self.client.post(path, data={"credit_limit": "1"})).status_code, 403)
        self.assertEqual(await self.statement_status(5), "issued")
        self.assertEqual(await self.wallet(5), -15_000)


class WriteOffTests(CreditPanelCase):
    async def test_a_write_off_credits_the_debt_back_once(self) -> None:
        statement_id = await self.statement_id(5)
        first = await self.client.post(f"/resellers/5/credit/statements/{statement_id}/writeoff")
        second = await self.client.post(f"/resellers/5/credit/statements/{statement_id}/writeoff")
        self.assertIn("ok=", first.headers["location"])
        self.assertIn("err=", second.headers["location"])
        self.assertEqual(await self.wallet(5), 0)
        self.assertEqual(await self.statement_status(5), "written_off")
        self.assertEqual(await self.wallet(6), -9_000)

    async def test_another_shops_statement_cannot_be_written_off_through_this_shop(self) -> None:
        shop_a_statement = await self.statement_id(5)
        response = await self.client.post(f"/resellers/6/credit/statements/{shop_a_statement}/writeoff")
        self.assertIn("err=", response.headers["location"])
        self.assertEqual(await self.statement_status(5), "issued")
        self.assertEqual((await self.wallet(5), await self.wallet(6)), (-15_000, -9_000))

    async def test_a_statement_that_is_not_open_is_not_written_off(self) -> None:
        async with self.Session() as session:
            row = await session.scalar(select(CreditStatement).where(CreditStatement.shop_id == 6))
            row.status = "paid"
            await session.commit()
            statement_id = int(row.id)
        response = await self.client.post(f"/resellers/6/credit/statements/{statement_id}/writeoff")
        self.assertIn("err=", response.headers["location"])
        self.assertEqual(await self.wallet(6), -9_000)


class RotationFlagTests(CreditPanelCase):
    PENDING_SECRET = "ENCRYPTED-NEW-PANEL-PASSWORD"

    async def set_pending(self, shop_id: int) -> None:
        async with self.Session() as session:
            profile = await session.scalar(select(ResellerProfile).where(ResellerProfile.user_id == shop_id))
            profile.pg_password_rotation_enc = self.PENDING_SECRET
            await session.commit()

    async def test_the_owner_sees_a_pending_rotation_as_a_flag_without_the_password(self) -> None:
        await self.set_pending(5)
        pending = await self.client.get("/api/panel/resellers/5/edit")
        other = await self.client.get("/api/panel/resellers/6/edit")
        self.assertTrue(pending.json()["profile"]["pg_password_rotation_pending"])
        self.assertFalse(other.json()["profile"]["pg_password_rotation_pending"])
        self.assertNotIn(self.PENDING_SECRET, pending.text)

    async def test_nobody_but_the_owner_sees_the_flag_or_retries_the_rotation(self) -> None:
        await self.set_pending(5)
        for staff in (SHOP_STAFF, L1_STAFF, {"role": "pg_staff", "permissions": []}):
            self.staff = staff
            with self.subTest(role=staff["role"]):
                read = await self.client.get("/api/panel/resellers/5/edit")
                self.assertEqual(read.status_code, 403)
                self.assertNotIn("pg_password_rotation_pending", read.text)
                self.assertEqual((await self.client.post("/resellers/5/pg-password-rotation")).status_code, 403)


if __name__ == "__main__":
    unittest.main()
