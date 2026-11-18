"""The plans JSON for the React list grouped by category, and the category choices of the plan forms."""

from __future__ import annotations

import unittest

from app.db.models import BotUser, Plan, PlanCategory, ResellerSetting, Setting
from app.services.plan_category_board import NOTE_CATEGORY_OFF, NOTE_NO_PLANS
from app.services.users import _SETTINGS_CACHE
from tests.test_panel_catalog_api import OWNER, SHOP2, SHOP3, CatalogApiCase

SHOP4 = {"role": "reseller", "permissions": ["plans"], "bot_user_id": 4}
HOSTILE = "<img src=x onerror=alert(1)>"


class BoardCase(CatalogApiCase):
    """Shop 2 has five categories (one switched off, one for resellers); shop 4 has none; shop 3 has one of its own."""

    async def _seed(self) -> None:
        await super()._seed()
        async with self.Session() as session:
            session.add(BotUser(id=4, telegram_id=104, referral_code="shop4", role="reseller"))
            await session.flush()
            session.add_all(
                [
                    PlanCategory(id=11, name="اقتصادی", owner_reseller_id=2, sort_order=5, button_style="danger"),
                    PlanCategory(id=12, name=HOSTILE, owner_reseller_id=2, sort_order=1, button_style="success"),
                    PlanCategory(id=13, name="خاموش", owner_reseller_id=2, sort_order=3, is_active=False, button_style=""),
                    PlanCategory(id=14, name="نمایندگان", owner_reseller_id=2, sort_order=0, audience="resellers"),
                    PlanCategory(id=15, name="دستهٔ فروشگاه سه", owner_reseller_id=3, sort_order=0),
                    ResellerSetting(reseller_user_id=2, key="btn_style_shop_kind_fixed", value="success"),
                ]
            )
            await session.flush()
            session.add_all(
                [
                    Plan(id=21, name="ویژه‌یک", price=1, duration_days=30, owner_reseller_id=2, category_id=12),
                    Plan(id=22, name="اقتصادی‌یک", price=1, duration_days=30, owner_reseller_id=2, category_id=11),
                    Plan(id=23, name="برای نمایندگان", price=1, duration_days=30, owner_reseller_id=2, category_id=14),
                    Plan(id=24, name="بی‌دسته", price=1, duration_days=30, owner_reseller_id=2),
                    Plan(id=25, name="در دستهٔ خاموش", price=1, duration_days=30, owner_reseller_id=2, category_id=13, is_active=False),
                    Plan(id=41, name="شاپ چهار", price=1, duration_days=30, owner_reseller_id=4),
                ]
            )
            await session.commit()


class PlanBoardJsonTests(BoardCase):
    async def _board(self, staff: dict) -> dict:
        return (await self.get(staff, "/api/panel/plans")).json()["plan_board"]

    async def test_groups_follow_the_bots_category_order_with_the_colour_of_each_bot_button(self) -> None:
        board = await self._board(SHOP2)
        self.assertTrue(board["has_categories"])
        self.assertEqual([g["name"] for g in board["groups"]], ["Shop2Cat", HOSTILE, "خاموش", "اقتصادی"])
        # Shop2Cat inherits the shop's «ثابت» colour, a named colour is its own, an explicit white is plain.
        self.assertEqual([g["tone"] for g in board["groups"]], ["success", "success", "default", "danger"])
        self.assertEqual([g["plan_ids"] for g in board["groups"]], [[2], [21], [25], [22]])

    async def test_a_category_says_why_it_has_no_bot_button_and_the_ends_cannot_move_further(self) -> None:
        groups = (await self._board(SHOP2))["groups"]
        by_name = {g["name"]: g for g in groups}
        self.assertTrue(by_name["اقتصادی"]["in_bot"])
        self.assertIsNone(by_name["اقتصادی"]["bot_note"])
        self.assertFalse(by_name["خاموش"]["in_bot"])
        self.assertEqual(by_name["خاموش"]["bot_note"], NOTE_CATEGORY_OFF)
        self.assertFalse(by_name["خاموش"]["is_active"])
        self.assertEqual([(g["can_move_up"], g["can_move_down"]) for g in groups], [(False, True), (True, True), (True, True), (True, False)])

    async def test_plans_without_a_user_category_sit_under_the_other_group_and_a_reseller_category_is_no_group(self) -> None:
        board = await self._board(SHOP2)
        self.assertEqual(sorted(board["other"]["plan_ids"]), [23, 24])
        self.assertEqual(board["other"]["title"], "سایر")
        self.assertNotIn("نمایندگان", [g["name"] for g in board["groups"]])

    async def test_every_plan_of_the_list_is_in_exactly_one_group(self) -> None:
        body = (await self.get(SHOP2, "/api/panel/plans")).json()
        listed = [i for g in body["plan_board"]["groups"] for i in g["plan_ids"]] + body["plan_board"]["other"]["plan_ids"]
        self.assertEqual(sorted(listed), sorted(p["id"] for p in body["plans"]))

    async def test_a_category_without_plans_still_has_a_group_that_explains_itself(self) -> None:
        async with self.Session() as session:
            session.add(PlanCategory(id=16, name="خالی", owner_reseller_id=2, sort_order=9))
            await session.commit()
        group = next(g for g in (await self._board(SHOP2))["groups"] if g["name"] == "خالی")
        self.assertEqual((group["plan_ids"], group["bot_note"]), ([], NOTE_NO_PLANS))

    async def test_a_shop_without_categories_gets_a_flat_list_and_never_sees_another_shops_groups(self) -> None:
        board = await self._board(SHOP4)
        self.assertEqual((board["has_categories"], board["groups"]), (False, []))
        self.assertEqual(board["other"]["plan_ids"], [41])
        other = await self._board(SHOP3)
        self.assertEqual([g["name"] for g in other["groups"]], ["دستهٔ فروشگاه سه"])
        everything = {i for g in other["groups"] for i in g["plan_ids"]} | set(other["other"]["plan_ids"])
        self.assertEqual(everything, {3})

    async def test_the_owner_sees_the_platform_categories_only(self) -> None:
        board = await self._board(OWNER)
        self.assertEqual([g["name"] for g in board["groups"]], ["PlatformCat"])
        self.assertEqual(board["other"]["plan_ids"], [1])

    async def test_category_rows_carry_the_tone_of_their_bot_button(self) -> None:
        categories = {c["name"]: c for c in (await self.get(SHOP2, "/api/panel/plans")).json()["categories"]}
        self.assertEqual((categories["اقتصادی"]["tone"], categories[HOSTILE]["tone"], categories["خاموش"]["tone"]), ("danger", "success", "default"))
        # A category for resellers has no button in the shop bot.
        self.assertEqual(categories["نمایندگان"]["tone"], "default")

    async def test_hostile_names_travel_as_data_for_the_screen_to_escape(self) -> None:
        board = await self._board(SHOP2)
        self.assertIn(HOSTILE, [g["name"] for g in board["groups"]])


