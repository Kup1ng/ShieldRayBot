"""Keep the web wallet form's request key on the top-up payment it created.

Revision ID: 0115_payment_topup_request_key
Revises: 0114_cashback_rule_request_key

The key used to be remembered only in the web process, so a restart or a second process let
a resent form open a second payment. A partial unique index on (user_id, request_key) now
lets one payment per form through. Existing payments keep a NULL key, which the index ignores.
Idempotent; the downgrade drops the index and the column and keeps every payment.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0115_payment_topup_request_key"
down_revision: Union[str, None] = "0114_cashback_rule_request_key"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "payments"
COLUMN = "request_key"
INDEX = "uq_payments_topup_request_key"


def _columns(bind: sa.Connection) -> set[str]:
    return {column["name"] for column in sa.inspect(bind).get_columns(TABLE)}


def _indexes(bind: sa.Connection) -> set[str]:
    return {index["name"] for index in sa.inspect(bind).get_indexes(TABLE)}


def upgrade() -> None:
    bind = op.get_bind()
    if not sa.inspect(bind).has_table(TABLE):
        return
    if COLUMN not in _columns(bind):
        op.add_column(TABLE, sa.Column(COLUMN, sa.String(64), nullable=True))
    if INDEX not in _indexes(bind):
        op.create_index(
            INDEX, TABLE, ["user_id", COLUMN], unique=True,
            sqlite_where=sa.text("request_key IS NOT NULL"),
            postgresql_where=sa.text("request_key IS NOT NULL"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if not sa.inspect(bind).has_table(TABLE):
        return
    if INDEX in _indexes(bind):
        op.drop_index(INDEX, table_name=TABLE)
    if COLUMN in _columns(bind):
        with op.batch_alter_table(TABLE) as batch:
            batch.drop_column(COLUMN)
