"use client";

import { Alert, Button, Tooltip } from "@heroui/react";
import type { ReactNode } from "react";

import { IconTile, type TileTone } from "@/components/ui/IconTile";
import { Icon } from "@/icons/Icon";

import { GlassSection } from "../../ui/Page";
import { fa } from "../../core/format";
import { StatusChip, Ltr } from "../../ui/Data";
import { describeChange } from "./format";
import type { ActionCenter, HomeWidgets, LinkHealth, Meter, PgLimits, Periods, QueueEntry, StatusTile } from "./types";
import { ChangeLine, LinkButton, MeterBar, StateDot, toneOf } from "./ui";

/* ---------- KPI strip ---------- */

function Kpi({ label, value, footer, href, warn }: { label: string; value: ReactNode; footer?: ReactNode; href?: string; warn?: boolean }) {
  const body = (
    <>
      <span className="text-xs text-muted">{label}</span>
      <strong className={`num text-2xl leading-8 font-bold ${warn ? "text-warning" : "text-foreground"}`}>{value}</strong>
      {footer ? <span className="min-h-4 text-xs">{footer}</span> : <span className="min-h-4" />}
    </>
  );
  const base = "inset-tile flex min-w-0 flex-col gap-0.5 rounded-lg p-4";
  return href ? (
    <a href={href} className={`${base} outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-focus`}>
      {body}
    </a>
  ) : (
    <div className={base}>{body}</div>
  );
}

/** Today's figures: sales, new customers, receipts waiting and open tickets (links only where the staff may open them). */
export function KpiStrip({ kpi }: { kpi: HomeWidgets["kpi"] }) {
  const change = kpi.sales_compare ? describeChange(kpi.sales_today_change_pct, "نسبت به دیروز", "دیروز فروشی نبود") : null;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label="شاخص‌های امروز">
      <Kpi
        label="فروش امروز"
        value={
          <>
            {fa(kpi.sales_today)} <span className="text-xs font-medium text-muted">تومان</span>
          </>
        }
        footer={change ? <ChangeLine change={change} /> : null}
      />
      <Kpi label="کاربران جدید" value={fa(kpi.new_users_today)} footer={<span className="text-muted">۷ روز اخیر: {fa(kpi.new_users_week)}</span>} />
      <Kpi
        label="رسید منتظر تأیید"
        value={fa(kpi.pending)}
        warn={kpi.pending > 0}
        href={kpi.links.payments ? "/finance?tab=payments" : undefined}
        footer={kpi.links.payments ? <span className="text-muted">تأیید یا رد پرداخت‌ها</span> : null}
      />
      <Kpi
        label="تیکت باز"
        value={fa(kpi.tickets)}
        warn={kpi.tickets > 0}
        href={kpi.links.tickets ? "/tickets" : undefined}
        footer={kpi.links.tickets ? <span className="text-muted">پشتیبانی کاربران</span> : null}
      />
    </div>
  );
}

/* ---------- Connection tiles ---------- */

const TILE_ICON: Record<string, { icon: string; tone: TileTone }> = {
  bot: { icon: "solar:bot-bold", tone: "blue" },
  pg: { icon: "solar:server-square-bold", tone: "purple" },
  nodes: { icon: "solar:server-bold", tone: "teal" },
};

export function StatusTiles({ tiles }: { tiles: StatusTile[] }) {
  return (
    <GlassSection title="وضعیت اتصال">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="وضعیت اتصال">
        {tiles.map((tile) => {
          const look = TILE_ICON[tile.id] ?? { icon: "solar:server-bold", tone: "gray" as TileTone };
          return (
            <li key={tile.id} data-state={tile.state}>
              <a
                href={tile.href}
                className="inset-tile flex items-center gap-3 rounded-lg p-3 outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-focus"
              >
                <IconTile icon={look.icon} tone={look.tone} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-semibold text-foreground">{tile.name}</span>
                  <span dir="auto" className="truncate text-xs text-muted">
                    {tile.detail}
                  </span>
                </span>
                <StateDot state={tile.state} />
              </a>
            </li>
          );
        })}
      </ul>
    </GlassSection>
  );
}

