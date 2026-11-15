"""Plan numbers typed by shop staff in the bot are bounded before a plan row is built."""

from __future__ import annotations

import unittest

from app.services.catalog_pricing import MAX_PRICE
from app.services.plans_catalog import MAX_PLAN_DAYS, parse_plan_days, parse_plan_gb, parse_plan_price


class PlanNumberParsingTests(unittest.TestCase):
    def test_price_accepts_persian_digits_and_separators(self):
        self.assertEqual(parse_plan_price("۱۵۰٬۰۰۰"), 150_000)
        self.assertEqual(parse_plan_price("0"), 0)

    def test_price_out_of_range_is_refused(self):
        for raw in ("-1", str(MAX_PRICE + 1), "abc", ""):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                parse_plan_price(raw)

    def test_days_must_be_a_real_duration(self):
        self.assertEqual(parse_plan_days("30"), 30)
        for raw in ("0", "-5", str(MAX_PLAN_DAYS + 1), "x"):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                parse_plan_days(raw)

    def test_volume_refuses_nan_and_infinity(self):
        for raw in ("nan", "inf", "-inf", "1e400", "200000"):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                parse_plan_gb(raw)

    def test_volume_zero_means_unlimited_and_fractions_are_kept(self):
        self.assertIsNone(parse_plan_gb("0"))
        self.assertEqual(parse_plan_gb("2.5"), 2.5)
        self.assertEqual(parse_plan_gb("۲٫۵"), 2.5)


if __name__ == "__main__":
    unittest.main()
