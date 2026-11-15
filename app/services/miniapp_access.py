"""The Mini App's entry gate: the shop's entry terms and, for a new customer, a referral code.

Parity with the bot's ``TermsEntryMiddleware``: an end customer (staff never) is held until
they accept the current entry terms of the shop whose Mini App they use, recorded with
``terms.record_acceptance`` exactly as the bot's «موافقم» button does, so accepting in one
place counts in the other.

The bot already enforced the shop's «معرف اجباری» rule when the account was created (an
account cannot exist without passing it), so the Mini App never requires a code. Like the bot,
which records a referrer only at registration, it offers the code field only on a customer's
very first entry: an account of this shop with no referrer, no purchase and no entry terms
accepted anywhere. A dormant account shown the gate again (changed terms, another shop's Mini
App) can never attach a referrer later. A valid code of this shop is recorded once, and an
invalid one refuses the whole request.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy import exists, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import BotUser, TermsAcceptance
from app.services.discount_checkout import CodeError, claim_code_attempt, release_code_attempt
from app.services.referral_registration import find_registration_referrer, normalize_referral_code
from app.services.terms import TermsPrompt, needs_entry_gate, record_acceptance, shop_scope_id
from app.services.users import _has_commerce_history

logger = logging.getLogger(__name__)

TERMS_TITLE = "قوانین و مقررات"
REFERRAL_CODE_MAX = 64


class AccessError(ValueError):
    """A gate rule the customer must see (Persian, safe to show)."""


@dataclass(slots=True)
class AccessState:
    prompt: TermsPrompt | None
    referral_asked: bool

    def payload(self) -> dict[str, Any]:
        terms = None
        if self.prompt is not None:
            terms = {"title": TERMS_TITLE, "text": self.prompt.text, "accept_label": self.prompt.btn_label}
        return {
            "required": self.prompt is not None,
            "terms": terms,
            "referral": {"asked": self.referral_asked, "required": False},
        }


async def _entry_prompt(
    session: AsyncSession, user: BotUser, *, shop_id: int | None, gated: bool, ui: dict
) -> TermsPrompt | None:
    if not gated:
        return None
    return await needs_entry_gate(session, user, ui, menu_role="user", reseller_owner_id=shop_id)


async def _has_accepted_any_terms(session: AsyncSession, user_id: int) -> bool:
    return bool(await session.scalar(select(exists().where(TermsAcceptance.bot_user_id == user_id))))


async def _referral_asked(
    session: AsyncSession, user: BotUser, prompt: TermsPrompt | None, *, shop_id: int | None
) -> bool:
    if prompt is None or user.referred_by_id is not None:
        return False
    # The account must belong to the shop whose code it would take (referred_by_id is global).
    if (int(user.reseller_id) if user.reseller_id is not None else None) != shop_id:
        return False
    user_id = int(user.id)
    if await _has_accepted_any_terms(session, user_id):
        return False
    return not await _has_commerce_history(session, user_id)


async def access_state(
    session: AsyncSession, user: BotUser, *, shop_id: int | None, gated: bool, ui: dict
) -> AccessState:
    """Where this person stands at the gate of the shop ``shop_id`` (None is the platform).

    ``gated`` is False for staff; ``ui`` must be that shop's own settings.
    """
    prompt = await _entry_prompt(session, user, shop_id=shop_id, gated=gated, ui=ui)
    return AccessState(prompt=prompt, referral_asked=await _referral_asked(session, user, prompt, shop_id=shop_id))


def _clean_code(raw: object) -> str | None:
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return None
    if not isinstance(raw, str) or len(raw.strip()) > REFERRAL_CODE_MAX:
        raise AccessError("کد معرف را درست وارد کنید")
    return raw.strip()


async def _apply_referral(session: AsyncSession, user: BotUser, code: str, *, shop_id: int | None) -> None:
    """Record this shop's referrer once; an unknown code counts toward the code-guess limit."""
    user_id = int(user.id)
    try:
        stamp = claim_code_attempt(user_id)
    except CodeError as exc:
        raise AccessError(str(exc)) from None
    referrer = None
    try:
        if normalize_referral_code(code):
            referrer = await find_registration_referrer(
                session, code, telegram_id=int(user.telegram_id), reseller_owner_id=shop_id
            )
    except BaseException:
        release_code_attempt(user_id, stamp)
        raise
    if referrer is None or int(referrer.id) == user_id:
        raise AccessError("کد معرف معتبر نیست؛ آن را بررسی کنید یا خالی بگذارید")
    release_code_attempt(user_id, stamp)
    claim = await session.execute(
        update(BotUser)
        .where(BotUser.id == user_id, BotUser.referred_by_id.is_(None))
        .values(referred_by_id=int(referrer.id))
        .execution_options(synchronize_session=False)
    )
    await session.commit()
    if claim.rowcount != 1:
        return
    await session.refresh(user)
    try:
        from app.services.loyalty import on_user_referred

        await on_user_referred(session, referred=user, source="miniapp")
    except Exception:
        logger.warning("mini access: referral reward not recorded user=%s", user_id, exc_info=True)


async def accept_access(
    session: AsyncSession,
    user: BotUser,
    *,
    shop_id: int | None,
    gated: bool,
    ui: dict,
    accept: object,
    referral_code: object,
) -> None:
    """Accept the entry terms of this shop (and record a referral code when one is asked).

    Safe to repeat: an accepted gate is left as it is, and a referrer is written only while
    the account has none.
    """
    if accept is not True:
        raise AccessError("برای ادامه، قوانین را بپذیرید")
    code = _clean_code(referral_code)
    prompt = await _entry_prompt(session, user, shop_id=shop_id, gated=gated, ui=ui)
    if prompt is None:
        return
    if code is not None and await _referral_asked(session, user, prompt, shop_id=shop_id):
        await _apply_referral(session, user, code, shop_id=shop_id)
    await record_acceptance(
        session,
        bot_user_id=int(user.id),
        shop_owner_id=shop_scope_id(reseller_owner_id=shop_id),
        gate="entry",
        ui=ui,
    )