/* ---------- Link health (owner) ---------- */

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="num font-semibold text-foreground">{children}</dd>
    </div>
  );
}

function ms(value: number | null) {
  return value === null ? "—" : <Ltr>{fa(value)} ms</Ltr>;
}

export function LinkHealthCard({ health }: { health: LinkHealth }) {
  return (
    <GlassSection title="سلامت ارتباط با پاسارگارد" actions={<StatusChip color={health.tone}>{health.label}</StatusChip>}>
      <div className="grid gap-3 md:grid-cols-3">
        <dl className="inset-tile flex flex-col gap-2 rounded-lg p-4">
          <dt className="text-xs font-semibold text-muted">زمان پاسخ</dt>
          <Fact label="معمول (میانه)">{ms(health.latency_p50_ms)}</Fact>
          <Fact label="کندترین (۹۵٪)">{ms(health.latency_p95_ms)}</Fact>
        </dl>
        <dl className="inset-tile flex flex-col gap-2 rounded-lg p-4">
          <dt className="text-xs font-semibold text-muted">آخرین وضعیت</dt>
          <Fact label="پاسخ موفق">{health.last_ok_time ? <><Ltr>{health.last_ok_time}</Ltr> (تهران)</> : "—"}</Fact>
          <Fact label="آخرین خطا">{health.last_failure_time ? <><Ltr>{health.last_failure_time}</Ltr> (تهران)</> : "—"}</Fact>
          {health.paused ? <Fact label="تلاش دوباره">{fa(health.retry_in_sec)} ثانیه دیگر</Fact> : null}
        </dl>
        <dl className="inset-tile flex flex-col gap-2 rounded-lg p-4">
          <dt className="text-xs font-semibold text-muted">خطاهای یک ساعت اخیر</dt>
          {health.recent_failures.length ? (
            health.recent_failures.map((row) => (
              <Fact key={row.label} label={row.label}>
                {fa(row.count)}
              </Fact>
            ))
          ) : (
            <Fact label="خطا">ندارد</Fact>
          )}
        </dl>
      </div>
      <p className="text-xs text-muted">آمار همین سرور از آخرین راه‌اندازی؛ با هر ری‌استارت از صفر شروع می‌شود.</p>
    </GlassSection>
  );
}

/* ---------- PasarGuard account limits ---------- */

function QuotaMeter({ meter, label }: { meter: Meter; label: string }) {
  const tone = meter.exhausted ? "danger" : toneOf(meter.tone);
  return (
    <div className="inset-tile rounded-lg p-4">
      <MeterBar
        label={label}
        value={meter.has_limit ? <Ltr>{meter.ratio_text}</Ltr> : <Ltr>{meter.used_text}</Ltr>}
        percent={meter.has_limit ? meter.pct : 0}
        tone={tone}
        hint={meter.has_limit ? `باقی‌مانده ${meter.remain_text}` : "بدون سقف"}
      />
    </div>
  );
}

export function PgLimitsCard({ limits }: { limits: PgLimits }) {
  return (
    <GlassSection
      title="سقف حساب پاسارگارد"
      description={limits.username ? <Ltr>{limits.username}</Ltr> : undefined}
      actions={limits.status_label ? <StatusChip color={toneOf(limits.status_badge)}>{limits.status_label}</StatusChip> : undefined}
    >
      {limits.users || limits.traffic ? (
        <div className="grid gap-3 md:grid-cols-2">
          {limits.users ? <QuotaMeter meter={limits.users} label="کاربران" /> : null}
          {limits.traffic ? <QuotaMeter meter={limits.traffic} label="حجم" /> : null}
        </div>
      ) : null}
      {limits.constraints.length ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {limits.constraints.map((box) => (
            <div key={box.label} className="inset-tile flex flex-col gap-0.5 rounded-lg p-3">
              <span className="text-xs text-muted">{box.label}</span>
              <span className="text-sm font-semibold text-foreground">{box.value_text}</span>
            </div>
          ))}
        </div>
      ) : null}
      {limits.lifetime_text ? (
        <p className="text-sm text-muted">
          مصرف lifetime: <Ltr className="font-semibold text-foreground">{limits.lifetime_text}</Ltr>
        </p>
      ) : null}
    </GlassSection>
  );
}

