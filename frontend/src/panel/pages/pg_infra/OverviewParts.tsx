"use client";

import type { ReactNode } from "react";

import { IconTile, type TileTone } from "@/components/ui/IconTile";

import { fa, faPercent } from "../../core/format";
import { Ltr, StatusChip } from "../../ui/Data";
import { GlassSection, StatTile } from "../../ui/Page";
import { MeterBar, toneOf } from "../home/ui";
import { faDigits, partsText, statusColor } from "./format";
import { areaPoints, rateText, sparkPoints, SPARK_H, SPARK_W, type LiveState } from "./live";
import type { NodeCard, OwnerWidgets, Segment, UserCounts } from "./types";

/* ---------- server ---------- */

export function ServerMeters({ host }: { host: NonNullable<LiveState["host"]> }) {
  const cpu = host.cpu_percent;
  const mem = host.memory_percent;
  return (
    <GlassSection title="سرور پاسارگارد" description="پردازنده و حافظهٔ سروری که پاسارگارد روی آن اجرا می‌شود">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="inset-tile rounded-lg p-4">
          <MeterBar
            label="پردازنده"
            value={cpu === null ? "—" : faPercent(Math.round(cpu))}
            percent={cpu}
            tone={toneOf(host.cpu_tone)}
            hint={host.cpu_cores ? `${fa(host.cpu_cores)} هسته` : undefined}
          />
        </div>
        <div className="inset-tile rounded-lg p-4">
          <MeterBar
            label="حافظه"
            value={mem === null ? "—" : faPercent(Math.round(mem))}
            percent={mem}
            tone={toneOf(host.mem_tone)}
            hint={host.memory_ratio_text ? <Ltr>{faDigits(host.memory_ratio_text)}</Ltr> : undefined}
          />
        </div>
      </div>
    </GlassSection>
  );
}

/* ---------- live traffic ---------- */

function RateTile({ label, num, unit, tone }: { label: string; num: string; unit: string; tone: "accent" | "success" }) {
  return (
    <div className="inset-tile flex min-w-0 flex-col gap-1 rounded-lg p-4">
      <span className="flex items-center gap-2 text-xs text-muted">
        <span aria-hidden className={`inline-block size-2 rounded-full ${tone === "accent" ? "bg-accent" : "bg-success"}`} />
        {label}
      </span>
      <strong className="num text-xl font-bold text-foreground">
        <Ltr>{num && num !== "—" ? faDigits(num) : "—"}</Ltr> <span className="text-xs font-medium text-muted">{unit}</span>
      </strong>
    </div>
  );
}

/** The aggregate rate of all nodes and the last five minutes of it. */
export function LiveTraffic({ state }: { state: LiveState }) {
  const peak = Math.max(0, ...state.up, ...state.down);
  const up = sparkPoints(state.up, peak);
  const down = sparkPoints(state.down, peak);
  return (
    <GlassSection
      title="ترافیک زنده"
      description="مجموع همهٔ نودها"
      actions={<StatusChip color={state.stale ? "warning" : "success"}>{state.stale ? "به‌روز نیست" : "زنده"}</StatusChip>}
    >
      <div className="grid grid-cols-2 gap-3">
        <RateTile label="آپلود" num={state.live.rate_up_num} unit={state.live.rate_up_unit} tone="accent" />
        <RateTile label="دانلود" num={state.live.rate_down_num} unit={state.live.rate_down_unit} tone="success" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>۵ دقیقهٔ اخیر</span>
          <span>
            بیشینه <b className="num text-foreground">{state.up.length ? rateText(peak) : "—"}</b>
          </span>
        </div>
        <svg
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="نمودار ترافیک ۵ دقیقهٔ اخیر"
          className="h-24 w-full overflow-visible rounded-lg bg-surface-secondary/40"
        >
          <polygon points={areaPoints(down)} className="fill-success/15" />
          <polygon points={areaPoints(up)} className="fill-accent/15" />
          <polyline points={down} fill="none" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className="stroke-success" />
          <polyline points={up} fill="none" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className="stroke-accent" />
        </svg>
      </div>
    </GlassSection>
  );
}

/* ---------- connection tiles ---------- */

const STATE_DOT: Record<string, { dot: string; label: string }> = {
  ok: { dot: "bg-success", label: "سالم" },
  warn: { dot: "bg-warning", label: "هشدار" },
  err: { dot: "bg-danger", label: "مشکل" },
  neutral: { dot: "bg-muted", label: "نامشخص" },
};

function StateTile({ icon, tone, name, detail, state, href }: { icon: string; tone: TileTone; name: string; detail: ReactNode; state: string; href?: string }) {
  const dot = STATE_DOT[state] ?? STATE_DOT.neutral;
  const body = (
    <>
      <IconTile icon={icon} tone={tone} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold text-foreground">{name}</span>
        <span dir="auto" className="truncate text-xs text-muted">
          {detail}
        </span>
      </span>
      <span role="img" aria-label={dot.label} className={`inline-block size-2.5 shrink-0 rounded-full ${dot.dot}`} />
    </>
  );
  const base = "inset-tile flex items-center gap-3 rounded-lg p-3";
  return href ? (
    <a href={href} className={`${base} outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-focus`}>
      {body}
    </a>
  ) : (
    <div className={base}>{body}</div>
  );
}

