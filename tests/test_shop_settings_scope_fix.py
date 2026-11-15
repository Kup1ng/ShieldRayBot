"""Surgical Shop/Settings scope regressions (finance/supports fail-closed + principal shop).

NO redesign — contract tests for read/write scope only.
"""

from __future__ import annotations

import ast
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _fn_src(path: Path, fn_name: str) -> str:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == fn_name:
            return ast.get_source_segment(path.read_text(encoding="utf-8"), node) or ""
        if isinstance(node, ast.FunctionDef) and node.name == "register_shop_settings":
            for child in node.body:
                if (
                    isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef))
                    and child.name == fn_name
                ):
                    return ast.get_source_segment(path.read_text(encoding="utf-8"), child) or ""
        if isinstance(node, ast.FunctionDef) and node.name in {
            "register_finance_pages",
            "register_panel_tickets_pages",
        }:
            for child in node.body:
                if (
                    isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef))
                    and child.name == fn_name
                ):
                    return ast.get_source_segment(path.read_text(encoding="utf-8"), child) or ""
    return ""


class FinanceSupportsFailClosedTests(unittest.TestCase):
    def test_finance_no_owner_fallback_when_scope_missing(self):
        # The settings dialog moved to the JSON endpoint; tests/test_panel_finance_api.py also checks the behavior.
        src = (ROOT / "app/services/finance_settings_panel.py").read_text(encoding="utf-8")
        panel = (ROOT / "app/services/finance_panel.py").read_text(encoding="utf-8")
        # Must gate Owner settings on the platform flag, not bare role==admin + None rid.
        self.assertIn("access.platform", src)
        self.assertIn("platform = is_platform_admin(staff)", panel)
        self.assertNotIn(
            'rid = None if staff.get("role") == "admin" else shop_owner_id(staff)',
            src,
        )
        # Scoped path requires a shop id before get_all_settings, and refuses without one.
        chunk = src[src.find("if access.platform:") : src.find("purge = await")]
        self.assertIn("shop_id = shop_owner_id(staff)", chunk)
        self.assertIn("if not shop_id:", chunk)
        self.assertIn("raise FinanceScopeError(SCOPE_UNKNOWN)", chunk)
        self.assertIn("get_all_settings(session, reseller_id=shop_id)", chunk)
        # Owner branch uses platform get_all_settings without reseller_id=None trick
        self.assertIn("await get_all_settings(session)", chunk)


class ShopSettingsPrincipalScopeTests(unittest.TestCase):
    def test_save_paths_use_same_session_scope(self):
        src = (ROOT / "app/api/shop_settings.py").read_text(encoding="utf-8")
        for name in (
            "shop_settings_save",
            "shop_notifications_save",
            "shop_menu_layout_save",
            "shop_supports_save",
            "shop_supports_delete",
            "shop_cancel_pending_orders",
        ):
            start = src.find(f"async def {name}")
            self.assertGreater(start, 0, name)
            # slice until next async def at same indent level approx
            rest = src[start:]
            nxt = rest.find("\n    async def ", 10)
            chunk = rest[: nxt if nxt > 0 else len(rest)]
            self.assertNotIn('staff.get("role") != "reseller"', chunk, name)
            self.assertIn("_rid(staff)", chunk, name)
            self.assertIn("if not rid:", chunk, name)

    def test_helper_uses_shop_owner_id_server_side(self):
        src = (ROOT / "app/api/shop_settings.py").read_text(encoding="utf-8")
        self.assertIn("def _rid(staff: dict)", src)
        self.assertIn("shop_owner_id(staff)", src)
        self.assertIn("def _is_owner_settings_actor", src)
        self.assertIn("is_platform_admin", src)
        # Authority comment / ignore client reseller_id
        self.assertIn("Ignore any client-supplied reseller_id", src)


