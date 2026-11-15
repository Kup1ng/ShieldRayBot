"""Parallel code guesses count toward the per-customer limit before their result is known."""

from __future__ import annotations

import unittest

from app.services import discount_checkout
from app.services.discount_checkout import (
    CODE_FAILURE_LIMIT,
    CodeError,
    claim_code_attempt,
    release_code_attempt,
)


class CodeAttemptLimitTests(unittest.TestCase):
    def setUp(self):
        discount_checkout._failures.clear()
        self.addCleanup(discount_checkout._failures.clear)

    def test_a_burst_of_open_attempts_is_cut_at_the_limit(self):
        admitted = 0
        for _ in range(100):
            try:
                claim_code_attempt(7)
            except CodeError:
                continue
            admitted += 1
        self.assertEqual(admitted, CODE_FAILURE_LIMIT)

    def test_an_accepted_code_gives_its_slot_back(self):
        for _ in range(CODE_FAILURE_LIMIT * 3):
            release_code_attempt(7, claim_code_attempt(7))
        self.assertNotIn(7, discount_checkout._failures)

    def test_customers_are_counted_apart(self):
        for _ in range(CODE_FAILURE_LIMIT):
            claim_code_attempt(7)
        with self.assertRaises(CodeError):
            claim_code_attempt(7)
        claim_code_attempt(8)


if __name__ == "__main__":
    unittest.main()
