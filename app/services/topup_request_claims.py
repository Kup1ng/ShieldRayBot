"""One web top-up per submitted form: a resent request key never creates a second payment.

The wallet page hands out a fresh key with every read; the form sends it back with the top-up.
The claim is process-local and bounded, so it stops a double click, a retried request and a
replayed post. It is not a durable ledger: the open top-up limit in ``wallet_topup`` still caps
how many unpaid payments one account can hold.
"""

from __future__ import annotations

import re
import time

REQUEST_KEY_PATTERN = re.compile(r"^[A-Za-z0-9_-]{16,64}$")
CLAIM_TTL_SECONDS = 15 * 60
CLAIM_LIMIT = 2000

_claims: dict[tuple[int, str], float] = {}


def _forget_expired(now: float) -> None:
    for key in [key for key, claimed_at in _claims.items() if now - claimed_at >= CLAIM_TTL_SECONDS]:
        _claims.pop(key, None)


def claim_topup_request(user_id: int, request_key: object) -> bool:
    """True the first time this account submits this key; False for a repeat or a malformed key."""
    if not isinstance(request_key, str) or not REQUEST_KEY_PATTERN.match(request_key):
        return False
    now = time.monotonic()
    key = (int(user_id), request_key)
    if key in _claims and now - _claims[key] < CLAIM_TTL_SECONDS:
        return False
    if len(_claims) >= CLAIM_LIMIT:
        _forget_expired(now)
    if len(_claims) >= CLAIM_LIMIT:
        _claims.pop(next(iter(_claims)))
    _claims[key] = now
    return True


def release_topup_request(user_id: int, request_key: object) -> None:
    """Give the key back after a refusal that created nothing, so the same form can be corrected and resent."""
    if isinstance(request_key, str):
        _claims.pop((int(user_id), request_key), None)
