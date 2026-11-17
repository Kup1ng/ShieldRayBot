"use client";

import { Button, Chip, Modal } from "@heroui/react";
import { useState } from "react";

import { IconTile } from "@/components/ui/IconTile";

import { useJson } from "../../core/data";
import { fa } from "../../core/format";
import { ErrorBlock, LoadingBlock } from "../../ui/States";
import { expireToneClass, money, roleLabel } from "./format";
import { RiskTagChip } from "./RiskTagChip";
import type { UserCard } from "./types";

function Photo({ id, name }: { id: number; name: string }) {
  const [shown, setShown] = useState(false);
  // The initial shows until the Telegram photo loads, and stays when there is none.
  return (
    <span aria-hidden className="relative inline-flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-secondary text-lg font-semibold text-foreground">
      <span>{name.slice(0, 1)}</span>
      <img
        src={`/users/${id}/photo`}
        alt=""
        width={48}
        height={48}
        decoding="async"
        onLoad={() => setShown(true)}
        className={`absolute inset-0 size-full object-cover ${shown ? "" : "hidden"}`}
      />
    </span>
  );
}

function KeyValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-b-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

function CardBody({ card, onEdit, onMessage }: { card: UserCard; onEdit: () => void; onMessage: () => void }) {
  const { user } = card;
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Photo id={user.id} name={user.name} />
        <div className="flex min-w-0 flex-col">
          <strong className="truncate text-base text-foreground">
            <bdi>{user.name}</bdi>
          </strong>
          <span className="text-sm text-muted">
            {user.username ? (
              <>
                <bdi dir="ltr">@{user.username}</bdi> ·{" "}
              </>
            ) : null}
            آیدی <bdi dir="ltr">{user.telegram_id}</bdi>
          </span>
        </div>
      </header>

      {card.can_edit || card.can_message ? (
        <div className="flex flex-wrap gap-2">
          {card.can_edit ? (
            <Button className="button--ink !h-10 !rounded-lg" onPress={onEdit}>
              ویرایش
            </Button>
          ) : null}
          {card.can_message ? (
            <Button variant="outline" className="!h-10 !rounded-lg" onPress={onMessage}>
              پیام
            </Button>
          ) : null}
        </div>
      ) : null}

      <section aria-labelledby="user-card-account">
        <h3 id="user-card-account" className="mb-1 text-sm font-semibold text-foreground">
          حساب
        </h3>
        <dl>
          <KeyValue label="وضعیت">
            <Chip size="sm" variant="soft" color={user.is_blocked ? "danger" : "success"}>
              {user.is_blocked ? "مسدود" : "فعال"}
            </Chip>
          </KeyValue>
          <KeyValue label="نقش">
            {roleLabel(user.role)}
            {user.is_demo ? " · دمو" : ""}
          </KeyValue>
          {card.risk_tag ? (
            <KeyValue label="تگ ریسک">
              <RiskTagChip tag={card.risk_tag} />
            </KeyValue>
          ) : null}
          <KeyValue label="کیف پول">
            <bdi dir="ltr" className="num">
              {money(card.wallet_balance)}
            </bdi>{" "}
            تومان
          </KeyValue>
          <KeyValue label="خرید موفق">
            <bdi dir="ltr" className="num">
              {money(card.paid_total)}
            </bdi>{" "}
            تومان · {fa(card.paid_count)} سفارش
          </KeyValue>
          <KeyValue label="عضویت">{card.joined}</KeyValue>
        </dl>
      </section>

      <section aria-labelledby="user-card-services" className="flex flex-col gap-2">
        <h3 id="user-card-services" className="text-sm font-semibold text-foreground">
          سرویس‌ها ({fa(card.services.length)})
        </h3>
        {card.services.length === 0 ? (
          <p className="text-sm text-muted">سرویسی در این فروشگاه ندارد.</p>
        ) : (
          card.services.map((service) => (
            <div key={service.id} className="inset-tile flex flex-col gap-0.5 rounded-lg p-3">
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

/** «اطلاعات کاربر»: read-only account and services of one customer, as this shop sees them. */
export function UserCardModal({ userId, onClose, onMessage }: { userId: number | null; onClose: () => void; onMessage: (target: { id: number; name: string }) => void }) {
  const card = useJson<UserCard>(userId ? `/api/panel/users/${userId}/card` : null);
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
                onEdit={() => window.location.assign(`/users/${data.user.id}/edit`)}
                onMessage={() => {
                  onClose();
                  onMessage({ id: data.user.id, name: data.user.message_name });
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
