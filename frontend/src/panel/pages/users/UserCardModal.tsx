"use client";

import { Button, Chip, Modal } from "@heroui/react";

import { IconTile } from "@/components/ui/IconTile";

import { useJson } from "../../core/data";
import { fa } from "../../core/format";
import { ErrorBlock, LoadingBlock } from "../../ui/States";
import { cardEditHref, expireToneClass, money, roleLabel } from "./format";
import { RiskTagChip } from "./RiskTagChip";
import type { UserCard, UserCardPage } from "./types";
import { UserIdentity } from "./UserIdentity";

/** What the card hands to the message form: who to write to, and the page the card was opened from. */
export type MessageTarget = { id: number; name: string; returnPage?: UserCardPage };

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}

function CardBadges({ card }: { card: UserCard }) {
  const { user } = card;
  return (
    <>
      <Chip size="sm" variant="soft" color={user.is_blocked ? "danger" : "success"}>
        {user.is_blocked ? "مسدود" : "فعال"}
      </Chip>
      <Chip size="sm" variant="soft">
        {roleLabel(user.role)}
      </Chip>
      {user.is_demo ? (
        <Chip size="sm" variant="soft">
          دمو
        </Chip>
      ) : null}
      {card.risk_tag ? <RiskTagChip tag={card.risk_tag} /> : null}
    </>
  );
}

function CardActions({ card, onMessage }: { card: UserCard; onMessage: () => void }) {
  if (!card.edit_target && !card.can_message) return null;
  const { edit_target: target } = card;
  return (
    <div className="flex flex-wrap gap-2">
      {target ? (
        <Button className="button--ink !h-10 !rounded-lg" onPress={() => window.location.assign(cardEditHref(target, card.user.id))}>
          ویرایش
        </Button>
      ) : null}
      {card.can_message ? (
        <Button variant="outline" className="!h-10 !rounded-lg" onPress={onMessage}>
          پیام
        </Button>
      ) : null}
    </div>
  );
}

function CardBody({ card, onMessage }: { card: UserCard; onMessage: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <section className="inset-tile rounded-lg p-4">
        <UserIdentity person={card.user} badges={<CardBadges card={card} />}>
          <CardActions card={card} onMessage={onMessage} />
        </UserIdentity>
      </section>

      <section className="inset-tile rounded-lg p-4" aria-label="خلاصهٔ حساب">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Stat label="کیف پول">
            <bdi dir="ltr" className="num">
              {money(card.wallet_balance)}
            </bdi>{" "}
            <small className="text-muted">تومان</small>
          </Stat>
          <Stat label="امتیاز">
            <bdi dir="ltr" className="num">
              {money(card.points_balance)}
            </bdi>
          </Stat>
          <Stat label="خرید موفق">
            <bdi dir="ltr" className="num">
              {money(card.paid_total)}
            </bdi>{" "}
            <small className="text-muted">تومان · {fa(card.paid_count)} سفارش</small>
          </Stat>
          <Stat label="عضویت">{card.joined}</Stat>
        </dl>
      </section>

      <section aria-labelledby="user-card-services" className="inset-tile flex flex-col gap-2 rounded-lg p-4">
        <h3 id="user-card-services" className="text-sm font-semibold text-foreground">
          سرویس‌ها ({fa(card.services.length)})
        </h3>
        {card.services.length === 0 ? (
          <p className="text-sm text-muted">سرویسی در این فروشگاه ندارد.</p>
        ) : (
          card.services.map((service) => (
            <div key={service.id} className="flex flex-col gap-0.5 border-t border-border/60 pt-2 first:border-t-0 first:pt-0">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm text-foreground">{service.plan_name || service.label}</strong>
                <span className={`text-sm ${expireToneClass(service.expire_tone)}`}>{service.expire_text}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted">
                {service.pg_username ? <bdi dir="ltr">{service.pg_username}</bdi> : <span />}
                <span>{service.volume_text}</span>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

/**
 * «اطلاعات کاربر»: one customer's account and services as this shop sees them. ``page`` is the table the
 * card was opened from; the server picks the actions of that row from it and the message returns there.
 */
export function UserCardModal({ userId, page, onClose, onMessage }: { userId: number | null; page: UserCardPage; onClose: () => void; onMessage: (target: MessageTarget) => void }) {
  const card = useJson<UserCard>(userId ? `/api/panel/users/${userId}/card?from=${page}` : null);
  const { data, reload } = card;
  return (
    <Modal.Backdrop isOpen={userId !== null} onOpenChange={(open) => !open && onClose()} variant="blur">
      <Modal.Container size="md" placement="center">
        <Modal.Dialog className="!rounded-xl">
          <Modal.CloseTrigger aria-label="بستن" />
          <Modal.Header className="!flex-row !items-center gap-3 pe-8">
            <IconTile icon="solar:user-id-bold" size="lg" />
            <Modal.Heading className="!text-base font-semibold">اطلاعات کاربر</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="py-2">
            {card.status === "error" && !data ? (
              <ErrorBlock message={card.message} onRetry={reload} />
            ) : !data ? (
              <LoadingBlock rows={4} />
            ) : (
              <CardBody
                card={data}
                onMessage={() => {
                  onClose();
                  onMessage({ id: data.user.id, name: data.user.message_name, returnPage: data.opened_from });
                }}
              />
            )}
          </Modal.Body>
          <Modal.Footer className="!flex-row !justify-end">
            <Button variant="outline" className="!h-10 min-w-24 !rounded-lg" onPress={onClose}>
              بستن
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
