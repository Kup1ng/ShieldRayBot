/**
 * Waiting for the service to come back after an update, a restore, an SSL switch or a settings
 * save. The authenticated health endpoint tells the running process apart from the old one by
 * its boot id and pid; the pages never trust «the server answered» alone.
 */

export type Health = { boot_id?: string; pid?: number; version?: string };

export type Verdict = "down" | "waiting" | "verifying" | "wrong_version" | "done";

export type RestartWatch = {
  baselineBoot: string | null;
  baselinePid: number | null;
  sawDown: boolean;
  expectedVersion: string;
};

export const RESTART_MESSAGE = "سرویس در حال راه‌اندازی مجدد است — ممکن است چند دقیقه طول بکشد. از صفحه خارج نشوید و رفرش نکنید.";
export const RESTART_HINT = "در صورت نیاز روی سرور اجرا کنید: sudo systemctl restart pgclockbot";
export const STAY_WARNING = "لطفاً تا پایان عملیات از این صفحه خارج نشوید و صفحه را رفرش نکنید.";
const SLOW_RESTART_MS = 180_000;
const POLL_MS = 1500;

export function newWatch(preBootId: string | null | undefined, expectedVersion = ""): RestartWatch {
  const expected = expectedVersion.trim();
  return {
    baselineBoot: preBootId ? String(preBootId) : null,
    baselinePid: null,
    sawDown: false,
    expectedVersion: expected === "—" || expected === "-" ? "" : expected,
  };
}

/** The baseline is whatever the old process reported before it went down. */
export function learnBaseline(watch: RestartWatch, health: Health | null): void {
  if (!health) return;
  if (!watch.baselineBoot && health.boot_id) watch.baselineBoot = String(health.boot_id);
  if (health.pid) watch.baselinePid = Number(health.pid);
}

export function processChanged(watch: RestartWatch, health: Health | null): boolean {
  if (!health) return false;
  if (watch.baselineBoot && health.boot_id && String(health.boot_id) !== watch.baselineBoot) return true;
  if (watch.baselinePid && health.pid && Number(health.pid) !== watch.baselinePid) return true;
  // The old process was already gone before we could learn its identity: any answer after a
  // downtime is the new one.
  return !watch.baselineBoot && !watch.baselinePid && watch.sawDown;
}

export function versionMatches(watch: RestartWatch, health: Health | null): boolean {
  if (!watch.expectedVersion) return true;
  return Boolean(health?.version) && String(health?.version).trim() === watch.expectedVersion;
}

/** Judge one probe; remembers that the service was seen down. */
export function judge(watch: RestartWatch, health: Health | null): Verdict {
  if (!health) {
    watch.sawDown = true;
    return "down";
  }
  const changed = processChanged(watch, health);
  if (!changed) return watch.sawDown ? "verifying" : "waiting";
  return versionMatches(watch, health) ? "done" : "wrong_version";
}

export function verdictMessage(verdict: Verdict, watch: RestartWatch, elapsedMs: number, currentVersion?: string): string {
  switch (verdict) {
    case "down":
      return elapsedMs > SLOW_RESTART_MS ? `${RESTART_MESSAGE} ${RESTART_HINT}` : RESTART_MESSAGE;
    case "waiting":
      return `منتظر راه‌اندازی مجدد…${watch.expectedVersion ? ` نسخهٔ هدف: ${watch.expectedVersion}` : ""}`;
    case "verifying":
      return "سرویس برگشت؛ در حال تأیید…";
    case "wrong_version":
      return `منتظر نسخهٔ ${watch.expectedVersion || "جدید"} (الان: ${currentVersion || "—"})…`;
    default:
      return "";
  }
}

/** The authenticated diagnostics; null while the service is down or answers something else. */
export async function probeHealth(): Promise<Health | null> {
  try {
    const res = await fetch(`/health/detail?_=${Date.now()}`, { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return null;
    return (await res.json()) as Health;
  } catch {
    return null;
  }
}

export type WaitOptions = {
  preBootId?: string | null;
  expectedVersion?: string;
  signal: AbortSignal;
  onState: (state: { verdict: Verdict; message: string }) => void;
  /** Called while the old process still answers; return true to stop waiting (the job reported something else). */
  onWaiting?: () => Promise<boolean>;
  probe?: () => Promise<Health | null>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  intervalMs?: number;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Resolves with the new process's health, or null when aborted or stopped by `onWaiting`. */
export async function waitForRestart(options: WaitOptions): Promise<Health | null> {
  const { signal, onState, onWaiting, probe = probeHealth, sleep = defaultSleep, now = Date.now, intervalMs = POLL_MS } = options;
  const watch = newWatch(options.preBootId, options.expectedVersion);
  const startedAt = now();
  onState({ verdict: "down", message: RESTART_MESSAGE });
  const first = await probe();
  if (signal.aborted) return null;
  learnBaseline(watch, first);
  if (!first) watch.sawDown = true;
  if (options.preBootId && first && processChanged(watch, first) && versionMatches(watch, first)) return first;
  while (!signal.aborted) {
    await sleep(intervalMs);
    if (signal.aborted) return null;
    const health = await probe();
    if (signal.aborted) return null;
    const verdict = judge(watch, health);
    if (verdict === "done") return health;
    onState({ verdict, message: verdictMessage(verdict, watch, now() - startedAt, health?.version) });
    if (verdict === "waiting" && onWaiting && (await onWaiting())) return null;
  }
  return null;
}
