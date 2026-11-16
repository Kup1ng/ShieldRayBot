"""JSON endpoints of the React marketing pages: loyalty club, campaigns, funnel, broadcast."""

from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch


import httpx
from fastapi import FastAPI, HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.api.panel_marketing_api import register_panel_marketing_api
from app.db.models import (
    Base,
    BotUser,
    BroadcastLog,
    CampaignRecipient,
    LoyaltyReward,
    LuckyWheelPrize,
    PointsTransaction,
    TargetedCampaign,
)
from app.services.authz import authz_from_staff, can_shop
from app.services.platform_identity import is_explicit_owner_staff
from app.services.users import _SETTINGS_CACHE, reset_shop_reseller_id, set_shop_reseller_id
from tests.pgtest import pg_engine

OWNER = {"role": "admin", "permissions": [], "org_principal_id": 1, "org_depth": 0, "org_parent_id": None, "org_status": "active"}
LEGACY_ADMIN = {"role": "admin", "permissions": []}


def _reseller(permissions: list[str], shop_id: int | None = 2) -> dict:
    return {"role": "reseller", "permissions": permissions, "bot_user_id": shop_id}


class MarketingApiCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.engine = pg_engine()
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)
        self.session = self.Session()
        self.token = set_shop_reseller_id(None)
        _SETTINGS_CACHE.clear()
        self.now = datetime.now(timezone.utc)
        self.session.add_all(
            [
                BotUser(id=2, telegram_id=1002, referral_code="shop2", role="reseller", full_name="Shop Two"),
                BotUser(id=3, telegram_id=1003, referral_code="shop3", role="reseller", full_name="Shop Three"),
                BotUser(id=10, telegram_id=2010, referral_code="c10", reseller_id=2, username="alice", created_at=self.now - timedelta(days=90)),
                BotUser(id=11, telegram_id=2011, referral_code="c11", reseller_id=3, username="bob", created_at=self.now - timedelta(days=90)),
                BotUser(id=12, telegram_id=2012, referral_code="c12", username="carol", created_at=self.now - timedelta(days=90)),
            ]
        )
        await self.session.commit()
        self.staff: dict = {}

        async def get_db():
            yield self.session

        async def require_staff():
            return self.staff

        async def require_admin():
            if self.staff.get("role") != "admin" or not is_explicit_owner_staff(self.staff):
                raise HTTPException(403)
            return self.staff

        def require_perm(perm: str):
            async def dep():
                if not can_shop(authz_from_staff(self.staff), perm):
                    raise HTTPException(403)
                return self.staff

            return dep

        app = FastAPI()
        register_panel_marketing_api(
            app,
            require_staff=require_staff,
            require_admin=require_admin,
            require_perm=require_perm,
            require_pg_perm=require_perm,
            get_db=get_db,
        )
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        await self.session.close()
        reset_shop_reseller_id(self.token)
        await self.engine.dispose()
        _SETTINGS_CACHE.clear()
        self.tmp.cleanup()

    async def get(self, staff: dict, url: str) -> httpx.Response:
        self.staff.clear()
        self.staff.update(staff)
        return await self.client.get(url)