class ShopOwnerIdPrincipalTests(unittest.TestCase):
    def test_principal_with_profile_resolves_shop_id(self):
        from app.services.shop_scope import shop_owner_id

        self.assertEqual(
            shop_owner_id(
                {
                    "role": "principal",
                    "reseller_profile_id": 9,
                    "bot_user_id": 55,
                }
            ),
            55,
        )

    def test_principal_missing_scope_is_none(self):
        from app.services.shop_scope import shop_owner_id

        self.assertIsNone(
            shop_owner_id({"role": "principal", "reseller_profile_id": 0, "bot_user_id": 55})
        )
        self.assertIsNone(
            shop_owner_id({"role": "principal", "reseller_profile_id": 9, "bot_user_id": 0})
        )

    def test_sibling_ids_differ(self):
        from app.services.shop_scope import shop_owner_id

        a = shop_owner_id(
            {"role": "reseller", "bot_user_id": 10}
        )
        b = shop_owner_id(
            {"role": "principal", "reseller_profile_id": 2, "bot_user_id": 20}
        )
        self.assertEqual(a, 10)
        self.assertEqual(b, 20)
        self.assertNotEqual(a, b)


class _ScopeCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

        from app.db.models import Base, BotUser, ResellerSetting, Setting

        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.session = async_sessionmaker(self.engine, expire_on_commit=False)()
        self.session.add_all([
            BotUser(id=5, telegram_id=105, referral_code="s5", role="reseller"),
            BotUser(id=6, telegram_id=106, referral_code="s6", role="reseller"),
        ])
        await self.session.flush()
        contact = '[{"id":"%s","title":"%s","telegram":"@%s","sort":0,"enabled":true}]'
        self.session.add_all([
            Setting(key="support_contacts", value=contact % ("p", "Platform", "platformsup")),
            Setting(key="shop_title", value="Platform title"),
            ResellerSetting(reseller_user_id=5, key="support_contacts", value=contact % ("a", "Shop5", "shopfive")),
            ResellerSetting(reseller_user_id=6, key="support_contacts", value=contact % ("b", "Shop6", "shopsix")),
            ResellerSetting(reseller_user_id=5, key="shop_title", value="Shop 5 title"),
            ResellerSetting(reseller_user_id=6, key="shop_title", value="Shop 6 title"),
        ])
        await self.session.commit()

    async def asyncTearDown(self):
        await self.session.close()
        await self.engine.dispose()


class SupportsScopeTests(_ScopeCase):
    async def test_supports_no_owner_fallback_when_scope_missing(self):
        from app.services.tickets_panel import supports_payload

        shop = {"role": "reseller", "bot_user_id": 5, "permissions": ["shop_settings"]}
        no_shop = {"role": "reseller", "bot_user_id": None, "permissions": ["shop_settings"]}
        owner = {"role": "admin", "org_principal_id": 1, "org_depth": 0, "org_parent_id": None, "org_status": "active"}
        self.assertEqual([c["title"] for c in (await supports_payload(self.session, shop))["contacts"]], ["Shop5"])
        self.assertEqual([c["title"] for c in (await supports_payload(self.session, owner))["contacts"]], ["Platform"])
        empty = await supports_payload(self.session, no_shop)
        self.assertEqual((empty["contacts"], empty["sections"]), ([], []))
        self.assertNotIn("Platform", str(empty))


class ShopSettingsPrincipalScopeBehaviourTests(_ScopeCase):
    async def test_page_allows_session_scope_not_reseller_role_only(self):
        from app.api.shop_settings_panel import entry_redirect, shop_settings_payload

        shop = {"role": "reseller", "bot_user_id": 5, "permissions": ["shop_settings"]}
        self.assertIsNone(entry_redirect(shop, "welcome", {}))
        # A reseller session without a shop, and the legacy admin label, never see a shop's data.
        self.assertTrue(entry_redirect({"role": "reseller", "permissions": ["shop_settings"]}, "welcome", {}).startswith("/dashboard?err="))
        self.assertEqual(entry_redirect({"role": "admin"}, "welcome", {}), "/settings")
        with self.assertRaises(PermissionError):
            await shop_settings_payload(self.session, {"role": "reseller", "permissions": ["shop_settings"]}, "welcome")
        body = await shop_settings_payload(self.session, shop, "welcome")
        values = {f["key"]: f["value"] for section in body["sections"] for f in section["fields"]}
        self.assertEqual(values["shop_title"], "Shop 5 title")
        self.assertNotIn("Shop 6 title", str(body))
        self.assertNotIn("Platform title", str(body))


if __name__ == "__main__":
    unittest.main()
