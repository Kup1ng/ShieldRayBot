"""Record ids taken from a URL, bounded to the database integer range.

An id past the column range reaches the database as an overflow error (a 500); bounding it
in the parameter answers 422 before any query runs.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Path

MAX_ID = 2_147_483_647

DbId = Annotated[int, Path(ge=1, le=MAX_ID)]
