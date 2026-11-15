"use client";

import { toast } from "@heroui/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useLocation } from "@/lib/location";

import { panelGet, safeMessage } from "./api";

export type Loaded<T> =
  | { status: "loading"; data: T | null }
  | { status: "error"; data: T | null; message: string }
  | { status: "ready"; data: T };

export type Resource<T> = Loaded<T> & { reload: () => void };

type JsonOptions = {
  /** Keep the old answer on screen while a changed path loads (filters, pages) instead of the skeleton. */
  keepPrevious?: boolean;
};

/** Where a data endpoint sends staff who do not belong on this page (only same-site paths are followed). */
export function redirectTarget(data: unknown): string | null {
  const target = (data as { redirect?: unknown } | null)?.redirect;
  return typeof target === "string" && target.startsWith("/") && !target.startsWith("//") ? target : null;
}

/**
 * GET a panel JSON endpoint. `reload` re-reads it without dropping what is shown (after an action),
 * a late answer for an old path is ignored, and a `{redirect: "/path"}` answer moves to that page.
 * A null path reads nothing.
 */
export function useJson<T>(path: string | null, { keepPrevious = false }: JsonOptions = {}): Resource<T> {
  const [state, setState] = useState<Loaded<T>>({ status: "loading", data: null });
  const [tick, setTick] = useState(0);
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    const fresh = lastPath.current !== path;
    lastPath.current = path;
    // Resetting to the loading state when the address changes is the point of this effect.
    if (fresh) setState((prev) => ({ status: "loading", data: keepPrevious ? prev.data : null }));
    panelGet<T>(path, { signal: controller.signal })
      .then((data) => {
        const target = redirectTarget(data);
        if (target) window.location.assign(target);
        else setState({ status: "ready", data });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState((prev) => ({ status: "error", data: prev.data, message: err instanceof Error ? err.message : String(err) }));
      });
    return () => controller.abort();
  }, [path, tick, keepPrevious]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { ...state, reload };
}

export type QueryState = {
  get: (key: string) => string;
  set: (patch: Record<string, string | null>, options?: { replace?: boolean }) => void;
};

/** Query-string state (tab, filter, page, search) kept in the address; changing it never reloads the document. */
export function useQuery(): QueryState {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const get = (key: string) => params.get(key) ?? "";
  const set = useCallback((patch: Record<string, string | null>, options: { replace?: boolean } = {}) => {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    const url = window.location.pathname + (query ? `?${query}` : "");
    if (options.replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    // pushState is silent; subscribers of useLocation listen for popstate.
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);
  return { get, set };
}

const FLASH_KEYS = ["ok", "err", "error", "saved", "msg", "_"];

/**
 * A message a handler left in the address (?err=, ?ok=, ?saved=1&msg=): shown once as a toast and
 * removed from the address (with the cache-busting `_` the server adds) so a reload does not repeat it. `ok=1` is only a flag.
 */
export function useUrlFlash(): void {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!FLASH_KEYS.some((key) => params.has(key))) return;
    const error = safeMessage(params.get("err") ?? params.get("error"), "");
    const okRaw = params.get("ok");
    const okText = okRaw === "1" ? "انجام شد." : okRaw;
    const notice = safeMessage(okText ?? (params.get("saved") ? params.get("msg") || "ذخیره شد." : ""), "");
    if (error) toast.danger(error);
    else if (notice) toast.success(notice);
    FLASH_KEYS.forEach((key) => params.delete(key));
    const query = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : ""));
  }, []);
}

/** The numeric id in a detail page's address, e.g. 12 in /users/12/edit (the export serves one HTML per route). */
export function pathId(path: string, pattern: RegExp): number | null {
  const match = pattern.exec(path);
  const id = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
