"""v4.10.8 — create reseller plan select + PG admin as_reseller gated fields."""

from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESELLERS_HTML = (ROOT / "app/web/templates/resellers.html").read_text(encoding="utf-8")
PG_ADMINS_HTML = (ROOT / "app/web/templates/pg_admins.html").read_text(encoding="utf-8")
RESELLER_API = (ROOT / "app/api/reseller_pages.py").read_text(encoding="utf-8")
PG_API = (ROOT / "app/api/pg_pages.py").read_text(encoding="utf-8")
RESELLERS_SVC = (ROOT / "app/services/resellers.py").read_text(encoding="utf-8")
CSS = (ROOT / "app/web/static/panel.css").read_text(encoding="utf-8")


class ResellerCreatePlanUiTests(unittest.TestCase):
    def test_create_modal_has_plan_select_not_commission(self):
        start = RESELLERS_HTML.find('id="modal-reseller-create"')
        end = RESELLERS_HTML.find('id="modal-reseller-edit"')
        modal = RESELLERS_HTML[start:end]
        self.assertIn('name="plan_id"', modal)
        self.assertIn("پلن نمایندگی", modal)
        self.assertIn("— انتخاب پلن —", modal)
        self.assertIn("[PAYG]", modal)
        self.assertIn("[ثابت]", modal)
        self.assertIn("reseller_plans", modal)
        self.assertNotIn('name="commission_percent"', modal)
        self.assertNotIn("کمیسیون ٪", modal)

    def test_plan_select_matches_pg_admins_pattern(self):
        start = RESELLERS_HTML.find('id="modal-reseller-create"')
        end = RESELLERS_HTML.find('id="modal-reseller-edit"')
        modal = RESELLERS_HTML[start:end]
        self.assertIn("required", modal)
        self.assertIn("disabled", modal)
        self.assertIn("هنوز پلن نمایندگی فعالی ندارید", modal)


class ResellerCreateOptionsTests(unittest.IsolatedAsyncioTestCase):
    async def test_create_form_offers_only_active_subscription_plans(self):
        from unittest.mock import AsyncMock, patch

        from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

        from app.db import Base
        from app.db.models import ResellerPlan
        from app.services.reseller_panel_list import create_options_payload

        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            session.add_all([
                ResellerPlan(id=1, name="active", price=1, plan_kind="subscription", billing_mode="fixed", is_active=True),
                ResellerPlan(id=2, name="inactive", price=1, plan_kind="subscription", billing_mode="fixed", is_active=False),
                ResellerPlan(id=3, name="pack", price=1, plan_kind="addon_volume", billing_mode="fixed", is_active=True),
            ])
            await session.commit()
            owner = {"role": "admin", "org_principal_id": 1, "org_depth": 0, "org_status": "active"}
            fake_pg = type("Pg", (), {"get_admin_roles": AsyncMock(return_value=[])})()
            with patch("app.services.reseller_panel_list.get_pg", return_value=fake_pg):
                options = await create_options_payload(session, owner)
        await engine.dispose()
        self.assertEqual([plan["name"] for plan in options["plans"]], ["active"])


class ResellerCreatePlanApiTests(unittest.TestCase):
    def test_create_requires_active_plan(self):
        fn = RESELLER_API[
            RESELLER_API.find("async def reseller_create") : RESELLER_API.find(
                "async def reseller_edit_page"
            )
        ]
        self.assertIn('form.get("plan_id")', fn)
        self.assertIn("انتخاب پلن نمایندگی الزامی است", fn)
        self.assertIn("پلن نمایندگی نامعتبر یا غیرفعال است", fn)
        self.assertIn("plan=plan", fn)
        self.assertNotIn("commission_percent", fn)
        self.assertNotIn('form.get("commission_percent")', fn)


class PgAdminCreateResellerGateTests(unittest.TestCase):
    def _create_modal(self) -> str:
        start = PG_ADMINS_HTML.find('id="modal-pg-admin-create"')
        end = PG_ADMINS_HTML.find("function syncCreateAdminMode")
        return PG_ADMINS_HTML[start:end]

    def test_as_reseller_default_off_and_fields_hidden(self):
        modal = self._create_modal()
        self.assertIn("create-as-reseller", modal)
        self.assertNotIn("checked=true, help='ادمین پاسارگارد", modal)
        self.assertIn("checked=false", modal)
        self.assertIn('id="create-reseller-fields"', modal)
        self.assertIn("hidden", modal.split('id="create-reseller-fields"', 1)[1][:80])
        # staff web wrap visible by default (no hidden on the wrap itself)
        staff = modal.split('id="create-staff-web-wrap"', 1)[1][:40]
        self.assertNotIn("hidden", staff)

    def test_reseller_fields_include_plan_and_panel_perms(self):
        modal = self._create_modal()
        block = modal.split('id="create-reseller-fields"', 1)[1]
        self.assertIn('name="plan_id"', block)
        self.assertIn("سطح دسترسی پنل ربات", block)
        self.assertIn("feature_perms", block)
        self.assertIn("perm_", block)
        self.assertIn("share_pg_panel_url", block)

    def test_css_hides_gated_reseller_fields(self):
        self.assertIn("#create-reseller-fields[hidden]", CSS)
        self.assertIn("create-reseller-fields[hidden]", CSS)
        self.assertIn("display: none !important", CSS)

    def test_page_passes_feature_perms(self):
        from app.services.pg_admins_panel import feature_perm_options
        from app.services.resellers import FEATURE_PERMS

        # The create form (React /pg/admins) is offered every reseller permission, in the same order.
        self.assertEqual([(p["key"], p["label"]) for p in feature_perm_options()], list(FEATURE_PERMS))

    def test_create_admin_applies_perm_overrides(self):
        fn = PG_API[
            PG_API.find("async def pg_admins_create") : PG_API.find(
                "async def pg_admins_web_access_legacy"
            )
        ]
        self.assertIn("reseller_perms", fn)
        self.assertIn("web_permissions=reseller_perms", fn)
        self.assertIn("share_pg_panel_url=share_pg", fn)
        self.assertIn("default UI is OFF", fn)

    def test_provision_accepts_permission_override(self):
        fn = RESELLERS_SVC[
            RESELLERS_SVC.find("async def provision_existing_pg_admin") : RESELLERS_SVC.find(
                "async def convert_staff_to_reseller"
            )
        ]
        self.assertIn("web_permissions: str | None = None", fn)
        self.assertIn("share_pg_panel_url: bool | None = None", fn)
        self.assertIn("web_permissions or plan.web_permissions", fn)


class VersionTests(unittest.TestCase):
    def test_version(self):
        from app.version import __version__
        from app.services.updates import is_same_or_newer

        self.assertTrue(is_same_or_newer(__version__, "0.1.0"))
        self.assertEqual((ROOT / "VERSION").read_text(encoding="utf-8").strip(), __version__)


if __name__ == "__main__":
    unittest.main()
