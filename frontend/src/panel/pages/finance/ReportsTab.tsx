"use client";

import type { ReactNode } from "react";

import { useJson, useQuery } from "../../core/data";
import { fa } from "../../core/format";
import { Ltr } from "../../ui/Data";
import { Loadable } from "../../ui/States";
import { StatTile, GlassSection } from "../../ui/Page";
import type { TileTone } from "@/components/ui/IconTile";
import { TrendCard, seriesFromTrend, type ChartSpec } from "./charts";
import type { FinanceTab, MethodRow, MethodSegment, PeriodStats, ReportsPayload } from "./types";

const PERIODS: { key: "day" | "week" | "month"; label: string }[] = [
  { key: "day", label: "امروز" },
  { key: "week", label: "۷ روز" },
  { key: "month", label: "۳۰ روز" },
];

// One tone per payment-method segment, in the order the server numbers them.
const SEGMENT_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const segmentColor = (tone: number) => SEGMENT_COLORS[(tone - 1) % SEGMENT_COLORS.length];

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num text-sm font-semibold text-foreground">{children}</dd>
    </div>
  );
}

function PeriodCompare({ data, onPick }: { data: ReportsPayload; onPick: (period: string) => void }) {
  return (
    <GlassSection title="مقایسه فروش" description="امروز · ۷ روز · ۳۰ روز — فروش = تحویل‌شده">
      <div className="grid gap-3 sm:grid-cols-3">
        {PERIODS.map(({ key, label }) => {
          const stats: PeriodStats = data.periods[key];
          const active = data.period === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => onPick(key)}
              className={`inset-tile flex flex-col gap-2 rounded-lg p-4 text-start outline-none focus-visible:ring-2 focus-visible:ring-focus ${active ? "ring-2 ring-accent" : "hover:bg-surface"}`}
            >
              <h4 className="text-sm font-semibold text-foreground">{label}</h4>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                <Metric label="درآمد">
                  <Ltr>{fa(stats.revenue)}</Ltr>
                </Metric>
                <Metric label="فروش موفق">{fa(stats.delivered)}</Metric>
                <Metric label="سفارش">{fa(stats.orders)}</Metric>
                <Metric label="کاربر جدید">{fa(stats.new_users)}</Metric>
              </dl>
            </button>
          );
        })}
      </div>
    </GlassSection>
  );
}

function StatLink({ icon, tone, label, value, href }: { icon: string; tone: TileTone; label: string; value: number; href?: string }) {
  const tile = <StatTile icon={icon} tone={tone} label={label} value={fa(value)} />;
  if (!href) return tile;
  return (
    <a href={href} className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-focus">
      {tile}
    </a>
  );
}

function Panels({ data, goTab }: { data: ReportsPayload; goTab: (tab: FinanceTab) => void }) {
  const { active, ops } = data;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <GlassSection title={`فروش — ${data.period_label}`} description="بازه انتخاب‌شده · میانگین روی فروش موفق">
        <div className="grid gap-3">
          <StatTile icon="solar:wallet-money-bold" tone="green" label="مبلغ کل فروش" value={<Ltr>{fa(active.revenue)}</Ltr>} />
          <StatTile icon="solar:cart-large-2-bold" tone="blue" label="تعداد فروش" value={fa(active.delivered)} />
          <StatTile icon="solar:bill-list-bold" tone="purple" label="سفارش ثبت‌شده" value={fa(active.orders)} />
          <StatTile icon="solar:chart-2-bold" tone="orange" label="میانگین فروش" value={<Ltr>{fa(active.avg_order)}</Ltr>} />
        </div>
      </GlassSection>
      <GlassSection title="کاربران" description="موجودی فروشگاه · کاربر جدید در بازه">
        <div className="grid gap-3">
          <StatLink icon="solar:users-group-rounded-bold" tone="blue" label="کاربران کل" value={ops.total_users} />
          <StatLink icon="solar:user-plus-bold" tone="green" label="کاربر اضافه‌شده" value={active.new_users} />
          <StatLink icon="solar:user-block-bold" tone="red" label="مسدود" value={ops.blocked_users} href="/users?filter=blocked" />
          <StatLink icon="solar:user-cross-bold" tone="gray" label="بدون سرویس" value={ops.no_service_users} href="/users?filter=no_service" />
        </div>
      </GlassSection>
      <GlassSection title="عملیات" description="اقدام فوری · لینک به صف‌های مرتبط">
        <div className="grid gap-3">
          <button type="button" onClick={() => goTab("payments")} className="rounded-lg text-start outline-none focus-visible:ring-2 focus-visible:ring-focus">
            <StatTile icon="solar:bill-check-bold" tone="yellow" label="رسید معلق" value={fa(ops.pending_receipts)} />
          </button>
          <StatLink icon="solar:chat-round-dots-bold" tone="teal" label="تیکت باز" value={ops.open_tickets} href="/tickets" />
          <button type="button" onClick={() => goTab("delivery")} className="rounded-lg text-start outline-none focus-visible:ring-2 focus-visible:ring-focus">
            <StatTile icon="solar:box-bold" tone="red" label="تحویل ناموفق" value={fa(ops.delivery_failures)} />
          </button>
          <StatLink icon="solar:clock-circle-bold" tone="orange" label="نزدیک انقضا" value={ops.expiring_services} href="/users?filter=expiring" />
          <StatLink icon="solar:database-bold" tone="pink" label="حجم کم" value={ops.low_volume_services} href="/users?filter=low_volume" />
        </div>
      </GlassSection>
    </div>
  );
}

