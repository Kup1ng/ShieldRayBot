"""Give each cashback rule the request key of the form that created it.

Revision ID: 0114_cashback_rule_request_key
Revises: 0113_service_import_offer_dismissal

A resent create form (double click, retried request) carried no key, so it made a second
identical rule; with the «sum» combine mode that paid the cashback twice. Existing rules keep a
NULL key, which the partial unique index ignores. Idempotent; the downgrade drops the index and
the column and keeps every rule.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0114_cashback_rule_request_key"
down_revision: Union[str, None] = "0113_service_import_offer_dismissal"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "cashback_rules"
COLUMN = "request_key"
INDEX = "uq_cashback_rules_request_key"


def _columns(bind: sa.Connection) -> set[str]:
    return {column["name"] for column in sa.inspect(bind).get_columns(TABLE)}


def _indexes(bind: sa.Connection) -> set[str]:
    return {index["name"] for index in sa.inspect(bind).get_indexes(TABLE)}


def upgrade() -> None:
    bind = op.get_bind()
    if not sa.inspect(bind).has_table(TABLE):
        return
    if COLUMN not in _columns(bind):
        op.add_column(TABLE, sa.Column(COLUMN, sa.String(32), nullable=True))
    if INDEX not in _indexes(bind):
        op.create_index(
            INDEX, TABLE, [COLUMN], unique=True,
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
