"use client";

import { Button, Tooltip } from "@heroui/react";
import type { ReactNode } from "react";

import { IconTile } from "@/components/ui/IconTile";
import { InfoRow } from "@/components/ui/InfoRow";
import { Icon } from "@/icons/Icon";

import { faDigits, safeUrl } from "../../core/format";
import { ActionButton } from "../../ui/ActionButton";
import { ServiceStatusChip, TONE_TEXT, daysTone } from "../../ui/status";
import { ServiceDot } from "./ServiceDot";
import { expireDateText, expireDaysLabel } from "./serviceFormat";
import type { ServiceRow } from "./types";

/** Figma "Service view" top row: a back button and the service name with its status. */
export function ServiceHeader({ service, onBack }: { service: ServiceRow; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <ActionButton tone="neutral" icon="solar:arrow-right-linear" onPress={onBack} className="shrink-0">
        بازگشت
      </ActionButton>
      <div className="inset-tile flex h-12 min-w-0 flex-1 items-center gap-2 rounded-lg px-3">
        <ServiceDot service={service} />
        <bdi className="ltr min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{service.username || "—"}</bdi>
        <ServiceStatusChip service={service} />
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-1">
      <dt>{label}:</dt>
      <dd className="font-medium">
        <bdi>{children}</bdi>
      </dd>
    </div>
  );
}

type HeroProps = { service: ServiceRow; onRenew?: () => void; autoRenew?: ReactNode };

/**
 * The blue «سرویس فعلی» card (the invoice colour). The facts get the full width, so long values
 * stay on one line on a phone; the auto-renew switch and the white «تمدید سرویس» button share the row under them.
 */
export function ServiceHero({ service, onRenew, autoRenew }: HeroProps) {
  const statusText = service.is_cancelled ? "لغوشده" : service.cancellation_pending ? "در انتظار لغو" : service.status_fa || service.status || "—";
  return (
    <section
      aria-label="خلاصهٔ سرویس"
      className="flex flex-col gap-4 rounded-xl bg-[var(--invoice-blue)] p-5 text-white shadow-[0_24px_48px_-12px_rgb(31_107_255/0.45)]"
    >
      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="text-lg font-bold">سرویس فعلی</h2>
        <dl className="flex flex-col gap-1 text-xs leading-5 text-white/90">
          <Fact label="وضعیت">{statusText}</Fact>
          <Fact label="مصرف">{faDigits(service.traffic || "—")}</Fact>
          <Fact label="زمان باقی‌مانده">{expireDaysLabel(service)}</Fact>
        </dl>
      </div>
      {onRenew || autoRenew ? (
        <div className="flex items-center gap-3">
          {autoRenew}
          {onRenew ? (
            <Button variant="secondary" onPress={onRenew} className="ms-auto !h-12 shrink-0 !rounded-lg !border-transparent !bg-white px-3 text-sm font-medium !text-[var(--eclipse)] dark:!bg-[var(--eclipse)] dark:!text-white">
              تمدید سرویس
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function IconAction({ label, icon, onPress }: { label: string; icon: string; onPress: () => void }) {
  return (
    <Tooltip delay={600}>
      <Button isIconOnly size="sm" variant="ghost" aria-label={label} onPress={onPress}>
        <Icon name={icon} size={22} />
      </Button>
      <Tooltip.Content>
        <p>{label}</p>
      </Tooltip.Content>
    </Tooltip>
  );
}

type LinkRowProps = {
  service: ServiceRow;
  showQr: boolean;
  onCopy: () => void;
  onOpen: () => void;
  onQr: () => void;
};

/** «مشاهده لینک اشتراک» with copy, QR and open; the link itself never sits on screen (it is a credential). */
export function SubscriptionLinkRow({ service, showQr, onCopy, onOpen, onQr }: LinkRowProps) {
  if (!safeUrl(service.subscription_url)) return null;
  return (
    <div className="flex min-h-12 items-center gap-2 rounded-lg bg-[color-mix(in_oklab,var(--invoice-blue)_14%,transparent)] p-2">
      <IconTile icon="solar:link-round-bold" tone="blue" />
      <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">مشاهده لینک اشتراک</span>
      <div className="flex shrink-0 items-center">
        <IconAction label="کپی لینک" icon="solar:copy-linear" onPress={onCopy} />
        {showQr ? <IconAction label="QR کد اشتراک" icon="solar:qr-code-linear" onPress={onQr} /> : null}
        <IconAction label="باز کردن لینک" icon="solar:arrow-left-up-linear" onPress={onOpen} />
      </div>
    </div>
  );
}

/** Expiry and remaining volume as Figma "Tag-base" rows. */
export function ServiceInfoRows({ service }: { service: ServiceRow }) {
  const left = service.traffic_left && service.traffic_left !== "—" ? faDigits(service.traffic_left) : "";
  const tone = daysTone(service.expire_days);
  return (
    <>
      <InfoRow
        icon="solar:hourglass-bold"
        tone="yellow"
        label="تاریخ انقضا"
        value={<span className={tone === "default" ? "" : TONE_TEXT[tone]}>{expireDateText(service)}</span>}
      />
      <InfoRow icon="solar:box-bold" tone="green" label="حجم باقی‌مانده" value={left || "—"} />
    </>
  );
}

/** The panel could not be read: the figures above may be stale, and the customer can ask again. */
export function ServiceInfoNotice({ service, onRetry, retrying }: { service: ServiceRow; onRetry: () => void; retrying: boolean }) {
  if (!service.error) return null;
  return (
    <div role="status" className="flex items-center gap-3 rounded-lg bg-danger/10 p-3">
      <Icon name="solar:danger-triangle-bold" size={22} className="shrink-0 text-danger" />
      <p className="min-w-0 flex-1 text-xs leading-5 text-foreground/80">
        {service.error_message || "دریافت اطلاعات سرویس ناموفق بود؛ دوباره تلاش کنید."}
      </p>
      <Button size="sm" variant="secondary" className="!rounded-lg" onPress={onRetry} isPending={retrying}>
        تلاش دوباره
      </Button>
    </div>
  );
}