function ShareBar({ segments }: { segments: MethodSegment[] }) {
  const label = segments.map((s) => `${s.label} ${fa(s.share_pct)}٪`).join("، ");
  return (
    <>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-secondary" role="img" aria-label={`سهم روش‌های پرداخت از فروش: ${label}`}>
        {segments.map((s) => (
          <span key={s.tone} title={`${s.label}: ${fa(s.share_pct)}٪`} style={{ width: `${s.share_pct}%`, background: segmentColor(s.tone) }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {segments.map((s) => (
          <li key={s.tone} className="flex items-center gap-1.5">
            <i aria-hidden className="inline-block size-2.5 rounded-full" style={{ background: segmentColor(s.tone) }} />
            {s.label} <Ltr>{s.share_pct}%</Ltr>
          </li>
        ))}
      </ul>
    </>
  );
}

function MethodsTable({ methods }: { methods: MethodRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="text-start text-xs text-muted">
            <th className="py-2 text-start font-medium">روش</th>
            <th className="py-2 text-start font-medium">تعداد</th>
            <th className="py-2 text-start font-medium">مبلغ</th>
            <th className="py-2 text-start font-medium">سهم از فروش</th>
          </tr>
        </thead>
        <tbody>
          {methods.map((m) => (
            <tr key={m.label} className="border-t border-separator">
              <td className="py-2 font-medium text-foreground">{m.label}</td>
              <td className="num py-2">{fa(m.count)} پرداخت</td>
              <td className="py-2">
                <Ltr>{fa(m.amount)}</Ltr>
              </td>
              <td className="py-2">
                <div className="flex items-center gap-2" role="img" aria-label={`${m.label}: ${fa(m.share_pct)}٪ از فروش`}>
                  <div className="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-surface-secondary" aria-hidden>
                    <i className="block h-full rounded-full bg-accent" style={{ width: `${m.share_pct}%` }} />
                  </div>
                  <small className="num text-xs text-muted">
                    <Ltr>{m.share_pct}%</Ltr>
                  </small>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Report({ data, onPeriod, goTab }: { data: ReportsPayload; onPeriod: (period: string) => void; goTab: (tab: FinanceTab) => void }) {
  const initialRange = data.period === "month" ? "30" : "7";
  const sales: ChartSpec = {
    title: "فروش",
    unit: "تومان",
    extraUnit: "سفارش",
    prevNone: "دورهٔ قبل فروشی نداشت",
    emptyText: "هنوز فروشی در این بازه ثبت نشده است.",
    kind: "area",
    series: { "7": seriesFromTrend(data.sales_trend["7"]), "30": seriesFromTrend(data.sales_trend["30"]) },
  };
  const orders: ChartSpec = {
    title: "سفارش‌ها",
    unit: "سفارش",
    extraUnit: "تحویل‌شده",
    prevNone: "دورهٔ قبل سفارشی نداشت",
    emptyText: "در این بازه سفارشی ثبت نشده است.",
    kind: "bar",
    series: data.charts.orders,
  };
  const users: ChartSpec = {
    title: "کاربران جدید",
    unit: "کاربر",
    prevNone: "دورهٔ قبل کاربر جدیدی نداشت",
    emptyText: "در این بازه کاربر جدیدی اضافه نشده است.",
    kind: "bar",
    series: data.charts.new_users,
  };
  return (
    <div className="flex flex-col gap-4">
      <PeriodCompare data={data} onPick={onPeriod} />
      <TrendCard spec={sales} />
      <div className="grid gap-4 lg:grid-cols-2">
        <TrendCard spec={orders} initialRange={initialRange} />
        <TrendCard spec={users} initialRange={initialRange} />
      </div>
      <Panels data={data} goTab={goTab} />
      {data.payment_methods.length ? (
        <GlassSection title={`روش پرداخت — ${data.period_label}`} description="فقط فروش موفق در بازه">
          {data.method_segments.length ? <ShareBar segments={data.method_segments} /> : null}
          <MethodsTable methods={data.payment_methods} />
        </GlassSection>
      ) : null}
      <p className="text-xs text-muted">
        به‌روزرسانی: <Ltr>{data.generated_at || "—"}</Ltr>
      </p>
    </div>
  );
}

export function ReportsTab({ goTab }: { goTab: (tab: FinanceTab) => void }) {
  const query = useQuery();
  const period = query.get("period");
  const state = useJson<ReportsPayload>(`/api/panel/finance/reports${period ? `?period=${encodeURIComponent(period)}` : ""}`, { keepPrevious: true });
  return (
    <Loadable state={state} rows={6}>
      {(data) => <Report data={data} onPeriod={(next) => query.set({ period: next })} goTab={goTab} />}
    </Loadable>
  );
}