class LoyaltyEndpointTests(MarketingApiCase):
    async def test_staff_without_the_loyalty_permission_or_a_shop_are_refused(self) -> None:
        for staff in (_reseller(["campaigns"]), _reseller(["loyalty"], shop_id=None), LEGACY_ADMIN, {"role": "pg_staff", "permissions": ["loyalty"]}):
            for suffix in ("", "/transactions", "/settings"):
                with self.subTest(staff=staff, suffix=suffix):
                    response = await self.get(staff, f"/api/panel/marketing/loyalty{suffix}")
                    self.assertEqual(response.status_code, 403)

    async def test_overview_has_the_club_summary_and_only_the_tabs_the_staff_can_open(self) -> None:
        response = await self.get(OWNER, "/api/panel/marketing/loyalty")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "no-store")
        body = response.json()
        self.assertEqual(
            set(body["metrics"]),
            {"total_referrals", "qualified_referrals", "points_issued", "points_redeemed", "wallet_credits_issued", "active_rewards", "top_referrers"},
        )
        self.assertEqual(body["club"], {"enabled": True, "wallet_rate": "100"})
        self.assertEqual(set(body["wheel"]), {"wheel_enabled", "active_prizes", "total_spins", "spin_cost"})
        self.assertIn("club", [section["key"] for section in body["sections"]])
        shop_body = (await self.get(_reseller(["loyalty"]), "/api/panel/marketing/loyalty")).json()
        self.assertEqual([section["key"] for section in shop_body["sections"]], ["club", "club_transactions"])

    async def test_manual_adjust_forms_are_offered_to_the_right_staff_only(self) -> None:
        owner = (await self.get(OWNER, "/api/panel/marketing/loyalty")).json()["adjust"]
        self.assertTrue(owner["platform"]["allowed"])
        self.assertTrue(owner["platform"]["nonce"])
        self.assertFalse(owner["shop"]["allowed"])
        shop = (await self.get(_reseller(["loyalty", "loyalty_adjust"]), "/api/panel/marketing/loyalty")).json()["adjust"]
        self.assertFalse(shop["platform"]["allowed"])
        self.assertEqual(shop["platform"]["nonce"], "")
        self.assertTrue(shop["shop"]["allowed"])
        self.assertEqual(len(shop["shop"]["nonce"]), 32)
        self.assertGreater(shop["shop"]["max_points"], 0)
        plain = (await self.get(_reseller(["loyalty"]), "/api/panel/marketing/loyalty")).json()["adjust"]
        self.assertFalse(plain["shop"]["allowed"])
        self.assertEqual(plain["shop"]["nonce"], "")

    async def test_ledger_shows_only_the_shops_own_entries_with_labels_not_user_ids(self) -> None:
        self.session.add_all(
            [
                PointsTransaction(user_id=10, amount=40, balance_after=40, tx_type="earn", source="x", description="shop two", idempotency_key="k1", reseller_id=2),
                PointsTransaction(user_id=11, amount=7, balance_after=7, tx_type="earn", source="x", description="shop three", idempotency_key="k2", reseller_id=3),
                PointsTransaction(user_id=12, amount=5, balance_after=5, tx_type="earn", source="x", description="platform", idempotency_key="k3", reseller_id=None),
            ]
        )
        await self.session.commit()
        shop = (await self.get(_reseller(["loyalty"]), "/api/panel/marketing/loyalty/transactions")).json()["transactions"]
        self.assertEqual([row["description"] for row in shop], ["shop two"])
        self.assertEqual(shop[0]["user_label"], "@alice")
        self.assertNotIn("user_id", shop[0])
        platform = (await self.get(OWNER, "/api/panel/marketing/loyalty/transactions")).json()["transactions"]
        self.assertEqual([row["description"] for row in platform], ["platform"])

    async def test_ledger_is_bounded(self) -> None:
        self.session.add_all(
            PointsTransaction(user_id=10, amount=1, balance_after=i, tx_type="earn", source="x", description="n", idempotency_key=f"bulk{i}", reseller_id=2)
            for i in range(60)
        )
        await self.session.commit()
        rows = (await self.get(_reseller(["loyalty"]), "/api/panel/marketing/loyalty/transactions")).json()["transactions"]
        self.assertEqual(len(rows), 50)
        self.assertEqual(rows[0]["id"], max(row["id"] for row in rows))

    async def test_settings_list_the_shops_rules_and_rewards_but_never_an_archived_or_foreign_one(self) -> None:
        await self.get(_reseller(["loyalty"], shop_id=3), "/api/panel/marketing/loyalty/settings")
        self.session.add_all(
            [
                LoyaltyReward(name="mine", reward_type="wallet_credit", reward_value=1000, points_cost=10, reseller_id=2, sort_order=1),
                LoyaltyReward(name="gone", reward_type="wallet_credit", reward_value=1000, points_cost=10, reseller_id=2, archived=True),
                LoyaltyReward(name="theirs", reward_type="wallet_credit", reward_value=1000, points_cost=10, reseller_id=3),
            ]
        )
        await self.session.commit()
        body = (await self.get(_reseller(["loyalty"]), "/api/panel/marketing/loyalty/settings")).json()
        names = [reward["name"] for reward in body["rewards"]]
        self.assertIn("mine", names)
        self.assertNotIn("gone", names)
        self.assertNotIn("theirs", names)
        self.assertTrue(body["rules"])
        self.assertTrue(all("event_label" in rule for rule in body["rules"]))
        self.assertFalse(body["is_platform_admin"])
        self.assertTrue(body["tiers"])

    async def test_wheel_lists_only_the_shops_live_sections(self) -> None:
        self.session.add_all(
            [
                LuckyWheelPrize(reseller_id=2, label="ten", prize_type="points", prize_value=10, weight=5),
                LuckyWheelPrize(reseller_id=2, label="old", prize_type="points", prize_value=10, archived=True),
                LuckyWheelPrize(reseller_id=3, label="other shop", prize_type="points", prize_value=10),
            ]
        )
        await self.session.commit()
        wheel = (await self.get(_reseller(["loyalty"]), "/api/panel/marketing/loyalty/settings")).json()["wheel"]
        self.assertEqual([prize["label"] for prize in wheel["prizes"]], ["ten"])
        self.assertFalse(wheel["degraded"])
        self.assertEqual(wheel["submenu_hidden"], [])
        self.assertIn("points", [option["value"] for option in wheel["prize_types"]])

    async def test_a_broken_wheel_reads_as_switched_off_and_marked_not_as_an_error(self) -> None:
        with patch("app.services.loyalty_panel.get_wheel_settings", AsyncMock(side_effect=RuntimeError("no table"))):
            response = await self.get(OWNER, "/api/panel/marketing/loyalty/settings")
        self.assertEqual(response.status_code, 200)
        wheel = response.json()["wheel"]
        self.assertTrue(wheel["degraded"])
        self.assertFalse(wheel["enabled"])
        self.assertEqual(wheel["prizes"], [])

    async def test_referral_text_is_editable_only_where_the_old_page_allowed_it(self) -> None:
        owner = (await self.get(OWNER, "/api/panel/marketing/loyalty/settings")).json()["referral"]
        self.assertTrue(owner["action"].startswith("/settings?tab=loyalty&next="))
        self.assertEqual([field["name"] for field in owner["fields"]], ["s_referral_text"])
        shop = (await self.get(_reseller(["loyalty", "shop_settings"]), "/api/panel/marketing/loyalty/settings")).json()["referral"]
        self.assertTrue(shop["action"].startswith("/shop-settings?tab=loyalty&next="))
        self.assertIsNone((await self.get(_reseller(["loyalty"]), "/api/panel/marketing/loyalty/settings")).json()["referral"])

    async def test_no_secret_shaped_field_is_ever_returned(self) -> None:
        text = (await self.get(OWNER, "/api/panel/marketing/loyalty/settings")).text.lower()
        for word in ("token", "password", "api_key", "secret"):
            self.assertNotIn(word, text)


