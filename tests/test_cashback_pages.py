"""Cashback management: permission, form validation, shop isolation, navigation and the panel data."""

from __future__ import annotations

import unittest
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit


import httpx
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.cashback_pages import API_PATH, _percent_text, register_cashback_pages, rule_from_form, settings_from_form
from app.db.models import Base, BotUser, CashbackBudget, CashbackRule
from app.services.cashback_rules import (
    cashback_scope,
    create_rule,
    delete_rule,
    list_rules,
    load_settings,
    save_settings,
    set_rule_enabled,
    update_rule,
)
from app.services.marketing_nav import marketing_groups, marketing_sections
from tests.pgtest import pg_engine

OWNER = {"role": "admin", "org_principal_id": 1, "org_depth": 0, "org_status": "active"}
SHOP = {"role": "reseller", "bot_user_id": 5, "permissions": ["cashback"]}
VALID = {"name": "۱۰٪", "mode": "percent", "percent": "10", "event_new": "1", "allow_with_discount": "1"}
KEY = "0123456789abcdef0123456789abcdef"


class FormTests(unittest.TestCase):
    def test_valid_rule(self) -> None:
        data = rule_from_form({**VALID, "percent": "2.5", "max_per_order": "50000", "event_renew": "1"})
        self.assertEqual((data.percent_bps, data.max_per_order, data.events), (250, 50000, "new,renew"))
        fixed = rule_from_form({**VALID, "mode": "fixed", "fixed_amount": "7000"})
        self.assertEqual((fixed.mode, fixed.fixed_amount, fixed.percent_bps), ("fixed", 7000, 0))

    def test_hostile_rules_are_refused(self) -> None:
        for extra in ({"name": ""}, {"percent": "150"}, {"percent": "-1"}, {"percent": "abc"},
                      {"event_new": ""}, {"percent": "0"}, {"max_per_order": "-5"},
                      {"customer_max_count": "99999999"}):
            with self.subTest(extra=extra), self.assertRaises(ValueError):
                rule_from_form({**VALID, **extra})

    def test_settings(self) -> None:
        s = settings_from_form({"enabled": "1", "combine": "sum", "hold_hours": "48", "monthly_budget": "1000"})
        self.assertEqual((s.enabled, s.combine, s.hold_hours, s.monthly_budget), (True, "sum", 48, 1000))
        self.assertEqual(settings_from_form({"combine": "evil"}).combine, "best")
        with self.assertRaises(ValueError):
            settings_from_form({"hold_hours": "999999"})


class ScopeTests(unittest.TestCase):
    def test_who_may_manage_cashback(self) -> None:
        reseller = {"role": "reseller", "bot_user_id": 5, "permissions": ["cashback"]}
        with patch("app.services.cashback_rules.shop_owner_id", return_value=5):
            self.assertEqual(cashback_scope(reseller), 5)
            with self.assertRaises(PermissionError):
                cashback_scope({**reseller, "permissions": ["gift_codes"]})
        with patch("app.services.cashback_rules.shop_owner_id", return_value=None), self.assertRaises(PermissionError):
            cashback_scope(reseller)

    def test_marketing_strip_offers_cashback_only_when_allowed(self) -> None:
        with patch("app.services.marketing_nav.cashback_scope", return_value=5):
            sections = marketing_sections({"role": "reseller", "permissions": []})
        self.assertIn("/cashback", [s.href for s in sections])
        offers = [g for g in marketing_groups(sections) if g.key == "offers"]
        self.assertEqual([s.key for s in offers[0].sections][-1], "cashback")
        with patch("app.services.marketing_nav.cashback_scope", side_effect=PermissionError):
            denied = marketing_sections({"role": "reseller", "permissions": []})
        self.assertNotIn("/cashback", [s.href for s in denied])


class IsolationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.engine = pg_engine()
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.Session() as session:
            session.add_all([BotUser(id=5, telegram_id=5, referral_code="a"), BotUser(id=6, telegram_id=6, referral_code="b")])
            await session.commit()

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()

    async def test_a_shop_never_reaches_another_shops_rules_or_settings(self) -> None:
        async with self.Session() as session:
            rule = await create_rule(session, 5, rule_from_form(VALID), request_key=KEY)
            for action in (lambda: set_rule_enabled(session, 6, rule.id, False), lambda: delete_rule(session, 6, rule.id),
                           lambda: update_rule(session, 6, rule.id, rule_from_form(VALID)),
                           lambda: create_rule(session, 6, rule_from_form(VALID), request_key=KEY)):
                with self.assertRaises(ValueError):
                    await action()
            self.assertEqual([r.id for r in await list_rules(session, 5)], [rule.id])
            self.assertEqual(await list_rules(session, 6), [])
            self.assertEqual(await list_rules(session, None), [])
            await save_settings(session, 5, settings_from_form({"enabled": "1", "hold_hours": "1"}))
            self.assertTrue((await load_settings(session, 5)).enabled)
            self.assertFalse((await load_settings(session, 6)).enabled)
            stored = await session.get(CashbackRule, rule.id)
            self.assertTrue(stored.enabled)

    async def test_an_edit_changes_the_same_rule_in_place(self) -> None:
        async with self.Session() as session:
            rule = await create_rule(session, 5, rule_from_form(VALID), request_key=KEY)
            await update_rule(session, 5, rule.id, rule_from_form({**VALID, "name": "۵٪", "percent": "5"}))
            rules = await list_rules(session, 5)
        self.assertEqual([(r.id, r.name, r.percent_bps) for r in rules], [(rule.id, "۵٪", 500)])

    async def test_the_same_request_key_returns_the_rule_it_already_made(self) -> None:
        async with self.Session() as session:
            first = await create_rule(session, 5, rule_from_form(VALID), request_key=KEY)
            again = await create_rule(session, 5, rule_from_form({**VALID, "name": "دوباره"}), request_key=KEY)
            rules = await list_rules(session, 5)
        self.assertEqual(again.id, first.id)
        self.assertEqual([(r.id, r.name) for r in rules], [(first.id, "۱۰٪")])

    async def test_a_create_without_a_valid_request_key_is_refused(self) -> None:
        async with self.Session() as session:
            for key in (None, "", "short", KEY.upper(), KEY + "0", 12345, True):
                with self.subTest(key=key), self.assertRaises(ValueError):
                    await create_rule(session, 5, rule_from_form(VALID), request_key=key)
            self.assertEqual(await list_rules(session, 5), [])


