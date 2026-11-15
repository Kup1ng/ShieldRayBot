"use client";

import type { ReactNode } from "react";

import { clampPercent, type Change } from "./format";
import type { TileState, Tone } from "./types";

/** A link that looks like a small button (navigation is a link, never a scripted click). */
export function LinkButton({
  href,
  children,
  tone = "outline",
  className = "",
}: {
  href: string;
  children: ReactNode;
  tone?: "outline" | "ink" | "ghost";
  className?: string;
}) {
  const look =
    tone === "ink"
      ? "button--ink border-transparent"
      : tone === "ghost"
        ? "border-transparent bg-transparent text-foreground hover:bg-surface"
        : "border-border bg-surface text-foreground hover:bg-surface-secondary";
  return (
    <a
      href={href}
      className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-focus ${look} ${className}`}
    >
      {children}
    </a>
  );
}

const CHANGE_STYLE: Record<Change["direction"], string> = {
  up: "text-success",
  down: "text-danger",
  flat: "text-muted",
};

export function ChangeLine({ change }: { change: Change }) {
  return <span className={`text-xs ${CHANGE_STYLE[change.direction]}`}>{change.text}</span>;
}

const TILE_STATE: Record<TileState, { dot: string; label: string }> = {
  ok: { dot: "bg-success", label: "سالم" },
  warn: { dot: "bg-warning", label: "هشدار" },
  err: { dot: "bg-danger", label: "مشکل" },
  neutral: { dot: "bg-muted", label: "نامشخص" },
};

export function StateDot({ state }: { state: TileState }) {
  const { dot, label } = TILE_STATE[state];
  return <span role="img" aria-label={label} className={`inline-block size-2.5 shrink-0 rounded-full ${dot}`} />;
}

/** Maps the server's meter and badge tones onto the semantic colours. */
export function toneOf(name: string | null | undefined): Tone {
  switch (name) {
    case "ok":
    case "connected":
    case "active":
      return "success";
    case "warn":
    case "caution":
    case "warning":
      return "warning";
    case "err":
    case "danger":
      return "danger";
    default:
      return "default";
  }
}

const BAR_TONE: Record<Tone, string> = {
  default: "bg-muted",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

/** A horizontal meter: label and value above, a filled track below. */
export function MeterBar({
  label,
  value,
  percent,
  tone,
  hint,
}: {
  label: string;
  value: ReactNode;
  percent: number | null;
  tone: Tone;
  hint?: ReactNode;
}) {
  const filled = clampPercent(percent);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-muted">{label}</span>
        <span className="num text-sm font-semibold text-foreground">{value}</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(filled)}
        className="h-2 w-full overflow-hidden rounded-full bg-default"
      >
        <div className={`h-full rounded-full transition-[width] duration-300 ${BAR_TONE[tone]}`} style={{ width: `${filled}%` }} />
      </div>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  );
}
