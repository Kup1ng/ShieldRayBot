"""Runs the Mini App browser-behaviour checks (escaping, double taps, lost responses, back).

The Mini App is the React app in ``frontend/``; its behaviour tests are Vitest suites next to the
screens. They need the frontend dependencies (``npm ci`` in ``frontend/``, which needs the
HeroUI Pro licence token), so this test is skipped where they are not installed.
"""

from __future__ import annotations

import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
VITEST = FRONTEND / "node_modules" / "vitest" / "vitest.mjs"


@unittest.skipUnless(shutil.which("node") and VITEST.is_file(), "frontend dependencies are not installed")
class MiniAppFrontendTests(unittest.TestCase):
    def run_vitest(self, *paths: str) -> None:
        result = subprocess.run(
            [shutil.which("node"), str(VITEST), "run", *paths],
            cwd=FRONTEND, capture_output=True, text=True, encoding="utf-8", timeout=600,
        )
        self.assertEqual(result.returncode, 0, result.stdout[-4000:] + result.stderr[-4000:])

    def test_core_launch_api_and_routing(self) -> None:
        self.run_vitest("src/miniapp/core", "src/miniapp/state")

    def test_screen_behaviour(self) -> None:
        self.run_vitest("src/miniapp/screens")


if __name__ == "__main__":
    unittest.main()