class PanelRouteTests(unittest.IsolatedAsyncioTestCase):
    """The JSON the React page reads and the form handlers it posts, over HTTP."""

    async def asyncSetUp(self) -> None:
        self.engine = pg_engine()
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.Session() as session:
            session.add_all([
                BotUser(id=5, telegram_id=5, referral_code="a", role="reseller"),
                BotUser(id=6, telegram_id=6, referral_code="b", role="reseller"),
            ])
            await session.commit()
        self.staff: dict = SHOP

        async def staff() -> dict:
            return self.staff

        async def get_db() -> AsyncIterator[AsyncSession]:
            async with self.Session() as session:
                yield session

        self.app = FastAPI()
        register_cashback_pages(self.app, require_staff=staff, get_db=get_db)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="https://example.test")

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        await self.engine.dispose()

    async def rules_of(self, shop_staff: dict) -> list[dict]:
        self.staff = shop_staff
        return (await self.client.get(API_PATH)).json()["rules"]

    async def fresh_key(self) -> str:
        return (await self.client.get(API_PATH)).json()["request_key"]

    async def create_rule(self, **changes: str) -> int:
        response = await self.client.post("/cashback/rules", data={**VALID, "request_key": await self.fresh_key(), **changes})
        self.assertIn("ok", parse_qs(urlsplit(response.headers["location"]).query))
        return (await self.rules_of(self.staff))[-1]["id"]

    async def test_missing_permission_and_unscoped_staff_cannot_open_or_mutate(self) -> None:
        for profile in [{}, {"role": "reseller", "bot_user_id": 5, "permissions": ["gift_codes"]},
                        {"role": "reseller", "permissions": ["cashback"]},
                        {"role": "pg_staff", "permissions": ["cashback"]}]:
            self.staff = profile
            with self.subTest(profile=profile):
                self.assertEqual((await self.client.get("/cashback")).status_code, 403)
                self.assertEqual((await self.client.get(API_PATH)).status_code, 403)
                for path in ("/cashback/settings", "/cashback/rules", "/cashback/rules/1",
                             "/cashback/rules/1/toggle", "/cashback/rules/1/delete"):
                    self.assertEqual((await self.client.post(path, data=VALID)).status_code, 403, path)

    async def test_the_page_is_the_panel_shell_and_the_data_is_never_cached(self) -> None:
        page = await self.client.get("/cashback")
        self.assertEqual(page.status_code, 200)
        self.assertEqual(page.headers["cache-control"], "no-store")
        response = await self.client.get(API_PATH)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "no-store")

    async def test_data_holds_settings_rules_budget_limits_and_the_marketing_strip(self) -> None:
        await self.client.post("/cashback/settings", data={"enabled": "1", "combine": "sum", "hold_hours": "48",
                                                           "monthly_budget": "9000"})
        await self.create_rule(percent="2.5", max_per_order="50000", event_renew="1")
        async with self.Session() as session:
            session.add(CashbackBudget(shop_key=5, month=datetime.now(timezone.utc).strftime("%Y-%m"), used=1234))
            await session.commit()
        data = (await self.client.get(API_PATH)).json()
        self.assertEqual(data["settings"], {"enabled": True, "combine": "sum", "hold_hours": 48, "monthly_budget": 9000})
        self.assertEqual(data["budget_used"], 1234)
        self.assertEqual(data["limits"]["rule_limit"], 50)
        self.assertEqual(data["limits"]["max_hold_hours"], 2160)
        self.assertIn("cashback", [section["key"] for section in data["sections"]])
        rule = data["rules"][0]
        self.assertEqual((rule["name"], rule["mode"], rule["percent"], rule["max_per_order"]), ("۱۰٪", "percent", "2.5", 50000))
        self.assertEqual(rule["events"], ["new", "renew"])
        self.assertTrue(rule["enabled"])
        self.assertTrue(rule["allow_with_discount"])
        self.assertFalse(rule["first_purchase_only"])
        self.assertIsNone(rule["customer_max_count"])

    async def test_a_resent_create_form_makes_one_rule(self) -> None:
        form = {**VALID, "request_key": await self.fresh_key()}
        for _ in range(3):
            response = await self.client.post("/cashback/rules", data=form)
            self.assertIn("ok", parse_qs(urlsplit(response.headers["location"]).query))
        self.assertEqual(len(await self.rules_of(SHOP)), 1)

    async def test_each_read_hands_out_a_fresh_key_and_a_create_without_one_is_refused(self) -> None:
        self.assertNotEqual(await self.fresh_key(), await self.fresh_key())
        self.assertRegex(await self.fresh_key(), r"^[0-9a-f]{32}$")
        for form in (VALID, {**VALID, "request_key": "not-a-key"}):
            response = await self.client.post("/cashback/rules", data=form)
            self.assertIn("err", parse_qs(urlsplit(response.headers["location"]).query))
        self.assertEqual(await self.rules_of(SHOP), [])

    def test_percent_text_is_exact_for_every_basis_point_value(self) -> None:
        for bps, text in ((0, "0"), (1, "0.01"), (7, "0.07"), (250, "2.5"), (1000, "10"), (10_000, "100"), (1999, "19.99")):
            self.assertEqual(_percent_text(bps), text)

    async def test_a_hostile_rule_name_is_returned_as_plain_text(self) -> None:
        hostile = '<img src=x onerror="alert(1)">'
        await self.create_rule(name=hostile)
        self.assertEqual([r["name"] for r in await self.rules_of(SHOP)], [hostile])

    async def test_rejected_input_comes_back_as_an_error_redirect_and_changes_nothing(self) -> None:
        for extra in ({"name": ""}, {"percent": "150"}, {"event_new": ""}, {"max_per_order": "-5"}):
            response = await self.client.post("/cashback/rules", data={**VALID, **extra})
            self.assertEqual(response.status_code, 303)
            self.assertIn("err", parse_qs(urlsplit(response.headers["location"]).query))
        response = await self.client.post("/cashback/settings", data={"hold_hours": "999999"})
        self.assertIn("err", parse_qs(urlsplit(response.headers["location"]).query))
        self.assertEqual(await self.rules_of(SHOP), [])
        self.assertFalse((await self.client.get(API_PATH)).json()["settings"]["enabled"])

    async def test_toggle_edit_and_delete_follow_the_posted_form(self) -> None:
        rule_id = await self.create_rule()
        await self.client.post(f"/cashback/rules/{rule_id}/toggle", data={})
        self.assertFalse((await self.rules_of(SHOP))[0]["enabled"])
        await self.client.post(f"/cashback/rules/{rule_id}/toggle", data={"enabled": "1"})
        self.assertTrue((await self.rules_of(SHOP))[0]["enabled"])
        await self.client.post(f"/cashback/rules/{rule_id}", data={**VALID, "name": "ثابت", "mode": "fixed", "fixed_amount": "7000"})
        edited = (await self.rules_of(SHOP))[0]
        self.assertEqual((edited["id"], edited["name"], edited["mode"], edited["fixed_amount"]), (rule_id, "ثابت", "fixed", 7000))
        await self.client.post(f"/cashback/rules/{rule_id}/delete")
        self.assertEqual(await self.rules_of(SHOP), [])

    async def test_a_second_shop_can_neither_read_nor_change_the_first_shops_rules(self) -> None:
        rule_id = await self.create_rule()
        await self.client.post("/cashback/settings", data={"enabled": "1", "hold_hours": "5"})
        other = {**SHOP, "bot_user_id": 6}
        self.assertEqual(await self.rules_of(other), [])
        self.assertFalse((await self.client.get(API_PATH)).json()["settings"]["enabled"])
        for path, data in ((f"/cashback/rules/{rule_id}", {**VALID, "name": "هک"}), (f"/cashback/rules/{rule_id}/toggle", {}),
                           (f"/cashback/rules/{rule_id}/delete", {})):
            response = await self.client.post(path, data=data)
            self.assertIn("err", parse_qs(urlsplit(response.headers["location"]).query), path)
        await self.client.post("/cashback/settings", data={"hold_hours": "99"})
        mine = await self.rules_of(SHOP)
        self.assertEqual([(r["id"], r["name"], r["enabled"]) for r in mine], [(rule_id, "۱۰٪", True)])
        self.assertTrue((await self.client.get(API_PATH)).json()["settings"]["enabled"])
        async with self.Session() as session:
            self.assertEqual((await load_settings(session, 5)).hold_hours, 5)

    async def test_the_platform_owner_sees_only_platform_rules(self) -> None:
        await self.create_rule()
        self.assertEqual(await self.rules_of(OWNER), [])
        self.staff = OWNER
        await self.client.post("/cashback/rules", data={**VALID, "name": "پلتفرم", "request_key": await self.fresh_key()})
        self.assertEqual([r["name"] for r in await self.rules_of(OWNER)], ["پلتفرم"])
        self.assertEqual([r["name"] for r in await self.rules_of(SHOP)], ["۱۰٪"])


if __name__ == "__main__":
    unittest.main()
