"use client";

import { Button, Tooltip } from "@heroui/react";

import { IconTile } from "@/components/ui/IconTile";
import { InfoRow } from "@/components/ui/InfoRow";
import { Icon } from "@/icons/Icon";

import { copyText, faDigits, money, num } from "../../core/format";
import { useResource } from "../../state/resources";
import { useMini } from "../../state/store";
import type { ServiceGlance } from "../../types";
import { ActionButton } from "../../ui/ActionButton";
import { type Club } from "../club/clubKit";
import { openTopup } from "../account/topup";
import { AdminHome } from "../ops/AdminHome";
import { ShopPeek } from "../ops/ShopPeek";
import { SubscriptionLink } from "../subscription/SubscriptionLink";

/** Figma dashboard: the large round avatar. The name stays for screen readers and the shop's caption sits under it. */
function ProfileHeader() {
  const { me } = useMini();
  const name = me.user?.name || "";
  const tagline = typeof me.brand?.tagline === "string" ? me.brand.tagline.trim() : "";
  return (
    <header className="flex flex-col items-center gap-3 pt-1 text-center">
      <h1 className="sr-only">{name ? `سلام، ${name}` : "سلام"}</h1>
      <span
        aria-hidden
        className="flex aspect-square w-[min(100%,16rem)] items-end justify-center overflow-hidden rounded-full border-2 border-border bg-foreground/10 text-foreground/55"
      >
        <Icon name="solar:user-bold" size={200} className="!size-[78%] translate-y-[4%]" />
      </span>
      {tagline ? <p className="text-xs text-muted">{tagline}</p> : null}
    </header>
  );
}

/** «کد دعوت» row: only while the club section is open and the server gave this person a code. */
function InviteRow() {
  const { can, notify } = useMini();
  const club = useResource<{ club: Club }>("club", can("club"));
  const code = club.status === "ready" ? club.data.club?.referral?.code : "";
  if (!code) return null;
  const copy = async () => {
    const ok = await copyText(code);
    notify(ok ? "کد دعوت کپی شد" : "کپی انجام نشد", ok ? "ok" : "err");
  };
  return (
    <InfoRow
      icon="solar:ticket-bold"
      tone="yellow"
      label="کد دعوت"
      value={<span className="ltr num">{code}</span>}
      action={<CopyButton label="کد دعوت" onCopy={() => void copy()} />}
    />
  );
}

function CopyButton({ label, onCopy }: { label: string; onCopy: () => void }) {
  return (
    <Tooltip delay={600}>
      <Button isIconOnly size="sm" variant="ghost" aria-label={`کپی ${label}`} onPress={onCopy}>
        <Icon name="solar:copy-linear" size={22} />
      </Button>
      <Tooltip.Content>
        <p>کپی {label}</p>
      </Tooltip.Content>
    </Tooltip>
  );
}

function AttentionCard({ service, onRenew }: { service: ServiceGlance; onRenew: (id: number) => void }) {
  const ended = ["expired", "limited"].includes(String(service.status || "").toLowerCase());
  return (
    <div role="status" className="flex items-center gap-3 rounded-lg bg-warning/12 p-3">
      <IconTile icon="solar:hourglass-bold" tone="yellow" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {ended ? "سرویس به پایان رسیده" : "سرویس رو به پایان است"}: <bdi className="ltr">{String(service.username || "—")}</bdi>
        </p>
        <p className="text-xs text-foreground/70">{faDigits(service.remaining_label || "")}</p>
      </div>
      <Button size="sm" variant="secondary" className="!rounded-lg" onPress={() => onRenew(Number(service.id) || 0)}>
        تمدید
      </Button>
    </div>
  );
}

function NoticeBanner({ text }: { text?: string }) {
  const s = String(text || "").trim();
  if (!s) return null;
  return (
    <section aria-label="اطلاعیهٔ فروشگاه" className="flex items-start gap-3 rounded-lg bg-accent-soft p-3">
      <IconTile icon="solar:bell-bold" tone="purple" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-accent-soft-foreground">اطلاعیهٔ فروشگاه</p>
        <p className="text-sm font-medium whitespace-pre-line text-foreground">{s}</p>
      </div>
    </section>
  );
}

function CustomerHome() {
  const mini = useMini();
  const { me, customer, features, can, persona, go, notify } = mini;
  const home = customer?.home ?? { service_count: 0, attention: [], recent: [] };
  const badges = customer?.badges ?? {};

  const copyId = async () => {
    const ok = await copyText(String(me.user.id));
    notify(ok ? "شناسه کپی شد" : "کپی انجام نشد", ok ? "ok" : "err");
  };

  return (
    <>
      <ProfileHeader />

      <section aria-label="حساب" className="flex flex-col gap-3">
        <InfoRow
          icon="solar:user-bold"
          tone="blue"
          label="شناسه حساب"
          value={<span className="ltr num">{String(me.user.id)}</span>}
          action={<CopyButton label="شناسه" onCopy={() => void copyId()} />}
        />
        <InviteRow />
        <InfoRow
          icon="solar:wallet-bold"
          tone="green"
          label="موجودی"
          value={<span className="num">{money(customer?.wallet)}</span>}
          action={
            features.topup ? (
              <Button
                size="sm"
                aria-label="افزایش موجودی"
                className="!h-8 !rounded-lg !border-transparent !bg-[var(--tile-green)] !px-2.5 !text-white"
                onPress={() => openTopup(mini)}
              >
                <Icon name="solar:add-circle-linear" size={20} />
                افزایش
              </Button>
            ) : undefined
          }
        />
      </section>

      <section aria-label="کارهای اصلی" className="flex flex-col gap-4">
        <div className="flex gap-4">
          {features.shop ? (
            <ActionButton tone="accent" icon="solar:cart-large-2-linear" className="flex-1" onPress={() => go("shop")}>
              خرید سرویس
            </ActionButton>
          ) : null}
          <ActionButton tone="yellow" icon="solar:crown-linear" className="flex-1" onPress={() => go("services")}>
            سرویس‌ها
          </ActionButton>
        </div>
        {can("support") ? (
          <ActionButton tone="neutral" icon="solar:headphones-round-linear" fullWidth className="!h-14" onPress={() => go("support")}>
            پشتیبانی
            {badges.support ? <span className="num text-danger">({num(badges.support)})</span> : null}
          </ActionButton>
        ) : null}
      </section>

      {(home.attention ?? []).map((service) => (
        <AttentionCard key={String(service.id)} service={service} onRenew={(id) => go("service", { serviceId: id, then: "renew" })} />
      ))}

      <NoticeBanner text={me.brand?.notice} />

      {persona === "reseller" ? <ShopPeek /> : null}
      <SubscriptionLink />
    </>
  );
}

export function HomeScreen() {
  const { persona, commerce } = useMini();
  if (persona === "admin" || !commerce) return <AdminHome />;
  return <CustomerHome />;
}
