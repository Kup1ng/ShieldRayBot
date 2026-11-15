"use client";

import { Button, Chip } from "@heroui/react";

import { IconTile } from "@/components/ui/IconTile";
import { SectionBadge } from "@/components/ui/SectionBadge";
import { Icon } from "@/icons/Icon";

import { formatDateTime, money } from "../../core/format";
import { ACTIVITY_MAX, currentActivityLimit, growActivity, invalidateResource, useResource } from "../../state/resources";
import { useMini } from "../../state/store";
import { ActionButton } from "../../ui/ActionButton";
import { EmptyState, Settled } from "../../ui/ScreenState";
import { badgeText } from "../../ui/countBadge";
import { openGiftCode } from "./gift";
import { openReceipt } from "./receipt";
import { TopupFlow } from "./TopupFlow";
import { TOPUP_STEP, openTopup } from "./topup";
import type { ActivityItem, ActivityPayload, RecentTopup, TopupOptions } from "./types";

/** The purple hero card: balance, whether wallet payment is on, top-up and gift code. */
function WalletCard() {
  const mini = useMini();
  const { customer, features } = mini;
  return (
    <section
      aria-label="کیف پول"
      className="relative flex flex-col gap-4 overflow-hidden rounded-xl bg-gradient-to-br from-[var(--tile-purple)] to-[oklch(42%_0.2_300)] p-5 text-white shadow-[var(--raised-shadow)]"
    >
      <span aria-hidden className="absolute -start-12 -top-16 size-48 rounded-full bg-white/10" />
      <div className="relative flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm text-white/85">
          <Icon name="solar:wallet-bold" size={20} />
          موجودی کیف پول
        </span>
        <span className="rounded-full bg-white/18 px-2.5 py-0.5 text-xs font-medium">{customer?.wallet_pay_enabled ? "پرداخت فعال" : "فقط مشاهده"}</span>
      </div>
      <p className="num relative text-3xl font-bold">
        <bdi>{money(customer?.wallet)}</bdi>
      </p>
      {features.topup || features.gift ? (
        <div className="relative flex gap-3">
          {features.topup ? (
            <Button className="!h-11 flex-1 !rounded-lg !border-transparent !bg-white !text-[var(--eclipse)]" onPress={() => openTopup(mini)}>
              <Icon name="solar:add-circle-linear" size={20} />
              افزایش موجودی
            </Button>
          ) : null}
          {features.gift ? (
            <Button className="!h-11 flex-1 !rounded-lg !border-white/30 !bg-white/12 !text-white" variant="secondary" onPress={() => openGiftCode(mini)}>
              <Icon name="solar:ticket-sale-bold" size={20} />
              کد هدیه
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

const TOPUP_STATUS_COLOR: Record<string, "success" | "danger"> = { approved: "success", rejected: "danger" };

function RecentTopups() {
  const mini = useMini();
  const topups = useResource<TopupOptions>("topup", mini.features.topup);
  if (!mini.features.topup || topups.status !== "ready") return null;
  const rows: RecentTopup[] = topups.data.recent ?? [];
  if (!rows.length) return null;
  return (
    <section aria-labelledby="account-topups" className="flex flex-col gap-3">
      <h2 id="account-topups" className="text-base font-semibold text-foreground">
        شارژهای اخیر
      </h2>
      {rows.map((row) => (
        <div key={row.id} className="inset-tile flex min-h-12 items-center gap-2 rounded-lg p-2 pe-3">
          <IconTile icon="solar:wallet-money-bold" tone="orange" />
          <div className="min-w-0 flex-1">
            <p className="num text-sm font-semibold text-foreground">
              <bdi>{money(row.amount)}</bdi>
            </p>
            <p className="text-xs text-muted">{formatDateTime(row.created_at)}</p>
          </div>
          {row.waiting_receipt ? (
            <Button size="sm" className="!rounded-lg" onPress={() => openReceipt(mini, Number(row.id) || 0)}>
              ارسال رسید
            </Button>
          ) : (
            <Chip size="sm" variant="soft" color={TOPUP_STATUS_COLOR[row.status] ?? "warning"}>
              <Chip.Label>{row.status_fa}</Chip.Label>
            </Chip>
          )}
        </div>
      ))}
    </section>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const amount = Number(item.amount) || 0;
  const plus = amount >= 0;
  return (
    <div className="inset-tile flex min-h-12 items-center gap-2 rounded-lg p-2 pe-3">
      <IconTile icon={plus ? "solar:arrow-down-linear" : "solar:arrow-up-linear"} tone={plus ? "green" : "red"} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{item.reason || "—"}</p>
        <p className="text-xs text-muted">{formatDateTime(item.created_at)}</p>
      </div>
      <span className={`num shrink-0 text-sm font-semibold ${plus ? "text-success" : "text-danger"}`}>
        <span className="sr-only">{amount < 0 ? "برداشت" : "واریز"} </span>
        <span aria-hidden>{amount > 0 ? "+" : amount < 0 ? "−" : ""}</span>
        <bdi>{money(Math.abs(amount))}</bdi>
      </span>
    </div>
  );
}

function ActivityList() {
  const activity = useResource<ActivityPayload>("activity");
  return (
    <section aria-labelledby="account-activity" className="flex flex-col gap-3">
      <h2 id="account-activity" className="text-base font-semibold text-foreground">
        تراکنش‌ها
      </h2>
      <Settled resource={activity} rows={3} onRetry={() => invalidateResource("activity")}>
        {(data) => {
          const items = data.items ?? [];
          if (!items.length) return <EmptyState icon="solar:bill-list-linear" title="هنوز تراکنشی ندارید." />;
          const limit = currentActivityLimit();
          const canMore = limit < ACTIVITY_MAX && items.length >= limit;
          return (
            <>
              {items.map((item, i) => (
                <ActivityRow key={`${item.created_at ?? ""}:${i}`} item={item} />
              ))}
              {canMore ? (
                <ActionButton tone="neutral" icon="solar:alt-arrow-down-linear" fullWidth onPress={growActivity}>
                  تراکنش‌های بیشتر
                </ActionButton>
              ) : null}
            </>
          );
        }}
      </Settled>
    </section>
  );
}

/** Support and the club, each with its unread count (the home screen has no shortcut tiles for them). */
function SupportLinks() {
  const { can, go, customer } = useMini();
  const badges = customer?.badges ?? {};
  const links = [
    can("support") ? { key: "support", icon: "solar:headphones-round-linear", tone: "blue" as const, label: "پشتیبانی و تیکت‌ها", badge: badgeText(badges.support) } : null,
    can("club") ? { key: "club", icon: "solar:gift-bold", tone: "pink" as const, label: "امتیاز، جوایز و دعوت دوستان", badge: badgeText(badges.club) } : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (!links.length) return null;
  return (
    <nav aria-label="پشتیبانی" className="flex flex-col gap-3">
      {links.map((link) => (
        <Button
          key={link.key}
          variant="secondary"
          onPress={() => go(link.key === "support" ? "support" : "club")}
          aria-label={link.badge ? `${link.label}، ${link.badge} مورد` : link.label}
          className="inset-tile !h-auto !w-full !justify-start !gap-3 !rounded-lg !p-2 !pe-3 text-start"
        >
          <IconTile icon={link.icon} tone={link.tone} />
          <span className="flex-1 text-sm font-medium text-foreground">{link.label}</span>
          {link.badge ? (
            <span aria-hidden className="min-w-5 rounded-full bg-danger px-1.5 text-center text-[11px] leading-5 font-semibold text-white">
              {link.badge}
            </span>
          ) : null}
          <Icon name="solar:alt-arrow-left-linear" size={18} className="text-muted" />
        </Button>
      ))}
    </nav>
  );
}

export function AccountScreen() {
  const { me, route, features, commerce } = useMini();
  // «افزایش موجودی» is a full-page flow of its own (Figma Add balance), reached by openTopup().
  if (route.then === TOPUP_STEP && features.topup && commerce) return <TopupFlow />;
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <SectionBadge icon="solar:wallet-bold" tone="green" title="حساب و کیف پول" />
        {me.user?.name ? <span className="truncate text-sm text-muted">{me.user.name}</span> : null}
      </div>
      <WalletCard />
      <RecentTopups />
      <SupportLinks />
      <ActivityList />
    </>
  );
}