class CampaignEndpointTests(MarketingApiCase):
    async def test_staff_without_the_campaigns_permission_or_shop_are_refused(self) -> None:
        for staff in (_reseller(["loyalty"]), _reseller(["campaigns"], shop_id=None), LEGACY_ADMIN):
            with self.subTest(staff=staff):
                self.assertEqual((await self.get(staff, "/api/panel/marketing/campaigns")).status_code, 403)

    async def test_bad_audience_or_day_range_is_a_400_not_a_crash(self) -> None:
        shop = _reseller(["campaigns"])
        for query in ("audience=nope", "days=0", "days=999", "days=abc"):
            with self.subTest(query=query):
                self.assertEqual((await self.get(shop, f"/api/panel/marketing/campaigns?{query}")).status_code, 400)

    async def test_preview_names_the_audiences_and_the_recipient_cap(self) -> None:
        body = (await self.get(_reseller(["campaigns"]), "/api/panel/marketing/campaigns?audience=all&days=30")).json()
        self.assertEqual(body["audience"], "all")
        self.assertEqual(body["days"], 30)
        self.assertEqual(body["count"], 1)
        self.assertEqual(body["limit"], 5000)
        self.assertEqual({"trial", "expiring", "inactive", "active", "all"}, {option["value"] for option in body["audiences"]})
        self.assertEqual([section["key"] for section in body["sections"]], ["campaigns"])

    async def test_a_shop_sees_only_its_own_campaigns_with_progress_and_titles(self) -> None:
        mine = TargetedCampaign(reseller_id=2, audience="catalog_discount", days=7, text="<b>hello</b>", status="running", created_by="x")
        theirs = TargetedCampaign(reseller_id=3, audience="all", days=7, text="secret plan", status="draft", created_by="y")
        platform = TargetedCampaign(reseller_id=None, audience="selected", days=7, text="platform", status="paused", created_by="z")
        self.session.add_all([mine, theirs, platform])
        await self.session.flush()
        self.session.add_all(
            [
                CampaignRecipient(campaign_id=mine.id, user_id=10, status="sent"),
                CampaignRecipient(campaign_id=mine.id, user_id=11, status="review"),
                CampaignRecipient(campaign_id=theirs.id, user_id=11, status="failed"),
            ]
        )
        await self.session.commit()
        shop = (await self.get(_reseller(["campaigns"]), "/api/panel/marketing/campaigns")).json()["campaigns"]
        self.assertEqual([row["id"] for row in shop], [mine.id])
        row = shop[0]
        self.assertEqual(row["audience_title"], "اطلاع‌رسانی تغییر قیمت")
        self.assertEqual(row["status_label"], "در حال ارسال")
        self.assertEqual(row["text"], "<b>hello</b>")
        self.assertEqual({item["status"]: item["count"] for item in row["progress"]}, {"sent": 1, "review": 1})
        self.assertTrue(row["has_review"])
        self.assertTrue(row["can_control"])
        owner = (await self.get(OWNER, "/api/panel/marketing/campaigns")).json()["campaigns"]
        self.assertEqual([item["id"] for item in owner], [platform.id])
        self.assertEqual(owner[0]["audience_title"], "پیام به کاربران تست")

    async def test_a_finished_campaign_offers_no_start_or_pause(self) -> None:
        self.session.add(TargetedCampaign(reseller_id=2, audience="all", days=7, text="done", status="completed", created_by="x"))
        await self.session.commit()
        rows = (await self.get(_reseller(["campaigns"]), "/api/panel/marketing/campaigns")).json()["campaigns"]
        self.assertFalse(rows[0]["can_control"])

    async def test_the_list_is_bounded(self) -> None:
        self.session.add_all(
            TargetedCampaign(reseller_id=2, audience="all", days=7, text=f"t{i}", status="completed", created_by="x") for i in range(60)
        )
        await self.session.commit()
        rows = (await self.get(_reseller(["campaigns"]), "/api/panel/marketing/campaigns")).json()["campaigns"]
        self.assertEqual(len(rows), 50)


