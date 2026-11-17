"""Who sees the PasarGuard link-health card and its reconnect action on the React dashboard."""

from __future__ import annotations

import unittest

from app.services.panel_home_payload import home_widgets_payload, link_health_payload
from app.services.pg_link_reconnect import PG_LINK_RECONNECT_PERMISSION

OWNER = {
    "role": "admin", "username": "root", "org_principal_id": 1, "org_depth": 0,
    "org_parent_id": None, "org_status": "active", "permissions": [],
}
LEGACY_ADMIN = {"role": "admin", "username": "legacy", "permissions": [PG_LINK_RECONNECT_PERMISSION]}
SHOP = {"role": "reseller", "bot_user_id": 5, "username": "shop5", "permissions": [PG_LINK_RECONNECT_PERMISSION, "dashboard"]}
LINKS = {"payments": True, "tickets": True}

PAUSED = {"circuit": {"paused": True, "retry_in_sec": 7}, "recent_failure_count": 0, "recent_failures": []}
HEALTHY = {"circuit": {"paused": False}, "recent_failure_count": 0, "last_ok_at": "2026-01-01T00:00:00", "recent_failures": []}


def widgets(staff: dict, template: str, health: dict) -> dict:
    ctx = {"pg_link_health": health, "periods": {}, "action_center": {}}
    return home_widgets_payload(staff, template, ctx, LINKS)


class LinkHealthReconnectVisibilityTests(unittest.TestCase):
    def test_owner_sees_reconnect_while_the_link_is_down(self) -> None:
        body = widgets(OWNER, "home.html", PAUSED)
        self.assertTrue(body["link_health"]["can_reconnect"])
        self.assertTrue(body["link_health"]["paused"])

    def test_owner_does_not_see_reconnect_while_the_link_is_healthy(self) -> None:
        self.assertFalse(widgets(OWNER, "home.html", HEALTHY)["link_health"]["can_reconnect"])

    def test_admin_without_an_owner_principal_never_gets_reconnect(self) -> None:
        self.assertFalse(widgets(LEGACY_ADMIN, "home.html", PAUSED)["link_health"]["can_reconnect"])

    def test_shop_staff_get_no_link_health_at_all(self) -> None:
        body = widgets(SHOP, "reseller_home.html", PAUSED)
        self.assertIsNone(body["link_health"])
        self.assertNotIn("reconnect", str(body).lower())


class LinkHealthDetailTests(unittest.TestCase):
    def test_budget_exhaustion_shows_only_when_it_happened(self) -> None:
        quiet = link_health_payload({**PAUSED, "budget_exhaustion_count": 0, "budget_exhaustion_label": "سقف زمان"})
        self.assertIsNone(quiet["budget_exhaustion"])
        busy = link_health_payload({**PAUSED, "budget_exhaustion_count": 3, "budget_exhaustion_label": "سقف زمان"})
        self.assertEqual(busy["budget_exhaustion"], {"label": "سقف زمان", "count": 3})

    def test_prior_boot_note_is_sent_only_for_figures_from_before_the_restart(self) -> None:
        fresh = link_health_payload({**HEALTHY, "from_prior_boot": False, "prior_boot_note": "note"})
        self.assertIsNone(fresh["prior_boot_note"])
        old = link_health_payload({**HEALTHY, "from_prior_boot": True, "prior_boot_note": "note"})
        self.assertEqual(old["prior_boot_note"], "note")

    def test_reconnect_is_off_unless_the_caller_allows_it(self) -> None:
        self.assertFalse(link_health_payload(PAUSED)["can_reconnect"])
        self.assertTrue(link_health_payload(PAUSED, can_reconnect=True)["can_reconnect"])
        self.assertFalse(link_health_payload(HEALTHY, can_reconnect=True)["can_reconnect"])


if __name__ == "__main__":
    unittest.main()