/* ---------- Portals ---------- */

function Portal({ href, icon, tone, title, caption }: { href: string; icon: string; tone: TileTone; title: string; caption: string }) {
  return (
    <a
      href={href}
      className="glass flex items-center gap-3 rounded-xl p-4 outline-none hover:bg-surface/60 focus-visible:ring-2 focus-visible:ring-focus"
    >
      <IconTile icon={icon} tone={tone} size="lg" />
      <span className="flex min-w-0 flex-1 flex-col">
        <strong className="text-sm text-foreground">{title}</strong>
        <span className="text-xs text-muted">{caption}</span>
      </span>
      <Icon name="solar:alt-arrow-left-linear" size={20} className="text-muted" />
    </a>
  );
}

export function Portals({ portals }: { portals: { bot: boolean; pg: boolean } }) {
  if (!portals.bot && !portals.pg) return null;
  return (
    <nav aria-label="نمای کلی" className="grid gap-3 sm:grid-cols-2">
      {portals.bot ? <Portal href="/dashboard" icon="solar:bot-bold" tone="blue" title="نمای کلی ربات" caption="فروشگاه، کاربران و مالی" /> : null}
      {portals.pg ? <Portal href="/pg" icon="solar:server-square-bold" tone="purple" title="نمای کلی پاسارگارد" caption="نود، کاربر پنل و ظرفیت" /> : null}
    </nav>
  );
}

/* ---------- Work queue ---------- */

const QUEUE_ICON: Record<string, string> = {
  pending: "solar:bill-list-bold",
  delivery: "solar:danger-circle-bold",
  tickets: "solar:ticket-bold",
  expiring: "solar:clock-circle-bold",
  low_volume: "solar:chart-2-bold",
};
const QUEUE_TONE: Record<string, TileTone> = { warn: "yellow", err: "red", neutral: "gray" };

export function QueueRow({ entry, onDismiss }: { entry: QueueEntry; onDismiss: (entry: QueueEntry) => void }) {
  return (
    <li className="inset-tile flex items-center gap-2 rounded-lg p-2">
      <a href={entry.href} className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-focus">
        <IconTile icon={QUEUE_ICON[entry.key] ?? "solar:clock-circle-bold"} tone={QUEUE_TONE[entry.tone] ?? "gray"} />
        <span className="flex min-w-0 flex-1 flex-col">
          <strong dir="auto" className="truncate text-sm text-foreground">
            {entry.title}
          </strong>
          <span dir="auto" className="truncate text-xs text-muted">
            {entry.detail}
          </span>
        </span>
        <span className="text-xs font-medium text-accent">برو</span>
      </a>
      <Tooltip delay={500}>
        <Button isIconOnly size="sm" variant="ghost" aria-label={`حذف اعلان: ${entry.title}`} onPress={() => onDismiss(entry)}>
          <Icon name="solar:close-circle-linear" size={20} />
        </Button>
        <Tooltip.Content>
          <p>حذف اعلان</p>
        </Tooltip.Content>
      </Tooltip>
    </li>
  );
}

