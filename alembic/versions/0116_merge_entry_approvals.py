"""Join ShieldRay's request-key migrations with upstream's entry approvals.

Revision ID: 0116_merge_entry_approvals
Revises: 0115_payment_topup_request_key, 0114_entry_approvals

ShieldRay's 0114 (cashback rule request key) and 0115 (top-up request key) and upstream's
0114_entry_approvals all follow 0113, so the history had two heads and ``upgrade head`` could
not pick one. This revision only joins them; it changes no table, so both directions are safe to
repeat and the downgrade keeps every row.
"""

from __future__ import annotations

from typing import Sequence, Union

revision: str = "0116_merge_entry_approvals"
down_revision: Union[str, Sequence[str], None] = ("0115_payment_topup_request_key", "0114_entry_approvals")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Nothing to change: both branches already created their own tables and columns."""


def downgrade() -> None:
    """Nothing to undo: stepping back leaves both branch heads as they were."""
