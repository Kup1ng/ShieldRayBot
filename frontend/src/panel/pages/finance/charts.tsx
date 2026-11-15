"use client";

import { ChartTooltip, Segment } from "@heroui-pro/react";
import { AreaChart } from "@heroui-pro/react/area-chart";
import { BarChart } from "@heroui-pro/react/bar-chart";
import { useState } from "react";

import { fa } from "../../core/format";
import { GlassSection } from "../../ui/Page";
import { changeText, dayLabel } from "./format";
import type { Series, SalesTrend } from "./types";

type RangeKey = "7" | "30";
type Kind = "area" | "bar";

export type ChartSpec = {
  title: string;
  /** What one unit is called in the total and the tooltip («تومان», «سفارش»). */
  unit: string;
  extraUnit?: string;
  prevNone: string;
  emptyText: string;
  kind: Kind;
  series: Record<RangeKey, Series>;
};

/** The sales trend in the same shape as the daily count series (value = revenue, extra = orders). */
export function seriesFromTrend(trend: SalesTrend): Series {
  return {
    days: trend.days.map((d) => ({ date: d.date, weekday: d.weekday, value: d.revenue, extra: d.orders })),
    total: trend.total,
    previous_total: trend.previous_total,
    change_pct: trend.change_pct,
    has_data: trend.has_data,
  };
}

const DELTA_TONE = { up: "text-success", down: "text-danger", flat: "text-muted" } as const;

function Plot({ spec, series, days }: { spec: ChartSpec; series: Series; days: number }) {
  const data = series.days.map((d) => ({ label: dayLabel(d, days), value: d.value, extra: d.extra }));
  const tooltip = ({ active, label, payload }: { active?: boolean; label?: string | number; payload?: readonly { value?: unknown; payload?: { extra?: number } }[] }) => {
    if (!active || !payload?.length) return null;
    const point = payload[0];
    return (
      <ChartTooltip>
        <ChartTooltip.Header>
          {label}
          {spec.extraUnit && point.payload ? ` · ${fa(point.payload.extra)} ${spec.extraUnit}` : ""}
        </ChartTooltip.Header>
        <ChartTooltip.Item>
          <ChartTooltip.Label>{spec.title}</ChartTooltip.Label>
          <ChartTooltip.Value>
            {fa(Number(point.value))} {spec.unit}
          </ChartTooltip.Value>
        </ChartTooltip.Item>
      </ChartTooltip>
    );
  };
  return (
    <div dir="ltr" className="num h-[220px] w-full" role="img" aria-label={`${spec.title}، ${days === 7 ? "۷" : "۳۰"} روز اخیر؛ جمع ${fa(series.total)} ${spec.unit}`}>
      {spec.kind === "area" ? (
        <AreaChart data={data} height={220}>
          <defs>
            <linearGradient id="finance-area-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <AreaChart.Grid vertical={false} />
          <AreaChart.XAxis dataKey="label" tickMargin={8} interval="preserveStartEnd" />
          <AreaChart.YAxis width={48} tickFormatter={(v: number) => fa(v)} />
          <AreaChart.Area dataKey="value" name={spec.title} dot={false} fill="url(#finance-area-fill)" stroke="var(--chart-3)" strokeWidth={2} type="monotone" />
          <AreaChart.Tooltip content={tooltip} />
        </AreaChart>
      ) : (
        <BarChart data={data} height={220}>
          <BarChart.Grid vertical={false} />
          <BarChart.XAxis dataKey="label" tickMargin={8} interval="preserveStartEnd" />
          <BarChart.YAxis width={36} allowDecimals={false} tickFormatter={(v: number) => fa(v)} />
          <BarChart.Bar dataKey="value" name={spec.title} fill="var(--accent)" radius={[6, 6, 0, 0]} />
          <BarChart.Tooltip content={tooltip} />
        </BarChart>
      )}
    </div>
  );
}

/** One daily chart with a 7 / 30 day switch, the total and the change against the period before. */
export function TrendCard({ spec, initialRange = "7" }: { spec: ChartSpec; initialRange?: RangeKey }) {
  const [range, setRange] = useState<RangeKey>(initialRange);
  const series = spec.series[range];
  const days = Number(range);
  const change = changeText(series.change_pct, days, spec.prevNone);
  return (
    <GlassSection
      title={spec.title}
      actions={
        <Segment size="sm" selectedKey={range} onSelectionChange={(key) => setRange(String(key) as RangeKey)} aria-label="بازهٔ نمودار">
          <Segment.Item id="7">۷ روز</Segment.Item>
          <Segment.Item id="30">۳۰ روز</Segment.Item>
        </Segment>
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <strong className="num text-xl text-foreground">
          <bdi dir="ltr">{fa(series.total)}</bdi> {spec.unit}
        </strong>
        <span className={`text-xs ${DELTA_TONE[change.tone]}`}>{change.text}</span>
      </div>
      {series.has_data ? <Plot key={range} spec={spec} series={series} days={days} /> : <p className="py-8 text-center text-sm text-muted">{spec.emptyText}</p>}
    </GlassSection>
  );
}