class FunnelEndpointTests(MarketingApiCase):
    async def get_with(self, staff: dict, summary: AsyncMock, url: str = "/api/panel/marketing/funnel") -> httpx.Response:
        with patch("app.services.marketing_panel.funnel_summary", summary):
            return await self.get(staff, url)

    async def test_owner_reads_the_platform_funnel_and_shop_staff_only_their_shop(self) -> None:
        summary = AsyncMock(return_value={"shop_open": 12, "delivered": 3})
        body = (await self.get_with(OWNER, summary)).json()
        self.assertIsNone(summary.await_args.kwargs["reseller_id"])
        self.assertEqual(body["counts"], {"shop_open": 12, "plan_view": 0, "pay_start": 0, "receipt": 0, "delivered": 3})
        self.assertEqual(body["days"], 7)
        summary = AsyncMock(return_value={})
        await self.get_with(_reseller(["payments"], shop_id=2), summary, "/api/panel/marketing/funnel?reseller_id=3&shop_id=3")
        self.assertEqual(summary.await_args.kwargs["reseller_id"], 2)

    async def test_staff_without_access_read_nothing(self) -> None:
        for staff in (_reseller(["tickets"]), _reseller(["orders"], shop_id=None), LEGACY_ADMIN, {"role": "pg_staff", "permissions": ["orders"]}):
            with self.subTest(staff=staff):
                summary = AsyncMock(return_value={})
                self.assertEqual((await self.get_with(staff, summary)).status_code, 403)
                summary.assert_not_awaited()

    async def test_a_failing_read_shows_zeros_not_an_error(self) -> None:
        response = await self.get_with(OWNER, AsyncMock(side_effect=RuntimeError("db")))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.json()["counts"].values()), {0})

    async def test_an_empty_summary_still_has_every_step(self) -> None:
        response = await self.get_with(OWNER, AsyncMock(return_value=None))
        self.assertEqual(list(response.json()["counts"]), ["shop_open", "plan_view", "pay_start", "receipt", "delivered"])


