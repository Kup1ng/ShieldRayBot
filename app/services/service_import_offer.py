"""The home offer to add a previous service: who gets it, and the per-shop memory of who declined."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from sqlalchemy import exists, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ServiceImportOfferDismissal, UserService
from app.services.service_import_config import read_settings
from app.services.service_scope import shop_services_clause
from app.services.trial_offer import offerable_trial_plans
from app.services.users import on


def _shop_key(shop_id: int | None) -> int:
    return int(shop_id) if shop_id else 0


async def is_offer_dismissed(session: AsyncSession, user_id: int, shop_id: int | None) -> bool:
    return bool(
        await session.scalar(
            select(
                exists().where(
                    ServiceImportOfferDismissal.user_id == int(user_id),
                    ServiceImportOfferDismissal.shop_key == _shop_key(shop_id),
                )
            )
        )
    )


async def dismiss_offer(session: AsyncSession, user_id: int, shop_id: int | None) -> None:
    """Record the choice; asking twice (or two taps at once) leaves one row."""
    if await is_offer_dismissed(session, user_id, shop_id):
        return
    try:
        async with session.begin_nested():
            session.add(ServiceImportOfferDismissal(user_id=int(user_id), shop_key=_shop_key(shop_id)))
    except IntegrityError:
        return  # the other tap won the race; the row exists
    await session.commit()


async def customer_has_services(session: AsyncSession, user_id: int, shop_id: int | None) -> bool:
    """Whether the customer already has a service sold by this shop (None = the platform)."""
    found = await session.scalar(
        select(UserService.id)
        .where(UserService.bot_user_id == int(user_id), shop_services_clause(shop_id))
        .limit(1)
    )
    return found is not None


def offer_applies(
    ui: Mapping[str, str] | None, *, has_services: bool, dismissed: bool, trial_available: bool = False
) -> bool:
    """A customer of this shop with no service who did not ask to stop, while adding old services
    or a free trial can be offered."""
    return (read_settings(ui).enabled or trial_available) and not has_services and not dismissed


@dataclass(frozen=True, slots=True)
class HomeOffer:
    """What the home screen offers a customer with no service: a previous service, a free trial, or both."""

    import_enabled: bool
    trial_available: bool

    @property
    def show(self) -> bool:
        return self.import_enabled or self.trial_available


NO_OFFER = HomeOffer(import_enabled=False, trial_available=False)


async def home_offer(
    session: AsyncSession, *, user_id: int, shop_id: int | None, ui: Mapping[str, str] | None
) -> HomeOffer:
    """The home offer of ``shop_id`` for this customer (the shop context must already be set).

    The trial is offered only where the Mini App can start it: it is taken through the wallet
    purchase, which the shop's wallet-payment switch controls.
    """
    if await customer_has_services(session, user_id, shop_id) or await is_offer_dismissed(session, user_id, shop_id):
        return NO_OFFER
    trial_available = on((ui or {}).get("pay_wallet_enabled")) and bool(
        await offerable_trial_plans(session, ui, user_id)
    )
    return HomeOffer(import_enabled=read_settings(ui).enabled, trial_available=trial_available)