class PlanFormCategoriesTests(BoardCase):
    """The category chips of the plan forms: which categories a plan may be put in."""

    async def _offered(self, plan_id: int, staff: dict = SHOP2) -> dict[str, dict]:
        body = (await self.get(staff, f"/api/panel/plans/{plan_id}")).json()
        return {c["name"]: c for c in body["categories"]}

    async def test_only_switched_on_user_categories_are_offered_with_their_colour(self) -> None:
        offered = await self._offered(24)
        self.assertEqual(set(offered), {"Shop2Cat", HOSTILE, "اقتصادی"})
        self.assertEqual((offered[HOSTILE]["tone"], offered["اقتصادی"]["tone"]), ("success", "danger"))
        self.assertTrue(all(c["is_active"] for c in offered.values()))

    async def test_the_plans_own_switched_off_category_stays_on_offer(self) -> None:
        offered = await self._offered(25)
        self.assertIn("خاموش", offered)
        self.assertFalse(offered["خاموش"]["is_active"])
        plan = (await self.get(SHOP2, "/api/panel/plans/25")).json()["plan"]
        self.assertEqual(plan["category_id"], 13)

    async def test_a_plan_keeps_a_reseller_category_it_already_has_but_nobody_else_is_offered_it(self) -> None:
        self.assertIn("نمایندگان", await self._offered(23))
        self.assertNotIn("نمایندگان", await self._offered(24))

    async def test_another_shops_categories_are_never_offered(self) -> None:
        self.assertEqual(set(await self._offered(3, SHOP3)), {"دستهٔ فروشگاه سه"})
        self.assertEqual(await self._offered(41, SHOP4), {})

    async def test_the_colours_a_new_category_can_take_are_part_of_the_answer(self) -> None:
        body = (await self.get(SHOP2, "/api/panel/plans/24")).json()
        values = [option["value"] for option in body["category_style_options"]]
        self.assertIn("inherit", values)
        self.assertEqual(set(body["category_style_options"][0]), {"value", "label", "tone"})


class NamingDefaultsTests(BoardCase):
    """The preview of the plan forms starts from the global naming: an empty saved prefix means no prefix."""

    async def test_a_prefix_that_was_never_stored_is_the_built_in_default(self) -> None:
        body = (await self.get(OWNER, "/api/panel/plans")).json()
        self.assertEqual(body["naming_defaults"]["prefix"], "clk")

    async def test_a_prefix_saved_empty_stays_empty_in_the_overview_and_the_edit_form(self) -> None:
        async with self.Session() as session:
            session.add(Setting(key="pg_username_prefix", value=""))
            await session.commit()
        _SETTINGS_CACHE.clear()
        overview = (await self.get(OWNER, "/api/panel/plans")).json()
        edit = (await self.get(OWNER, "/api/panel/plans/1")).json()
        self.assertEqual(overview["naming_defaults"]["prefix"], "")
        self.assertEqual(edit["naming_defaults"]["prefix"], "")

    async def test_a_shops_own_empty_prefix_does_not_leak_to_another_shop(self) -> None:
        async with self.Session() as session:
            session.add(ResellerSetting(reseller_user_id=2, key="pg_username_prefix", value=""))
            await session.commit()
        _SETTINGS_CACHE.clear()
        self.assertEqual((await self.get(SHOP2, "/api/panel/plans")).json()["naming_defaults"]["prefix"], "")
        self.assertEqual((await self.get(SHOP3, "/api/panel/plans")).json()["naming_defaults"]["prefix"], "clk")


if __name__ == "__main__":
    unittest.main()
