"use client";

import { Skeleton, ToggleButton, ToggleButtonGroup, type Key } from "@heroui/react";
import { ChartTooltip } from "@heroui-pro/react";
import { AreaChart } from "@heroui-pro/react/area-chart";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { api } from "../../core/api";
import { faDigits } from "../../core/format";
import { ErrorState } from "../../ui/ScreenState";
import { bytesText, usageTickLabel } from "./serviceFormat";
import type { Loaded } from "./useLoad";

export type UsageRange = "today" | "week" | "month";

export type UsageSeries = {
  range: UsageRange;
  period: "hour" | "day";
  points: { at: string; bytes: number }[];
  total_bytes: number;
  total_text: string;
};

const RANGES: { id: UsageRange; label: string }[] = [
  { id: "today", label: "امروز" },
  { id: "week", label: "هفته اخیر" },
  { id: "month", label: "ماه اخیر" },
];
const CHART_HEIGHT = 168;
/** The same height as a Tailwind class, so loading and empty states do not shift the card. */
const PLOT_HEIGHT_CLASS = "h-[168px]";
// Every label fits a week; a day of hours and a month of days show every fourth or fifth one.
const TICK_INTERVAL: Record<UsageRange, number> = { today: 3, week: 0, month: 4 };

/** Each range is read the first time it is shown and kept, so switching back is instant. */
function useUsageSeries(serviceId: number, range: UsageRange) {
  const [byRange, setByRange] = useState<Partial<Record<UsageRange, Loaded<UsageSeries>>>>({});
  const requested = useRef(new Set<UsageRange>());

  const load = useCallback(
    (which: UsageRange) => {
      requested.current.add(which);
      setByRange((prev) => ({ ...prev, [which]: { status: "loading" } }));
      api<UsageSeries>(`/api/mini/service/${serviceId}/usage?range=${which}`)
        .then((data) => setByRange((prev) => ({ ...prev, [which]: { status: "ready", data } })))
        .catch((err: unknown) =>
          setByRange((prev) => ({ ...prev, [which]: { status: "error", error: err instanceof Error ? err.message : String(err) } })),
        );
    },
    [serviceId],
  );

  useEffect(() => {
    if (!requested.current.has(range)) load(range);
  }, [range, load]);

  return { state: byRange[range] ?? ({ status: "loading" } as const), retry: () => load(range) };
}

function RangePicker({ range, onChange }: { range: UsageRange; onChange: (next: UsageRange) => void }) {
  const choose = (keys: Set<Key>) => {
    const next = RANGES.find((r) => keys.has(r.id));
    if (next) onChange(next.id);
  };
  return (
    <ToggleButtonGroup
      aria-label="بازهٔ نمودار مصرف"
      size="sm"
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={new Set([range])}
      onSelectionChange={choose}
      className="!bg-transparent"
    >
      {RANGES.map((r, index) => (
        <ToggleButton
          key={r.id}
          id={r.id}
          className="!bg-transparent !px-2 text-xs font-medium text-muted data-[selected=true]:!text-accent data-[selected=true]:font-semibold"
        >
          {index > 0 ? <ToggleButtonGroup.Separator /> : null}
          {r.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

type Point = { key: string; label: string; bytes: number };

function UsagePlot({ series }: { series: UsageSeries }) {
  const gradient = `usage-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const points = useMemo<Point[]>(
    () => series.points.map((p) => ({ key: p.at, label: usageTickLabel(p.at, series.period), bytes: p.bytes })),
    [series],
  );
  if (!series.total_bytes) {
    return (
      <p className={`flex items-center justify-center text-center text-sm text-muted ${PLOT_HEIGHT_CLASS}`}>
        در این بازه مصرفی ثبت نشده است.
      </p>
    );
  }
  return (
    <div dir="ltr" className="num">
      <AreaChart data={points} height={CHART_HEIGHT} margin={{ top: 12, right: 12, bottom: 0, left: 12 }}>
        <defs>
          <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <AreaChart.Grid horizontal={false} strokeDasharray="4 4" />
        <AreaChart.XAxis dataKey="label" tickMargin={10} interval={TICK_INTERVAL[series.range]} />
        <AreaChart.Area dataKey="bytes" name="مصرف" type="linear" stroke="var(--accent)" strokeWidth={2} fill={`url(#${gradient})`} dot={false} />
        <AreaChart.Tooltip
          content={({ active, label, payload }) => {
            if (!active || !payload?.length) return null;
            return (
              <ChartTooltip>
                <ChartTooltip.Header>{label}</ChartTooltip.Header>
                <ChartTooltip.Item>
                  <ChartTooltip.Indicator color="var(--accent)" />
                  <ChartTooltip.Label>مصرف</ChartTooltip.Label>
                  <ChartTooltip.Value>{bytesText(Number(payload[0]?.value))}</ChartTooltip.Value>
                </ChartTooltip.Item>
              </ChartTooltip>
            );
          }}
        />
      </AreaChart>
    </div>
  );
}

/** Figma "Service view" usage card: today / last week / last month, the period's total in purple, and the area chart. */
export function UsageChart({ serviceId }: { serviceId: number }) {
  const [range, setRange] = useState<UsageRange>("week");
  const { state, retry } = useUsageSeries(serviceId, range);
  const label = RANGES.find((r) => r.id === range)?.label ?? "";
  const total = state.status === "ready" ? faDigits(state.data.total_text) : "";

  return (
    <section className="inset-tile flex flex-col gap-3 rounded-lg p-4" aria-label="نمودار مصرف سرویس">
      <div className="flex items-center justify-between gap-2">
        <RangePicker range={range} onChange={setRange} />
        {total ? (
          <strong className="text-sm font-bold text-accent" aria-label={`مصرف ${label}: ${total}`}>
            {total}
          </strong>
        ) : null}
      </div>
      {state.status === "loading" ? (
        <Skeleton className={`w-full rounded-lg ${PLOT_HEIGHT_CLASS}`} />
      ) : state.status === "error" ? (
        <ErrorState message={state.error} onRetry={retry} />
      ) : (
        <div role="img" aria-label={`نمودار مصرف ${label}؛ جمع ${total}`}>
          <UsagePlot series={state.data} />
        </div>
      )}
    </section>
  );
}
