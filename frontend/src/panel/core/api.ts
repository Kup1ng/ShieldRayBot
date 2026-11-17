/**
 * Web panel API client. Reads go to JSON endpoints; actions post the panel's existing forms
 * (same fields, same CSRF double-submit token) and get `{ok, message, location}` back — the
 * server turns each handler's redirect into JSON for requests marked `X-Panel-Fetch: 1`.
 */

export const FALLBACK_ERROR = "ارتباط با سرور برقرار نشد؛ دوباره تلاش کنید.";

export class PanelError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PanelError";
    this.status = status;
  }
}

export type ActionResult = { ok: boolean; message: string; location?: string };

const CSRF_COOKIE = "csrf";

let csrfToken = "";

/** The session endpoint hands out the token; the cookie is the fallback (same value). */
export function setCsrfToken(token: string): void {
  csrfToken = token;
}

function currentCsrf(): string {
  if (csrfToken) return csrfToken;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${CSRF_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(CSRF_COOKIE.length + 1)) : "";
}

/** Short Persian server text is shown as is; internal (ASCII) details never are. */
export function safeMessage(raw: unknown, fallback = FALLBACK_ERROR): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  return text && text.length <= 300 && !/^[\x00-\x7F]*$/.test(text) ? text : fallback;
}

/** Sent to /login with ?next= when the session has ended. */
function toLogin(): void {
  const here = window.location.pathname + window.location.search;
  window.location.assign(`/login?next=${encodeURIComponent(here)}`);
}

const BASE_HEADERS = {
  "X-Panel-Fetch": "1",
  "X-Requested-With": "fetch",
  Accept: "application/json",
};

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function messageOf(data: unknown): unknown {
  if (!data || typeof data !== "object") return null;
  const body = data as Record<string, unknown>;
  return body.message ?? body.detail ?? body.error;
}

/** GET a JSON endpoint of the panel. A lost session goes to the login page. */
export async function panelGet<T>(path: string, { signal }: { signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { headers: BASE_HEADERS, credentials: "same-origin", cache: "no-store", signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new PanelError(FALLBACK_ERROR, 0);
  }
  const data = await readJson(res);
  if (res.status === 401) {
    toLogin();
    throw new PanelError(safeMessage(messageOf(data)), 401);
  }
  if (!res.ok) throw new PanelError(safeMessage(messageOf(data)), res.status);
  return data as T;
}

type FormValue = string | number | boolean | Blob | null | undefined | Array<string | number>;

function toFormData(fields: Record<string, FormValue> | FormData): FormData {
  if (fields instanceof FormData) return fields;
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined || value === false) continue;
    if (Array.isArray(value)) value.forEach((v) => form.append(key, String(v)));
    else if (value instanceof Blob) form.append(key, value);
    else form.append(key, value === true ? "1" : String(value));
  }
  return form;
}

/**
 * Post one of the panel's forms. Never retried automatically: a lost reply (status 0) means the
 * action may have happened, so callers reload the screen instead of posting again.
 */
export async function panelAction(path: string, fields: Record<string, FormValue> | FormData = {}): Promise<ActionResult> {
  const form = toFormData(fields);
  const token = currentCsrf();
  if (token && !form.has("csrf_token")) form.append("csrf_token", token);
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { ...BASE_HEADERS, ...(token ? { "X-CSRF-Token": token } : {}) },
      body: form,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new PanelError(FALLBACK_ERROR, 0);
  }
  const data = (await readJson(res)) as Partial<ActionResult> & { auth?: boolean; error?: string } | null;
  if (res.status === 401 || data?.auth === false) {
    toLogin();
    throw new PanelError(safeMessage(data?.message, "نشست شما تمام شده؛ دوباره وارد شوید."), 401);
  }
  if (!res.ok && !data) throw new PanelError(FALLBACK_ERROR, res.status || 0);
  return {
    ok: Boolean(data?.ok) && res.ok,
    message: safeMessage(data?.message ?? data?.error, data?.ok ? "" : FALLBACK_ERROR),
    location: typeof data?.location === "string" ? data.location : undefined,
  };
}

/** POST JSON to a panel JSON endpoint (the few actions that are JSON-native). */
export async function panelJson<T>(path: string, body: unknown): Promise<T> {
  const token = currentCsrf();
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { ...BASE_HEADERS, "Content-Type": "application/json", ...(token ? { "X-CSRF-Token": token } : {}) },
      body: JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new PanelError(FALLBACK_ERROR, 0);
  }
  const data = await readJson(res);
  if (res.status === 401) {
    toLogin();
    throw new PanelError(safeMessage(messageOf(data)), 401);
  }
  if (!res.ok) throw new PanelError(safeMessage(messageOf(data)), res.status);
  return data as T;
}
