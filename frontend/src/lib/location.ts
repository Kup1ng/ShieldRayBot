"use client";

import { useSyncExternalStore } from "react";

export type PageLocation = { path: string; search: string };

const EMPTY: PageLocation = { path: "", search: "" };
let cached: PageLocation = EMPTY;

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function snapshot(): PageLocation {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const search = window.location.search;
  if (cached.path !== path || cached.search !== search) cached = { path, search };
  return cached;
}

/**
 * The page's path (without a trailing slash) and query, read safely during hydration: the
 * static export renders with an empty location, the browser then supplies the real one.
 */
export function useLocation(): PageLocation {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}