export function ConnectionTiles({ data }: { data: OwnerWidgets }) {
  return (
    <GlassSection title="وضعیت پاسارگارد">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StateTile
          icon="solar:server-square-bold"
          tone="purple"
          name="پاسارگارد"
          detail={data.version ? <>نسخهٔ <Ltr>{data.version}</Ltr></> : data.error ? "قطع" : "متصل"}
          state={data.error ? "err" : "ok"}
        />
        <StateTile
          icon="solar:server-bold"
          tone="teal"
          name="نودها"
          detail={`${fa(data.nodes_connected)} از ${fa(data.nodes_total)} متصل`}
          state={data.nodes_state}
          href={data.links.nodes ? "/pg/nodes" : undefined}
        />
        <StateTile icon="solar:users-group-rounded-bold" tone="blue" name="کاربران آنلاین" detail={`${fa(data.counts.online)} نفر`} state={data.counts.online ? "ok" : "neutral"} />
      </div>
    </GlassSection>
  );
}

/* ---------- users ---------- */

function Kpi({ label, value, footer, href, warn }: { label: string; value: ReactNode; footer: ReactNode; href?: string; warn?: boolean }) {
  const body = (
    <>
      <span className="text-xs text-muted">{label}</span>
      <strong className={`num text-2xl leading-8 font-bold ${warn ? "text-warning" : "text-foreground"}`}>{value}</strong>
      <span className="min-h-4 text-xs text-muted">{footer}</span>
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

/** Total, online, active and the users that need attention; «mine» for a shop's own admin. */
export function UserKpis({ counts, mine, usersHref }: { counts: UserCounts; mine: boolean; usersHref?: string }) {
  const attention = counts.expired + counts.limited;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label="شاخص‌های کاربران">
      <Kpi
        label={mine ? "کاربران من" : "کل کاربران"}
        value={fa(counts.total)}
        footer={counts.on_hold ? `${fa(counts.on_hold)} در انتظار شروع` : "همهٔ وضعیت‌ها"}
        href={usersHref}
      />
      <Kpi label="آنلاین" value={fa(counts.online)} footer="همین حالا متصل" />
      <Kpi label="فعال" value={fa(counts.active)} footer={counts.disabled ? `${fa(counts.disabled)} غیرفعال` : "بدون غیرفعال"} />
      <Kpi label="منقضی یا اتمام حجم" value={fa(attention)} warn={attention > 0} footer={`${fa(counts.expired)} منقضی · ${fa(counts.limited)} حجم`} />
    </div>
  );
}

const SEGMENT_COLOR: Record<string, string> = {
  active: "bg-success",
  expired: "bg-danger",
  limited: "bg-warning",
  on_hold: "bg-accent",
  disabled: "bg-muted",
};

/** The share of each user status as one bar and a legend. */
export function ShareBar({ segments }: { segments: Segment[] }) {
  if (!segments.length) return <p className="text-sm text-muted">کاربری ثبت نشده.</p>;
  return (
    <div className="flex flex-col gap-3">
      <div role="img" aria-label="سهم وضعیت کاربران" className="flex h-3 w-full overflow-hidden rounded-full bg-default">
        {segments.map((segment) => (
          <i key={segment.key} className={`h-full ${SEGMENT_COLOR[segment.key] ?? "bg-muted"}`} style={{ width: `${segment.pct}%` }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center gap-2">
            <i aria-hidden className={`inline-block size-2.5 rounded-full ${SEGMENT_COLOR[segment.key] ?? "bg-muted"}`} />
            <span>{segment.label}</span>
            <b className="num">{fa(segment.count)}</b>
            <span className="num text-xs text-muted" dir="ltr">
              {faDigits(String(segment.pct))}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PanelFacts({ facts }: { facts: OwnerWidgets["facts"] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile icon="solar:shield-user-bold" tone="purple" label="ادمین‌ها" value={fa(facts.admins)} />
      <StatTile icon="solar:users-group-rounded-bold" tone="blue" label="گروه‌ها" value={fa(facts.groups)} />
      <StatTile icon="solar:global-bold" tone="green" label="هاست‌ها" value={fa(facts.hosts)} />
      <StatTile icon="solar:server-bold" tone="teal" label="نودها" value={fa(facts.nodes)} />
    </div>
  );
}

/* ---------- nodes ---------- */

function NodeBox({ node }: { node: NodeCard }) {
  return (
    <article className="inset-tile flex min-w-0 flex-col gap-3 rounded-lg p-4" data-node-id={node.id ?? undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <strong dir="auto" className="min-w-0 truncate text-sm text-foreground">
          {node.name || "—"}
        </strong>
        {node.id !== null ? <Ltr className="text-xs text-muted">#{node.id}</Ltr> : null}
        <StatusChip color={statusColor(node.status_kind)}>{node.status_label || node.status || "—"}</StatusChip>
      </div>
      <MeterBar label="پردازنده" value={<Ltr>{faDigits(node.cpu_text)}</Ltr>} percent={node.cpu_percent} tone={toneOf(node.cpu_tone)} />
      <MeterBar label="حافظه" value={<Ltr>{faDigits(node.mem_text)}</Ltr>} percent={node.mem_percent} tone={toneOf(node.mem_tone)} />
      <dl className="flex flex-col gap-1 text-xs">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">ترافیک امروز</dt>
          <dd dir="ltr" className="num text-foreground">
            {partsText(node.traffic_up)} ↑ · {partsText(node.traffic_down)} ↓
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">نرخ زنده</dt>
          <dd dir="ltr" className="num text-foreground">
            {partsText(node.rate_up_parts)} ↑ · {partsText(node.rate_down_parts)} ↓
          </dd>
        </div>
      </dl>
    </article>
  );
}

export function NodeCards({ nodes, canOpen }: { nodes: NodeCard[]; canOpen: boolean }) {
  return (
    <GlassSection title="نودها" actions={canOpen ? <a className="text-sm font-medium text-accent hover:underline" href="/pg/nodes">همه</a> : undefined}>
      {nodes.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {nodes.map((node, index) => (
            <NodeBox key={node.id ?? `i${index}`} node={node} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">نودی نیست.</p>
      )}
    </GlassSection>
  );
}