export function WorkQueue({ queue, onDismiss }: { queue: ActionCenter; onDismiss: (entry: QueueEntry) => void }) {
  return (
    <GlassSection title="صف کار">
      {queue.has_items ? (
        <ul className="flex flex-col gap-2" aria-label="صف کار">
          {queue.entries.map((entry) => (
            <QueueRow key={entry.key} entry={entry} onDismiss={onDismiss} />
          ))}
        </ul>
      ) : (
        <div role="status" className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <Icon name="solar:check-circle-bold" size={36} className="text-success" />
          <strong className="text-sm text-foreground">صف کار خالی است</strong>
          <span className="max-w-xs text-xs text-muted">الان کاری منتظر شما نیست؛ رسید، خطا یا سرویس رو به انقضا که بیاید، اینجا نشان داده می‌شود.</span>
        </div>
      )}
    </GlassSection>
  );
}

/* ---------- Period sales, account, billing ---------- */

const PERIOD_ROWS: { key: keyof Periods; label: string }[] = [
  { key: "day", label: "امروز" },
  { key: "week", label: "۷ روز" },
  { key: "month", label: "۳۰ روز" },
];

export function PeriodsCard({ periods }: { periods: Periods }) {
  return (
    <GlassSection title="فروش دوره‌ای" description="امروز · ۷ روز · ۳۰ روز">
      <div className="grid gap-3 md:grid-cols-3">
        {PERIOD_ROWS.map(({ key, label }) => {
          const bucket = periods[key];
          return (
            <article key={key} className="inset-tile rounded-lg p-4">
              <h4 className="mb-2 text-sm font-semibold text-foreground">{label}</h4>
              <dl className="flex flex-col gap-1.5">
                <Fact label="سفارش">{fa(bucket.orders)}</Fact>
                <Fact label="خرید موفق">{fa(bucket.delivered)}</Fact>
                <Fact label="درآمد">
                  <Ltr>{fa(bucket.revenue)}</Ltr>
                </Fact>
                <Fact label="کاربر جدید">{fa(bucket.new_users)}</Fact>
              </dl>
            </article>
          );
        })}
      </div>
    </GlassSection>
  );
}

export function AccountCard({ account }: { account: NonNullable<HomeWidgets["account"]> }) {
  return (
    <GlassSection title="حساب من" description="کیف پول همین حساب">
      <p className="num text-2xl font-bold text-foreground">
        <Ltr>{fa(account.balance)}</Ltr> <span className="text-sm font-medium text-muted">تومان</span>
      </p>
      <dl className="grid grid-cols-2 gap-3">
        <div className="inset-tile rounded-lg p-3">
          <dt className="text-xs text-muted">سرویس فعال</dt>
          <dd className="num text-base font-bold text-foreground">{fa(account.services)}</dd>
        </div>
        <div className="inset-tile rounded-lg p-3">
          <dt className="text-xs text-muted">نزدیک‌ترین انقضا</dt>
          <dd className="num text-base font-bold text-foreground">{account.nearest_expiry_days === null ? "—" : `${fa(account.nearest_expiry_days)} روز`}</dd>
        </div>
      </dl>
      {account.user_id ? (
        <div className="flex flex-wrap gap-2">
          <LinkButton href={`/users/${account.user_id}/edit#user-wallet`} tone="ink">
            شارژ
          </LinkButton>
          <LinkButton href={`/users/${account.user_id}/edit#user-services`}>سرویس‌های من</LinkButton>
        </div>
      ) : null}
    </GlassSection>
  );
}

export function BillingCard({ billing }: { billing: NonNullable<HomeWidgets["billing"]> }) {
  return (
    <GlassSection title="کیف پول (PAYG)" description="مصرف ترافیک از همین کیف پول فروشگاهی کسر می‌شود">
      <p className="num text-2xl font-bold text-foreground">
        <Ltr>{fa(billing.balance)}</Ltr> <span className="text-sm font-medium text-muted">تومان</span>
      </p>
      {billing.suspended ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>حساب به‌خاطر موجودی صفر مسدود است</Alert.Title>
          </Alert.Content>
        </Alert>
      ) : null}
    </GlassSection>
  );
}
