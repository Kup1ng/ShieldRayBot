"use client";

import { Segment } from "@heroui-pro/react";
import { ChartTooltip } from "@heroui-pro/react";
import { AreaChart } from "@heroui-pro/react/area-chart";
import { useId, useMemo, useState } from "react";
import type { Key } from "react-aria-components";

import { compactToman, fa } from "../../core/format";
import { useJson } from "../../core/data";
import { GlassSection } from "../../ui/Page";
import { ErrorBlock, LoadingBlock } from "../../ui/States";
import { dayLabel, describeChange } from "./format";
import type { SalesTrend } from "./types";
import { ChangeLine } from "./ui";

type Range = 7 | 30;
const RANGES: { id: Range; label: string; compare: string }[] = [
  { id: 7, label: "۷ روز", compare: "نسبت به هفتهٔ قبل" },
  { id: 30, label: "۳۰ روز", compare: "نسبت به ماه قبل" },
];

type Point = { key: string; label: string; revenue: number; orders: number };

export function chartPoints(trend: SalesTrend, range: Range): Point[] {
  const last = trend.days.length - 1;
  return trend.days.map((day, index) => ({
    key: day.date,
    label: index === last ? "امروز" : dayLabel(day, range),
    revenue: day.revenue,
    orders: day.orders,
  }));
}

/**
 * The shop's sales over the last 7 or 30 days. The week arrives with the page; the month is read
 * from /home/sales-trend when asked for and kept. The oldest day sits at the right edge, as Persian
 * text reads.
 */
export function SalesChart({ initial, title = "فروش", noun = "تومان" }: { initial: SalesTrend | null; title?: string; noun?: string }) {
  const [range, setRange] = useState<Range>(7);
  // The month is read the first time it is asked for; the answer then stays for switching back.
  const [monthWanted, setMonthWanted] = useState(false);
  const month = useJson<SalesTrend>(monthWanted ? "/home/sales-trend?days=30" : null);
  const gradient = `sales-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const trend = range === 7 ? initial : month.data;
  const failed = range === 30 && month.status === "error" ? month.message : "";
  const loading = range === 30 && month.status === "loading";
  const points = useMemo(() => (trend ? chartPoints(trend, range) : []), [trend, range]);
  const compare = RANGES.find((r) => r.id === range)?.compare ?? "";
  const change = trend ? describeChange(trend.change_pct, compare, range === 7 ? "هفتهٔ قبل فروشی نبود" : "ماه قبل فروشی نبود") : null;

  const choose = (key: Key) => {
    const next: Range = Number(key) === 30 ? 30 : 7;
    if (next === 30) setMonthWanted(true);
    setRange(next);
  };

  return (
    <GlassSection
      title={title}
      actions={
        <Segment size="sm" selectedKey={String(range)} onSelectionChange={choose} aria-label="بازهٔ نمودار">
          {RANGES.map((r) => (
            <Segment.Item key={r.id} id={String(r.id)}>
              {r.label}
            </Segment.Item>
          ))}
        </Segment>
      }
    >
      {failed ? (
        <ErrorBlock message={failed} onRetry={month.reload} />
      ) : !trend || loading ? (
        <LoadingBlock rows={1} height="h-56" />
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <strong className="num text-2xl font-bold text-foreground">
              {fa(trend.total)} <span className="text-sm font-medium text-muted">{noun}</span>
            </strong>
            {change ? <ChangeLine change={change} /> : null}
          </div>
          {trend.has_data ? (
            <div role="img" aria-label={`${title} ${range === 7 ? "۷" : "۳۰"} روز اخیر؛ جمع ${fa(trend.total)} ${noun}`} dir="ltr" className="num">
              <AreaChart data={points} height={240} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <AreaChart.Grid vertical={false} />
                <AreaChart.XAxis dataKey="label" reversed tickMargin={8} minTickGap={14} />
                <AreaChart.YAxis orientation="right" width={64} tickFormatter={(value: number) => (value ? compactToman(value) : fa(0))} />
                <AreaChart.Area dataKey="revenue" name={title} type="monotone" stroke="var(--chart-3)" strokeWidth={2} fill={`url(#${gradient})`} dot={false} />
                <AreaChart.Tooltip
                  content={({ active, label, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as Point | undefined;
                    return (
                      <ChartTooltip>
                        <ChartTooltip.Header>{label}</ChartTooltip.Header>
                        <ChartTooltip.Item>
                          <ChartTooltip.Indicator color={payload[0]?.stroke} />
                          <ChartTooltip.Label>{title}</ChartTooltip.Label>
                          <ChartTooltip.Value>
                            {fa(Number(payload[0]?.value))} {noun}
                          </ChartTooltip.Value>
                        </ChartTooltip.Item>
                        {row ? (
                          <ChartTooltip.Item>
                            <ChartTooltip.Label>سفارش</ChartTooltip.Label>
                            <ChartTooltip.Value>{fa(row.orders)}</ChartTooltip.Value>
                          </ChartTooltip.Item>
                        ) : null}
                      </ChartTooltip>
                    );
                  }}
                />
              </AreaChart>
            </div>
          ) : (
            <p className="rounded-lg bg-default/50 px-4 py-10 text-center text-sm text-muted">هنوز فروشی در این بازه ثبت نشده است.</p>
          )}
        </>
      )}
    </GlassSection>
  );
}