class BroadcastEndpointTests(MarketingApiCase):
    async def test_only_the_owner_can_read_the_history(self) -> None:
        for staff in (_reseller(["loyalty", "campaigns", "broadcast"]), LEGACY_ADMIN, {"role": "pg_staff", "permissions": []}):
            with self.subTest(staff=staff):
                self.assertEqual((await self.get(staff, "/api/panel/marketing/broadcast")).status_code, 403)
        self.assertEqual((await self.get(OWNER, "/api/panel/marketing/broadcast")).status_code, 200)

    async def test_an_active_send_can_only_be_stopped_and_a_finished_one_only_deleted(self) -> None:
        for status in ("running", "done", "queued", "cancelled"):
            self.session.add(BroadcastLog(audience="all", text="hello", total=10, ok_count=3, fail_count=1, review_count=2, created_by="owner", status=status))
        await self.session.commit()
        rows = (await self.get(OWNER, "/api/panel/marketing/broadcast")).json()["history"]
        by_status = {row["status"]: row for row in rows}
        self.assertTrue(by_status["running"]["is_active"])
        self.assertTrue(by_status["queued"]["is_active"])
        self.assertFalse(by_status["done"]["is_active"])
        self.assertFalse(by_status["cancelled"]["is_active"])
        self.assertEqual(by_status["running"]["review_count"], 2)
        self.assertEqual(by_status["done"]["audience_label"], "همه")

    async def test_the_text_is_cut_to_the_snippet_the_table_shows(self) -> None:
        self.session.add(BroadcastLog(audience="users", text="x" * 500, total=1, created_by="owner", status="done"))
        await self.session.commit()
        row = (await self.get(OWNER, "/api/panel/marketing/broadcast")).json()["history"][0]
        self.assertEqual(len(row["text_snippet"]), 120)
        self.assertTrue(row["text_truncated"])

    async def test_hostile_text_is_returned_as_plain_data(self) -> None:
        self.session.add(BroadcastLog(audience="all", text="<script>alert(1)</script>", total=1, created_by="owner", status="done"))
        await self.session.commit()
        response = await self.get(OWNER, "/api/panel/marketing/broadcast")
        self.assertTrue(response.headers["content-type"].startswith("application/json"))
        self.assertEqual(response.json()["history"][0]["text_snippet"], "<script>alert(1)</script>")

    async def test_the_history_is_bounded_to_the_newest_forty(self) -> None:
        self.session.add_all(BroadcastLog(audience="all", text=f"m{i}", total=1, created_by="owner", status="done") for i in range(55))
        await self.session.commit()
        rows = (await self.get(OWNER, "/api/panel/marketing/broadcast")).json()["history"]
        self.assertEqual(len(rows), 40)
        self.assertEqual(rows[0]["text_snippet"], "m54")


if __name__ == "__main__":
    unittest.main()
