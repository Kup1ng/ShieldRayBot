"use client";

import { Chip } from "@heroui/react";

export type Tone = "success" | "warning" | "danger" | "default";

export function isOnHoldStatus(status: unknown): boolean {
  const s = String(status || "").toLowerCase().replace(/-/g, "_");
  return s === "on_hold" || s === "onhold";
}

export function statusTone(status: unknown): Tone {
  const s = String(status || "").toLowerCase();
  if (s === "active") return "success";
  if (s === "limited" || s === "disabled" || isOnHoldStatus(s)) return "warning";
  if (s === "expired") return "danger";
  return "default";
}

const DAYS_DANGER = 1;
const DAYS_WARN = 3;

/** Colour for the days left: red on the last day, amber within three days. */
export function daysTone(days: unknown): Tone {
  if (days === null || days === undefined || days === "" || !Number.isFinite(Number(days))) return "default";
  if (Number(days) <= DAYS_DANGER) return "danger";
  return Number(days) <= DAYS_WARN ? "warning" : "default";
}

export const TONE_TEXT: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  default: "text-muted",
};

type ServiceStatus = {
  is_cancelled?: unknown;
  cancellation_pending?: unknown;
  status?: unknown;
  status_fa?: unknown;
};

/** Cancelled and pending-cancellation win over the panel status. */
export function ServiceStatusChip({ service }: { service: ServiceStatus }) {
  let label = String(service.status_fa || service.status || "—");
  let tone: Tone = statusTone(service.status);
  if (service.is_cancelled) {
    label = "لغوشده";
    tone = "danger";
  } else if (service.cancellation_pending) {
    label = "در انتظار لغو";
    tone = "warning";
  }
  return (
    <Chip size="sm" variant="soft" color={tone === "default" ? "default" : tone}>
      <Chip.Label>{label}</Chip.Label>
    </Chip>
  );
}
