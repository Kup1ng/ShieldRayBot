"use client";

import { Alert, Skeleton, Table } from "@heroui/react";
import { Segment } from "@heroui-pro/react";
import { useEffect, useState, type ReactNode } from "react";

import { useLocation } from "@/lib/location";

import { IconTile, type TileTone } from "@/components/ui/IconTile";

import { panelGet } from "../../core/api";
import { useJson } from "../../core/data";
import { fa } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { Ltr, StatusChip } from "../../ui/Data";
import { GlassSection, PageHeader } from "../../ui/Page";
import { ErrorBlock, LoadingBlock } from "../../ui/States";
import { describeChange } from "./format";
import { SalesChart } from "./SalesChart";
import type { HostGauges, Overview, OverviewRow, PaymentRow, TileState } from "./types";
import { ChangeLine, LinkButton, MeterBar, StateDot, toneOf } from "./ui";

const POLL_MS = 5000;
const MAX_BACKOFF_MS = 60000;

/** CPU and memory of the bot's own server, refreshed while the page is visible (platform owner only). */
function ServerMeters({ initial }: { initial: HostGauges }) {
  const [host, setHost] = useState(initial);

  useEffect(() => {
    let delay = POLL_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const tick = async () => {
      if (!document.hidden) {
        try {
          setHost(await panelGet<HostGauges>("/dashboard/metrics"));
          delay = POLL_MS;
        } catch {
          // A struggling server is asked less often rather than pressed.
          delay = Math.min(delay * 2, MAX_BACKOFF_MS);
        }
      }
      if (!stopped) timer = setTimeout(() => void tick(), delay);
    };
    timer = setTimeout(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const cpu = host.cpu_percent;
  const mem = host.memory_percent;
  return (
    <GlassSection
      title="سرور ربات"
      actions={
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <span aria-hidden className="size-2 animate-pulse rounded-full bg-success" />
          زنده
        </span>
      }
    >
      <div className="grid gap-4 md:grid-cols-2" aria-live="off">
        <div className="inset-tile rounded-lg p-4">
          <MeterBar label="پردازنده" value={cpu === null ? "—" : `${fa(Math.round(cpu))}٪`} percent={cpu} tone={toneOf(host.cpu_tone)} hint={host.cpu_cores ? `${fa(host.cpu_cores)} هسته` : undefined} />
        </div>
        <div className="inset-tile rounded-lg p-4">
          <MeterBar
            label="حافظه"
            value={mem === null ? "—" : `${fa(Math.round(mem))}٪`}
            percent={mem}
            tone={toneOf(host.mem_tone)}
            hint={host.memory_ratio_text ? <Ltr>{host.memory_ratio_text}</Ltr> : undefined}
          />
        </div>
      </div>
    </GlassSection>
  );
}

type Tile = { name: string; detail: string; state: TileState; icon: string; tone: TileTone; href?: string };

function StatusStrip({ tiles }: { tiles: Tile[] }) {
  return (
    <GlassSection title="وضعیت ربات">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="وضعیت ربات">
        {tiles.map((tile) => {
          const inner = (
            <>
              <IconTile icon={tile.icon} tone={tile.tone} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-semibold text-foreground">{tile.name}</span>
                <span dir="auto" className="truncate text-xs text-muted">
                  {tile.detail}
                </span>
              </span>
              <StateDot state={tile.state} />
            </>
          );
          const base = "inset-tile flex items-center gap-3 rounded-lg p-3";
          return (
            <li key={tile.name} data-state={tile.state}>
              {tile.href ? (
                <a href={tile.href} className={`${base} outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-focus`}>
                  {inner}
                </a>
              ) : (
                <div className={base}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </GlassSection>
  );
}

function Kpi({ label, value, footer }: { label: string; value: ReactNode; footer: ReactNode }) {
  return (
    <div className="inset-tile flex min-w-0 flex-col gap-0.5 rounded-lg p-4">
      <span className="text-xs text-muted">{label}</span>
      <strong className="num text-2xl leading-8 font-bold text-foreground">{value}</strong>
      <span className="min-h-4 text-xs">{footer}</span>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 last:border-b-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="num text-sm font-semibold text-foreground">{children}</dd>
    </div>
  );
}

function RecentTable({ label, children, empty, rows }: { label: string; children: ReactNode; empty: string; rows: number }) {
  return rows === 0 ? (
    <p className="rounded-lg bg-default/50 px-4 py-8 text-center text-sm text-muted">{empty}</p>
  ) : (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label={label} className="min-w-[320px]">
          {children}
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

function PaymentsTable({ rows }: { rows: PaymentRow[] }) {
  return (
    <RecentTable label="آخرین پرداخت‌ها" empty="پرداختی ثبت نشده." rows={rows.length}>
      <Table.Header>
        <Table.Column isRowHeader>#</Table.Column>
        <Table.Column>مبلغ</Table.Column>
        <Table.Column>نوع</Table.Column>
        <Table.Column>وضعیت</Table.Column>
      </Table.Header>
      <Table.Body>
        {rows.map((row) => (
          <Table.Row key={row.id} id={row.id}>
            <Table.Cell>
              <Ltr>{row.id}</Ltr>
            </Table.Cell>
            <Table.Cell>
              <Ltr>{fa(row.amount)}</Ltr>
            </Table.Cell>
            <Table.Cell>{row.is_topup ? "شارژ کیف" : "خرید"}</Table.Cell>
            <Table.Cell>
              <StatusChip color={row.tone}>{row.status_label}</StatusChip>
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </RecentTable>
  );
}

function OrdersTable({ rows }: { rows: OverviewRow[] }) {
  return (
    <RecentTable label="آخرین سفارش‌ها" empty="سفارشی ثبت نشده." rows={rows.length}>
      <Table.Header>
        <Table.Column isRowHeader>#</Table.Column>
        <Table.Column>مبلغ</Table.Column>
        <Table.Column>وضعیت</Table.Column>
      </Table.Header>
      <Table.Body>
        {rows.map((row) => (
          <Table.Row key={row.id} id={row.id}>
            <Table.Cell>
              <Ltr>{row.id}</Ltr>
            </Table.Cell>
            <Table.Cell>
              <Ltr>{fa(row.amount)}</Ltr>
            </Table.Cell>
            <Table.Cell>
              <StatusChip color={row.tone}>{row.status_label}</StatusChip>
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </RecentTable>
  );
}

function Figures({ data, selected, onPeriod }: { data: Overview; selected: string; onPeriod: (key: string) => void }) {
  const figures = data.figures;
  const viewer = data.viewer;
  if (!figures) return null;
  const { stats, kpis, deliveries, bot } = figures;
  const periodLabel = data.periods.find((p) => p.key === data.period)?.label ?? "";
  const tiles: Tile[] = [
    { name: "ربات تلگرام", detail: [bot.username ? `@${bot.username}` : "", bot.detail].filter(Boolean).join(" · "), state: bot.state, icon: "solar:bot-bold", tone: "blue" },
    {
      name: "رسید منتظر تأیید",
      detail: stats.pending ? `${fa(stats.pending)} مورد` : "هیچ",
      state: stats.pending ? "warn" : "ok",
      icon: "solar:bill-list-bold",
      tone: "yellow",
      href: viewer.can_payments ? "/finance?tab=payments" : undefined,
    },
    {
      name: "تیکت باز",
      detail: stats.tickets ? `${fa(stats.tickets)} مورد` : "هیچ",
      state: stats.tickets ? "warn" : "ok",
      icon: "solar:ticket-bold",
      tone: "purple",
      href: viewer.can_tickets ? "/tickets" : undefined,
    },
    {
      name: "تحویل ناموفق",
      detail: deliveries ? `${fa(deliveries)} سفارش` : "هیچ",
      state: deliveries ? "err" : "ok",
      icon: "solar:delivery-bold",
      tone: "red",
      href: viewer.can_orders ? "/finance?tab=orders" : undefined,
    },
  ];
  const cmp = data.compare_label;
  return (
    <>
      {data.host ? <ServerMeters initial={data.host} /> : null}
      <StatusStrip tiles={tiles} />
      <GlassSection
        title="عملکرد فروشگاه"
        actions={
          <Segment size="sm" selectedKey={selected} onSelectionChange={(key) => onPeriod(String(key))} aria-label="بازهٔ زمانی">
            {data.periods.map((p) => (
              <Segment.Item key={p.key} id={p.key}>
                {p.label}
              </Segment.Item>
            ))}
          </Segment>
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label={`درآمد ${periodLabel}`}
            value={
              <>
                <Ltr>{fa(kpis.current.revenue)}</Ltr> <span className="text-xs font-medium text-muted">تومان</span>
              </>
            }
            footer={<ChangeLine change={describeChange(kpis.change_pct.revenue, cmp, "دورهٔ قبل فروشی نبود")} />}
          />
          <Kpi
            label="خرید موفق"
            value={fa(kpis.current.delivered)}
            footer={<ChangeLine change={describeChange(kpis.change_pct.delivered, cmp, "دورهٔ قبل خریدی نبود")} />}
          />
          <Kpi
            label="کاربران جدید"
            value={fa(kpis.current.new_users)}
            footer={<ChangeLine change={describeChange(kpis.change_pct.new_users, cmp, "دورهٔ قبل کاربری نیامد")} />}
          />
          <Kpi label="سرویس‌ها" value={fa(stats.services)} footer={<span className="text-muted">همهٔ سرویس‌های فروشگاه</span>} />
        </div>
      </GlassSection>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <SalesChart initial={figures.trend} />
        <GlassSection title="کاربران و فروشگاه">
          <dl className="flex flex-col">
            <Fact label="کل کاربران">{fa(stats.users)}</Fact>
            <Fact label="کل سفارش‌ها">{fa(stats.orders)}</Fact>
            <Fact label="پلن فعال">{fa(stats.plans)}</Fact>
            {viewer.is_platform ? <Fact label="نماینده فعال">{fa(stats.resellers)}</Fact> : <Fact label="درآمد کل"><Ltr>{fa(stats.revenue)}</Ltr></Fact>}
          </dl>
        </GlassSection>
      </div>
      {figures.recent_payments || figures.recent_orders ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {figures.recent_payments ? (
            <GlassSection title="آخرین پرداخت‌ها" actions={<LinkButton href="/finance?tab=payments" tone="ghost">همه</LinkButton>}>
              <PaymentsTable rows={figures.recent_payments} />
            </GlassSection>
          ) : null}
          {figures.recent_orders ? (
            <GlassSection title="آخرین سفارش‌ها" actions={<LinkButton href="/finance?tab=orders" tone="ghost">همه</LinkButton>}>
              <OrdersTable rows={figures.recent_orders} />
            </GlassSection>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="در حال دریافت آمار">
      <Skeleton className="h-28 rounded-xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <GlassSection title="فروش">
        <LoadingBlock rows={1} height="h-56" />
      </GlassSection>
    </div>
  );
}

function OverviewContent() {
  const where = useLocation();
  // The period in the address, until the staff member picks another one on this page.
  const [chosen, setChosen] = useState<string | null>(null);
  const period = chosen ?? new URLSearchParams(where.search).get("period") ?? "";
  const overview = useJson<Overview>(where.path ? `/api/panel/dashboard${period ? `?period=${encodeURIComponent(period)}` : ""}` : null, { keepPrevious: true });
  const data = overview.data;
  const failure = overview.status === "error" ? overview.message : "";

  const choosePeriod = (key: string) => {
    setChosen(key);
    const url = new URL(window.location.href);
    url.searchParams.set("period", key);
    window.history.replaceState(null, "", url);
  };

  return (
    <>
      <PageHeader
        icon="solar:chart-2-bold"
        tone="blue"
        title="نمای کلی ربات"
        description="فروش، کاربران و وضعیت ربات فروشگاه"
        actions={
          data?.viewer.can_settings ? (
            <LinkButton href={data.viewer.settings_href}>تنظیمات ربات</LinkButton>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-6">
        {failure && !data ? (
          <ErrorBlock message={failure} onRetry={overview.reload} />
        ) : !data ? (
          <OverviewSkeleton />
        ) : data.bot_setup_needed ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>ربات تلگرام شما هنوز تنظیم نشده</Alert.Title>
              <Alert.Description>برای راه‌اندازی فروشگاه، توکن ربات اختصاصی را در تنظیمات ثبت کنید.</Alert.Description>
            </Alert.Content>
            <LinkButton href="/shop-settings?tab=bot">تنظیمات ربات تلگرام</LinkButton>
          </Alert>
        ) : !data.viewer.has_shop ? (
          <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>فروشگاهی برای این حساب پیدا نشد</Alert.Title>
              <Alert.Description>نمای کلی ربات فقط برای مدیر اصلی و فروشگاه‌ها نمایش داده می‌شود.</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : (
          <Figures data={data} selected={data.periods.some((p) => p.key === period) ? period : data.period} onPeriod={choosePeriod} />
        )}
        {failure && data ? <ErrorBlock message={failure} onRetry={overview.reload} /> : null}
      </div>
    </>
  );
}

export function BotOverview() {
  return (
    <PanelShell title="نمای کلی ربات">
      <OverviewContent />
    </PanelShell>
  );
}
