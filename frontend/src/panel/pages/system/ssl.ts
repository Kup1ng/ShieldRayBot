/** Logic of the SSL tab: which actions apply, which address is safe to open, and waiting for HTTPS to come up. */

import type { SslPayload } from "./types";

export type SslAction = "issue" | "renew" | "enable" | "disable";

const HTTPS_TRIES_BEFORE_TRUSTING = 5;
const HTTPS_MAX_TRIES = 90;
const HTTPS_POLL_MS = 800;

/** The buttons the form offers for the certificate's state, in the order the old page showed them. */
export function availableActions(ssl: Pick<SslPayload, "has_cert" | "ssl_enabled">): SslAction[] {
  if (!ssl.has_cert) return ["issue"];
  return ssl.ssl_enabled ? ["issue", "renew", "enable", "disable"] : ["issue", "renew", "enable"];
}

export function actionLabel(action: SslAction, ssl: Pick<SslPayload, "has_cert" | "ssl_enabled">): string {
  if (action === "issue") return ssl.has_cert ? "صدور مجدد گواهی" : "دریافت گواهی";
  if (action === "renew") return "تمدید";
  if (action === "enable") return ssl.ssl_enabled ? "اعمال مجدد HTTPS" : "فعال‌سازی HTTPS";
  return "غیرفعال‌سازی HTTPS";
}

/** The origin of a server-supplied HTTPS address, or "" when it is not a plain https URL. */
export function safeHttpsBase(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.origin : "";
  } catch {
    return "";
  }
}

export type HttpsWaitOptions = {
  signal: AbortSignal;
  probe?: (url: string) => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
  maxTries?: number;
};

async function probeUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { cache: "no-store", mode: "cors" });
    return res.ok;
  } catch {
    return false;
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * After HTTPS is switched on the service restarts: wait until the local HTTP address went down at
 * least once (or enough time passed) and the HTTPS address answers. Gives up waiting after about
 * a minute and lets the person try the address anyway.
 */
export async function waitForHttps(base: string, { signal, probe = probeUrl, sleep = defaultSleep, maxTries = HTTPS_MAX_TRIES }: HttpsWaitOptions): Promise<void> {
  if (!base) return;
  let sawDown = false;
  for (let tries = 1; tries <= maxTries && !signal.aborted; tries += 1) {
    await sleep(HTTPS_POLL_MS);
    if (signal.aborted) return;
    if (!(await probe("/health"))) sawDown = true;
    if ((await probe(`${base}/health`)) && (sawDown || tries > HTTPS_TRIES_BEFORE_TRUSTING)) return;
  }
}
