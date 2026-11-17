"""The pack, PAYG and renewal data the React plan forms read: scoped to the viewer's own plans."""

from __future__ import annotations

from app.db.models import Plan, ResellerPlan, ResellerPlanExtraPack, ServiceAddonPack
from app.services.panel_plan_packs import reseller_pack_config, user_pack_config
from tests.test_panel_catalog_api import OWNER, SHOP2, SHOP3, CatalogApiCase


class PackFormDataTests(CatalogApiCase):
    async def asyncSetUp(self) -> None:
        await super().asyncSetUp()
        async with self.Session() as session:
            session.add_all(
                [
                    Plan(id=4, name="Shop2Extra", price=10, duration_days=30, owner_reseller_id=2, allow_buy_extra=True, extra_gb_price=700, extra_month_price=9000),
                    ServiceAddonPack(id=10, name="v", kind="volume", amount=20, price=1, owner_reseller_id=2, plan_id=4, button_style="danger", sort_order=1, is_general=False),
                    ServiceAddonPack(id=11, name="v", kind="volume", amount=5, price=1, owner_reseller_id=2, plan_id=4, button_style=None, sort_order=0, is_general=False),
                    ServiceAddonPack(id=12, name="d", kind="duration", amount=90, price=1, owner_reseller_id=2, plan_id=4, button_style="", is_general=False),
                    # Same plan id but another shop's row, and another plan's row: never shown.
                    ServiceAddonPack(id=13, name="x", kind="volume", amount=77, price=1, owner_reseller_id=3, plan_id=4, is_general=False),
                    ServiceAddonPack(id=14, name="y", kind="volume", amount=66, price=1, owner_reseller_id=2, plan_id=2, is_general=False),
                    ResellerPlanExtraPack(plan_id=1, kind="gb", amount=10, button_style="success", sort_order=1, is_active=True),
                    ResellerPlanExtraPack(plan_id=1, kind="gb", amount=2, button_style=None, sort_order=0, is_active=True),
                    ResellerPlanExtraPack(plan_id=1, kind="users", amount=3, button_style="", sort_order=0, is_active=True),
                    ResellerPlanExtraPack(plan_id=1, kind="users", amount=9, button_style=None, sort_order=1, is_active=False),
                    ResellerPlanExtraPack(plan_id=2, kind="gb", amount=40, button_style=None, sort_order=0, is_active=True),
                ]
            )
            await session.commit()

    async def test_a_shop_gets_the_packs_of_its_own_plan_with_months_and_colours(self) -> None:
        body = (await self.get(SHOP2, "/api/panel/plans/4")).json()
        self.assertEqual(body["packs"]["volume"], [{"amount": 5, "button_style": "inherit"}, {"amount": 20, "button_style": "danger"}])
        self.assertEqual(body["packs"]["duration"], [{"amount": 3, "button_style": ""}])
        self.assertEqual(
            {k: body["plan"][k] for k in ("allow_buy_extra", "extra_gb_price", "extra_month_price", "carry_remaining_quota")},
            {"allow_buy_extra": True, "extra_gb_price": 700, "extra_month_price": 9000, "carry_remaining_quota": True},
        )

    async def test_another_shop_cannot_read_the_packs_of_the_plan(self) -> None:
        self.assertEqual((await self.get(SHOP3, "/api/panel/plans/4")).status_code, 404)
        self.assertEqual((await self.get(OWNER, "/api/panel/plans/4")).status_code, 404)

    async def test_each_plan_keeps_its_own_stairs_and_a_plan_without_any_has_none(self) -> None:
        body = (await self.get(SHOP2, "/api/panel/plans/2")).json()
        self.assertEqual(body["packs"], {"volume": [{"amount": 66, "button_style": "inherit"}], "duration": []})
        other = (await self.get(SHOP3, "/api/panel/plans/3")).json()
        self.assertEqual(other["packs"], {"volume": [], "duration": []})

    async def test_pack_style_options_list_every_colour_with_the_default_first(self) -> None:
        body = (await self.get(SHOP2, "/api/panel/plans/4")).json()
        self.assertEqual([o["value"] for o in body["pack_style_options"]], ["inherit", "", "primary", "success", "danger"])

    async def test_the_overview_carries_the_customer_pack_limits_but_the_reseller_ones_only_for_the_owner(self) -> None:
        shop = (await self.get(SHOP2, "/api/panel/plans")).json()
        self.assertEqual(shop["pack_config"], {"user": user_pack_config()})
        self.assertEqual(shop["pack_config"]["user"]["duration"]["max"], 120)
        self.assertEqual(shop["pack_config"]["user"]["volume"]["defaults"], [1, 5, 10, 50])
        owner = (await self.get(OWNER, "/api/panel/plans")).json()
        self.assertEqual(owner["pack_config"], {"user": user_pack_config(), "reseller": reseller_pack_config()})
        self.assertEqual(owner["pack_config"]["reseller"]["users"]["defaults"], [1, 5, 10, 20])
        self.assertEqual([o["value"] for o in owner["pack_style_options"]], ["inherit", "", "primary", "success", "danger"])

    async def test_the_owner_gets_the_reseller_stairs_of_that_plan_only(self) -> None:
        body = (await self.get(OWNER, "/api/panel/plans/reseller/1")).json()
        self.assertEqual(body["packs"]["gb"], [{"amount": 2, "button_style": "inherit"}, {"amount": 10, "button_style": "success"}])
        # The inactive stair and the other package's stair are not part of this form.
        self.assertEqual(body["packs"]["users"], [{"amount": 3, "button_style": ""}])
        self.assertEqual(body["pack_config"], {"reseller": reseller_pack_config()})
        self.assertEqual(set(body["packs"]), {"gb", "users"})

    async def test_a_shop_never_reads_reseller_stairs(self) -> None:
        response = await self.get(SHOP2, "/api/panel/plans/reseller/1")
        self.assertEqual(response.status_code, 403)
        self.assertNotIn("packs", response.text)


