/** Posts whose JSON answer the screen reads itself (guide media, service import, the bot connection). */

import { FALLBACK_ERROR } from "../core/api";

export type RawAnswer<T> = { status: number; body: T | null };

/** POST a form with the CSRF token; a lost connection answers status 0 and never throws. */
export async function postForm<T>(path: string, fields: Record<string, string | Blob>, csrf: string): Promise<RawAnswer<T>> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  if (csrf && !form.has("csrf_token")) form.append("csrf_token", csrf);
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { Accept: "application/json", "X-Requested-With": "fetch", ...(csrf ? { "X-CSRF-Token": csrf } : {}) },
      body: form,
      credentials: "same-origin",
      cache: "no-store",
    });
    const text = await res.text();
    let body: T | null = null;
    try {
      body = text ? (JSON.parse(text) as T) : null;
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

/** The Persian text of a failed raw answer (an `error` field of the handler, else a safe fallback). */
export function answerError(answer: RawAnswer<{ error?: string; message?: string }>): string {
  const text = answer.body?.error ?? answer.body?.message ?? "";
  return typeof text === "string" && text.trim() && !/^[\x00-\x7F]*$/.test(text) ? text.trim() : FALLBACK_ERROR;
}
