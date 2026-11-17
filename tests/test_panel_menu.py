"""The React panel sidebar offers a page only to staff whose route would open it."""

from __future__ import annotations

import unittest

from app.services.panel_menu import panel_nav

OWNER = {"role": "admin", "permissions": [], "org_principal_id": 1, "org_depth": 0, "org_status": "active"}


def _item_ids(staff: dict, *, is_owner: bool = False) -> list[str]:
    sections = panel_nav(staff, identity={}, is_owner=is_owner)
    return [item["id"] for section in sections for item in section["items"]]


class ServiceCleanupItemTests(unittest.TestCase):
    def test_owner_and_granted_shop_see_service_cleanup(self) -> None:
        self.assertIn("service-cleanup", _item_ids(OWNER, is_owner=True))
        shop = {"role": "reseller", "bot_user_id": 2, "permissions": ["service_cleanup"]}
        self.assertIn("service-cleanup", _item_ids(shop))

    def test_shop_without_the_permission_or_a_shop_does_not_see_it(self) -> None:
        for staff in (
            {"role": "reseller", "bot_user_id": 2, "permissions": ["orders"]},
            {"role": "reseller", "permissions": ["service_cleanup"]},
            {"role": "pg_staff", "permissions": [], "pg_permissions": ["pg_users"]},
        ):
            with self.subTest(staff=staff):
                self.assertNotIn("service-cleanup", _item_ids(staff))


if __name__ == "__main__":
    unittest.main()