class ResellerPlanFlagsTests(CatalogApiCase):
    async def test_payg_pricing_and_renewal_flags_are_sent_for_the_form(self) -> None:
        async with self.Session() as session:
            plan = await session.get(ResellerPlan, 1)
            plan.payg_basis = "user_traffic"
            plan.payg_charge_upfront = True
            plan.payg_user_price = 1500
            plan.payg_user_price_per_30d = True
            plan.payg_unlimited_price = None
            plan.carry_remaining_period = False
            plan.keep_extras_on_renew = False
            plan.allow_pg_panel_access = False
            await session.commit()
        plan = (await self.get(OWNER, "/api/panel/plans/reseller/1")).json()["plan"]
        self.assertEqual(
            {k: plan[k] for k in ("payg_basis", "payg_charge_upfront", "payg_user_price", "payg_user_price_per_30d", "payg_unlimited_price")},
            {"payg_basis": "user_traffic", "payg_charge_upfront": True, "payg_user_price": 1500, "payg_user_price_per_30d": True, "payg_unlimited_price": None},
        )
        self.assertEqual((plan["carry_remaining_period"], plan["keep_extras_on_renew"], plan["allow_pg_panel_access"]), (False, False, False))

    async def test_an_unlimited_price_of_zero_stays_distinct_from_forbidden(self) -> None:
        async with self.Session() as session:
            (await session.get(ResellerPlan, 1)).payg_unlimited_price = 0
            await session.commit()
        plan = (await self.get(OWNER, "/api/panel/plans/reseller/1")).json()["plan"]
        self.assertEqual(plan["payg_unlimited_price"], 0)


class FormContractTests(CatalogApiCase):
    """The browser posts repeated fields; the existing handlers must read them back as the editor showed them."""

    async def test_payg_fields_round_trip_through_the_handler_parser(self) -> None:
        from starlette.datastructures import FormData

        from app.api.payg_plan_form import payg_settings_from_form

        form = FormData(
            [
                ("payg_fields_shown", "1"), ("payg_basis", "user_traffic"), ("payg_charge_upfront", "1"), ("payg_user_price", "1500"),
                ("payg_user_price_per_30d", "1"), ("payg_unlimited_price", ""),
            ]
        )
        settings = payg_settings_from_form(form, price_per_gb=700)
        self.assertEqual((settings.basis, settings.charge_upfront, settings.user_price, settings.user_price_per_30d, settings.unlimited_price), ("user_traffic", True, 1500, True, None))
        free = FormData([("payg_fields_shown", "1"), ("payg_basis", "user"), ("payg_user_price", "0"), ("payg_unlimited_price", "")])
        with self.assertRaises(ValueError):
            payg_settings_from_form(free, price_per_gb=0)

    async def test_reseller_stairs_keep_their_row_pairing_and_the_white_colour(self) -> None:
        from starlette.datastructures import FormData

        from app.services.reseller_plan_extra_packs import apply_extra_packs_from_form
        from app.services.panel_plan_packs import reseller_plan_packs

        form = FormData(
            [
                ("extra_gb_amount", "10"), ("extra_gb_amount", "2"), ("extra_gb_style", "success"), ("extra_gb_style", "inherit"),
                ("extra_user_amount", "3"), ("extra_user_style", ""),
            ]
        )
        async with self.Session() as session:
            plan = await session.get(ResellerPlan, 1)
            plan.allow_buy_extra = True
            await apply_extra_packs_from_form(session, plan, form)
            await session.commit()
        async with self.Session() as session:
            rows = await reseller_plan_packs(session, 1)
        self.assertEqual(rows["gb"], [{"amount": 10, "button_style": "success"}, {"amount": 2, "button_style": "inherit"}])
        self.assertEqual(rows["users"], [{"amount": 3, "button_style": ""}])

    async def test_customer_stairs_are_stored_for_the_shop_and_read_back_in_months(self) -> None:
        from starlette.datastructures import FormData

        from app.services.panel_plan_packs import user_plan_packs
        from app.services.service_addons import replace_plan_scoped_packs_from_form

        form = FormData(
            [
                ("plan_vol_amount", "5"), ("plan_vol_amount", "20"), ("plan_vol_style", "inherit"), ("plan_vol_style", "danger"),
                ("plan_dur_amount", "3"), ("plan_dur_style", "inherit"),
            ]
        )
        async with self.Session() as session:
            plan = await session.get(Plan, 2)
            plan.allow_buy_extra = True
            plan.extra_gb_price = 100
            plan.extra_month_price = 1000
            await replace_plan_scoped_packs_from_form(session, SHOP2, plan_id=2, form=form)
            await session.commit()
            rows = await user_plan_packs(session, plan)
            other_shop = await session.get(Plan, 3)
            self.assertEqual(await user_plan_packs(session, other_shop), {"volume": [], "duration": []})
        self.assertEqual(rows["volume"], [{"amount": 5, "button_style": "inherit"}, {"amount": 20, "button_style": "danger"}])
        self.assertEqual(rows["duration"], [{"amount": 3, "button_style": "inherit"}])

    async def test_another_shop_cannot_write_stairs_onto_a_plan_it_does_not_own(self) -> None:
        from starlette.datastructures import FormData

        from app.services.service_addons import replace_plan_scoped_packs_from_form

        form = FormData([("plan_vol_amount", "5"), ("plan_vol_style", "inherit")])
        async with self.Session() as session:
            with self.assertRaises(ValueError):
                await replace_plan_scoped_packs_from_form(session, SHOP3, plan_id=2, form=form)
