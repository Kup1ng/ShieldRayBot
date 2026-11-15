import { statusTone, type Tone } from "../../ui/status";
import type { ServiceRow } from "./types";

/** Cancelled and pending-cancellation win over the panel status. */
export function serviceTone(s: ServiceRow): Tone {
  if (s.is_cancelled) return "danger";
  if (s.cancellation_pending) return "warning";
  return statusTone(s.status);
}

const DOT: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  default: "bg-muted",
};

/** The small coloured status dot beside a service name (Figma "Service view" / "My services"). */
export function ServiceDot({ service }: { service: ServiceRow }) {
  return <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${DOT[serviceTone(service)]}`} />;
}
