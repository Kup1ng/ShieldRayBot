/** Mini App API client: every call carries Telegram's signed initData (and the shop key). */
import { shopKey } from "./launch";
import { getInitData } from "./telegram";

export class ApiError extends Error {
  readonly status: number;
  /** Why the server turned the request away (`X-Mini-Error`), e.g. "expired"; "" if unsaid. */
  readonly code: string;

  constructor(message: string, status: number, code = "") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export const FALLBACK_ERROR = "ارتباط با سرور برقرار نشد؛ دوباره تلاش کنید.";

const STATUS_ERRORS: Record<number, string> = {
  401: "نشست مینی‌اپ منقضی شده؛ مینی‌اپ را ببندید و دوباره باز کنید.",
  403: "این کار برای حساب شما مجاز نیست.",
  404: "مورد درخواستی پیدا نشد.",
  422: "ورودی نامعتبر است.",
};

const ERROR_CODE = /^[a-z_]{1,32}$/;

/** Proxy answers that say nothing about whether the app behind it handled the request. */
const GATEWAY_LOST = new Set([502, 504]);

/** The server's reason header, only when it is one of its short lowercase codes. */
function errorCode(res: Response): string {
  const code = String(res.headers.get("X-Mini-Error") || "");
  return ERROR_CODE.test(code) ? code : "";
}

/** Short Persian server text is shown as is; internal (ASCII) details never are. */
export function errorText(data: unknown, status: number): string {
  const body = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const raw = body ? body.detail ?? body.message : null;
  const detail = typeof raw === "string" ? raw.trim() : "";
  if (detail && detail.length <= 200 && !/^[\x00-\x7F]*$/.test(detail)) return detail;
  return STATUS_ERRORS[status] || FALLBACK_ERROR;
}

let authLostHandler: ((err: ApiError) => void) | null = null;

/** Called whenever the server says this page's Telegram sign-in no longer works. */
export function onAuthLost(handler: ((err: ApiError) => void) | null): void {
  authLostHandler = handler;
}

export type ApiOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** Sent as JSON. */
  body?: unknown;
  /** Sent as is (e.g. a receipt image). */
  raw?: Blob;
  /** Return the response as a Blob (receipt photos). */
  blob?: boolean;
  signal?: AbortSignal;
};

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const hasBody = options.body !== undefined;
  const raw = options.raw;
  const contentType = raw ? raw.type || "application/octet-stream" : hasBody ? "application/json" : null;
  const key = shopKey();
  let res: Response;
  try {
    res = await fetch(path, {
      method: options.method || "GET",
      headers: {
        "X-Telegram-Init-Data": getInitData(),
        ...(key ? { "X-Mini-Shop": key } : {}),
        ...(contentType ? { "Content-Type": contentType } : {}),
      },
      body: raw || (hasBody ? JSON.stringify(options.body) : undefined),
      cache: "no-store",
      credentials: "same-origin",
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(FALLBACK_ERROR, 0);
  }
  const method = options.method || "GET";
  // A gateway error on a write means the request may still have reached the app behind it.
  if (method !== "GET" && GATEWAY_LOST.has(res.status)) throw new ApiError(FALLBACK_ERROR, 0);
  let text: string;
  try {
    if (options.blob && res.ok) return (await res.blob()) as T;
    text = await res.text();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    // The connection dropped while the reply was arriving: the outcome is unknown.
    throw new ApiError(FALLBACK_ERROR, 0);
  }
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = new ApiError(errorText(data, res.status), res.status, errorCode(res));
    if (res.status === 401 && authLostHandler) authLostHandler(err);
    throw err;
  }
  return data as T;
}

/**
 * The request may have reached the server (the connection dropped before a reply), so the
 * caller must show fresh state instead of retrying blindly.
 */
export function isUnknownOutcome(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 0;
}
