"""Ids and page cursors from a URL are bounded before they reach the database."""

from __future__ import annotations

import unittest

from app.services.staff_audit import parse_before_id
from tests.test_update_owner_only import OWNER_SESSION, RoutesHarness

HUGE = "9" * 20


class CursorParsingTests(unittest.TestCase):
    def test_unicode_digits_and_huge_values_are_not_a_cursor(self):
        for raw in ("²", "١٢", HUGE, "-3", "0", ""):
            with self.subTest(raw=raw):
                self.assertIsNone(parse_before_id(raw))
        self.assertEqual(parse_before_id("42"), 42)


class PanelPathIdTests(RoutesHarness):
    async def test_an_id_past_the_column_range_is_refused_before_any_query(self):
        for path in (
            f"/api/panel/users/{HUGE}/card",
            f"/api/panel/users/{HUGE}/edit",
            f"/api/panel/plans/{HUGE}",
            f"/api/panel/plans/reseller/{HUGE}",
            f"/api/panel/resellers/{HUGE}/edit",
        ):
            with self.subTest(path=path):
                response = await self.call(OWNER_SESSION, "GET", path)
                self.assertEqual(response.status_code, 422, response.text[:200])

    async def test_a_bad_discount_cursor_is_a_bad_request(self):
        for raw in ("²", HUGE):
            with self.subTest(raw=raw):
                response = await self.call(OWNER_SESSION, "GET", f"/api/panel/catalog-discounts?before={raw}")
                self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
