"use client";

import { useState } from "react";

import { SectionBadge } from "@/components/ui/SectionBadge";

import { api } from "../../core/api";
import { faDigits, formatDateTime, money, num, safeUrl } from "../../core/format";
import { openTelegramLink } from "../../core/telegram";
import { invalidateResource, useResource } from "../../state/resources";
import { useMini } from "../../state/store";
import { ActionButton } from "../../ui/ActionButton";
import { Settled } from "../../ui/ScreenState";
import { Block, HeroCard } from "../ops/parts";
import { CopyRow } from "./CopyRow";
import { RewardsSection } from "./RewardsSection";
import { pointsText, type Club, type Discount, type HistoryEntry } from "./clubKit";

const SHARE_BASE = "https://t.me/share/url?url=";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-surface/70 p-3">
      <span className="text-xs text-muted">{label}</span>
      <strong className="num text-base font-semibold text-foreground">{num(value)}</strong>
    </div>
  );
}

function ReferralSection({ club }: { club: Club }) {
  const { notify } = useMini();
  const referral = club.referral;
  const link = safeUrl(referral?.link);

  const share = () => {
    if (!link || !openTelegramLink(SHARE_BASE + encodeURIComponent(link))) notify("لینک دعوت در دسترس نیست", "err");
  };

  return (
    <Block title="دعوت دوستان" icon="solar:users-group-rounded-bold" tone="blue">
      <p className="text-xs leading-5 text-muted">با لینک یا کد خودتان دوستانتان را دعوت کنید و امتیاز بگیرید.</p>
      {link ? <CopyRow label="لینک دعوت" value={link} /> : null}
      {referral?.code ? <CopyRow label="کد دعوت" value={referral.code} /> : null}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="دعوت‌های موفق" value={Number(referral?.invited) || 0} />
        <Stat label="امتیاز از دعوت" value={Number(referral?.earned_points) || 0} />
      </div>
      {link ? (
        <ActionButton tone="ink" icon="solar:share-linear" fullWidth onPress={share}>
          ارسال لینک برای دوستان
        </ActionButton>
      ) : null}
    </Block>
  );
}

function discountLimitText(d: Discount): string {
  const parts = [`${num(d.percent)}٪ تخفیف`];
  if (Number(d.min_purchase) > 0) parts.push(`خرید از ${money(d.min_purchase)}`);
  if (d.max_discount != null) parts.push(`حداکثر ${money(d.max_discount)}`);
  if (d.expires_at) parts.push(`تا ${faDigits(formatDateTime(d.expires_at))}`);
  return parts.join("، ");
}

function DiscountsSection({ discounts }: { discounts: Discount[] }) {
  if (!discounts.length) return null;
  return (
    <Block title="کدهای تخفیف من" icon="solar:sale-bold" tone="orange">
      {discounts.map((d) => (
        <CopyRow key={d.code} label={discountLimitText(d)} value={d.code} />
      ))}
      <p className="text-xs text-muted">هنگام خرید سرویس، کد را در بخش «کد تخفیف» وارد کنید.</p>
    </Block>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const amount = Number(entry.amount) || 0;
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg bg-surface/70 p-3">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm text-foreground">{entry.label || "—"}</span>
        <span className="text-xs text-muted">{faDigits(formatDateTime(entry.created_at))}</span>
      </span>
      <span className={`num shrink-0 text-sm font-semibold ${amount < 0 ? "text-danger" : "text-success"}`}>
        <span className="sr-only">{amount < 0 ? "مصرف" : "دریافت"}</span>
        <span aria-hidden>{sign}</span>
        <bdi>{num(Math.abs(amount))}</bdi>
      </span>
    </li>
  );
}

/** Points history with keyset paging: «بیشتر» asks for the entries before the last one shown. */
function HistorySection({ club }: { club: Club }) {
  const { run, busy, notify } = useMini();
  const [items, setItems] = useState<HistoryEntry[]>(club.history ?? []);
  const [hasMore, setHasMore] = useState(Boolean(club.history_more));

  const more = () =>
    run("club-history", async () => {
      const last = items[items.length - 1];
      if (!last) return;
      try {
        const res = await api<{ items?: HistoryEntry[]; has_more?: boolean }>(`/api/mini/club/history?before=${Number(last.id)}`);
        setItems((current) => current.concat(res.items ?? []));
        setHasMore(Boolean(res.has_more));
      } catch (err) {
        notify(err instanceof Error ? err.message : String(err), "err");
      }
    });

  return (
    <Block title="تاریخچهٔ امتیاز" icon="solar:clock-circle-bold" tone="gray">
      {items.length ? (
        <ul className="flex flex-col gap-2">
          {items.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">هنوز امتیازی نگرفته‌اید.</p>
      )}
      {hasMore ? (
        <ActionButton tone="neutral" fullWidth isPending={busy("club-history")} onPress={() => void more()}>
          بیشتر
        </ActionButton>
      ) : null}
    </Block>
  );
}

function PointsHero({ club }: { club: Club }) {
  const next = club.tier?.points_to_next;
  return (
    <HeroCard label="امتیاز شما" chip={club.tier?.name || undefined} value={num(club.points)}>
      {next != null ? <span>{pointsText(next)} تا سطح بعد</span> : null}
      <span>
        امتیاز این ماه: <bdi className="num font-semibold">{num(club.month_points)}</bdi>
      </span>
    </HeroCard>
  );
}

function ClubBody({ club }: { club: Club }) {
  if (!club.enabled) {
    return (
      <>
        <ReferralSection club={club} />
        <p role="status" className="rounded-lg bg-warning/12 p-3 text-sm text-foreground">
          امتیاز و جوایز فعلاً غیرفعال است.
        </p>
      </>
    );
  }
  return (
    <>
      <PointsHero club={club} />
      <ReferralSection club={club} />
      <RewardsSection club={club} />
      <DiscountsSection discounts={club.discounts ?? []} />
      <HistorySection club={club} />
    </>
  );
}

/** Invite club: points and tier, invite link, rewards, discount codes and the points history. */
export function ClubScreen() {
  const resource = useResource<{ club: Club }>("club");
  return (
    <>
      <SectionBadge icon="solar:gift-bold" tone="pink" title="دعوت و جوایز" />
      <Settled resource={resource} rows={4} onRetry={() => invalidateResource("club")}>
        {(data) => <ClubBody club={data.club} />}
      </Settled>
    </>
  );
}
