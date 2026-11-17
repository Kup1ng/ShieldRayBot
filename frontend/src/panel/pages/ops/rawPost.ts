/**
 * Post a form to one of the panel's JSON-native endpoints (guide media, service-import checks) and
 * read the whole JSON answer. `panelAction` only keeps `{ok, message, location}`, which is not enough
 * where the answer carries data (the new media list, the verdict on a link).
 */

import { FALLBACK_ERROR } from "../../core/api";

export type JsonAnswer = { ok?: boolean; error?: string; [key: string]: unknown };

export async function postJson(path: string, fields: Record<string, string | Blob>, csrfToken: string): Promise<JsonAnswer> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  if (csrfToken) form.append("csrf_token", csrfToken);
  try {
    const res = await fetch(path, {
      method: "POST",
      body: form,
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json", "X-Requested-With": "fetch", ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}) },
    });
    const data = (await res.json().catch(() => null)) as JsonAnswer | null;
    if (!data) return { ok: false, error: FALLBACK_ERROR };
    return res.ok ? data : { ...data, ok: false };
  } catch {
    return { ok: false, error: FALLBACK_ERROR };
  }
}
