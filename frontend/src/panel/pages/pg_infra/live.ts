"use client";

/** Live figures of the overview: server meters, traffic rates and node cards, polled from /pg/metrics. */

import { useEffect, useState } from "react";

import { panelGet } from "../../core/api";
import { faDigits } from "./format";
import type { HostGauges, LiveRates, Metrics, NodeCard, OwnerWidgets } from "./types";

export const POLL_MS = 5000;
/** After failed polls the wait doubles up to this, so a struggling panel is not pressed. */
export const MAX_BACKOFF_MS = 60000;
export const SAMPLES = 60;
export const SPARK_W = 300;
export const SPARK_H = 60;
const METRICS_PATH = "/pg/metrics";

const RATE_UNITS: [number, string][] = [
  [1, "بایت"],
  [1024, "کیلوبایت"],
  [1024 ** 2, "مگ"],
  [1024 ** 3, "گیگ"],
  [1024 ** 4, "ترابایت"],
];

/** Appends one rate sample (a missing or negative one counts as zero) and keeps the newest `size`. */
export function pushSample(buffer: number[], value: number | null | undefined, size = SAMPLES): number[] {
  const next = buffer.slice(-(size - 1));
  next.push(typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);
  return next;
}

/**
 * Polyline points of the samples on a shared peak. The newest sample sits on the left edge and
 * older ones move right (the chart reads right to left like the page). One sample is drawn as a
 * level line so the chart shows from the first value.
 */
export function sparkPoints(values: number[], peak: number, width = SPARK_W, height = SPARK_H): string {
  if (!values.length) return "";
  const scale = peak > 0 ? peak : 1;
  const y = (v: number) => (height - (Math.min(v, scale) / scale) * (height - 2) - 1).toFixed(1);
  if (values.length === 1) return `0.0,${y(values[0])} ${width.toFixed(1)},${y(values[0])}`;
  const step = width / (SAMPLES - 1);
  const last = values.length - 1;
  return values.map((v, i) => `${(step * (last - i)).toFixed(1)},${y(v)}`).join(" ");
}

/** The line closed down to the bottom edge, for the shaded area under it. */
export function areaPoints(line: string, height = SPARK_H): string {
  if (!line) return "";
  const points = line.split(" ");
  return `${points[0].split(",")[0]},${height} ${line} ${points[points.length - 1].split(",")[0]},${height}`;
}

/** The same amount and units as the server's rate text, for the chart's peak. */
export function rateText(bytes: number | null | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "—";
  const unit = RATE_UNITS.reduce((best, candidate) => (bytes >= candidate[0] ? candidate : best), RATE_UNITS[0]);
  const n = bytes / unit[0];
  const amount = unit[0] === 1 ? String(Math.round(n)) : n >= 100 ? n.toFixed(0) : n >= 10 ? String(Number(n.toFixed(1))) : String(Number(n.toFixed(2)));
  return faDigits(`${amount} ${unit[1]}/ثانیه`);
}

export function backoffDelay(failures: number): number {
  if (!(failures > 0)) return 0;
  return Math.min(POLL_MS * 2 ** (failures - 1), MAX_BACKOFF_MS);
}

export type LiveState = {
  host: HostGauges | null;
  live: LiveRates;
  nodes: NodeCard[];
  up: number[];
  down: number[];
  /** The last poll failed: the figures shown are older than they look. */
  stale: boolean;
};

type Seed = Pick<OwnerWidgets, "host" | "live" | "nodes">;

export function seedState(seed: Seed): LiveState {
  const hasRate = typeof seed.live.rate_up === "number" || typeof seed.live.rate_down === "number";
  return {
    host: seed.host,
    live: seed.live,
    nodes: seed.nodes,
    up: hasRate ? pushSample([], seed.live.rate_up) : [],
    down: hasRate ? pushSample([], seed.live.rate_down) : [],
    stale: false,
  };
}

function hasHost(metrics: Metrics): boolean {
  return typeof metrics.cpu_percent === "number" || typeof metrics.memory_percent === "number";
}

function isMetrics(data: unknown): data is Metrics {
  const body = data as Partial<Metrics> | null;
  return !!body && typeof body === "object" && !!body.live && typeof body.live === "object" && Array.isArray(body.nodes);
}

export function applyMetrics(prev: LiveState, metrics: Metrics): LiveState {
  const hasRate = typeof metrics.live.rate_up === "number" || typeof metrics.live.rate_down === "number";
  return {
    host: hasHost(metrics) ? metrics : prev.host,
    live: metrics.live,
    nodes: metrics.nodes,
    up: hasRate ? pushSample(prev.up, metrics.live.rate_up) : prev.up,
    down: hasRate ? pushSample(prev.down, metrics.live.rate_down) : prev.down,
    stale: false,
  };
}

/**
 * Polls the metrics while the page is visible and keeps the last answer when one fails, waiting
 * longer after each failure. The widgets' own figures seed the state; a reload reseeds it.
 */
export function useLiveMetrics(seed: Seed): LiveState {
  const [state, setState] = useState<LiveState>(() => seedState(seed));
  const [seen, setSeen] = useState(seed);
  if (seen !== seed) {
    setSeen(seed);
    setState(seedState(seed));
  }

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const controller = new AbortController();

    const schedule = (ms: number) => {
      if (!stopped) timer = setTimeout(() => void tick(), ms);
    };
    const tick = async () => {
      if (document.hidden) return schedule(POLL_MS);
      try {
        const metrics = await panelGet<unknown>(METRICS_PATH, { signal: controller.signal });
        if (stopped) return;
        if (!isMetrics(metrics)) throw new Error("unexpected metrics answer");
        failures = 0;
        setState((prev) => applyMetrics(prev, metrics));
      } catch {
        if (stopped) return;
        failures += 1;
        setState((prev) => ({ ...prev, stale: true }));
      }
      schedule(failures > 0 ? backoffDelay(failures) : POLL_MS);
    };

    schedule(POLL_MS);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      controller.abort();
    };
  }, []);

  return state;
}
