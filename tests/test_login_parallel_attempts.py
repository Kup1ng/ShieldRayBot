"""A burst of parallel logins cannot try more passwords than the lockout allows."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.api import login_guard as lg

IP = "203.0.113.50"


class ParallelLoginAttemptTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.patches = [
            patch.object(lg, "_LOGIN_LOCK_FILE", Path(self.tmp.name) / "login_lockouts.json"),
            patch.object(lg, "DATA_DIR", Path(self.tmp.name)),
        ]
        for p in self.patches:
            p.start()
        lg._LOGIN_FAILURES.clear()
        lg._IN_FLIGHT.clear()
        self.keys = lg.login_limit_keys(IP, "Admin")

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        lg._LOGIN_FAILURES.clear()
        lg._IN_FLIGHT.clear()
        self.tmp.cleanup()

    def test_open_attempts_count_toward_the_limit_before_any_failure_is_written(self):
        admitted = sum(lg.login_begin(self.keys) for _ in range(300))
        self.assertEqual(admitted, lg._LOGIN_MAX_FAILURES)

    def test_a_finished_attempt_frees_its_slot_and_failures_still_block(self):
        for _ in range(lg._LOGIN_MAX_FAILURES):
            self.assertTrue(lg.login_begin(self.keys))
            for key in self.keys:
                lg.login_fail(key)
            lg.login_end(self.keys)
        self.assertFalse(lg.login_begin(self.keys))
        self.assertEqual(lg._IN_FLIGHT, {})

    def test_username_key_is_case_insensitive(self):
        self.assertEqual(lg.login_limit_keys(IP, " ADMIN "), [IP, f"{IP}|admin"])


if __name__ == "__main__":
    unittest.main()
