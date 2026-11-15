"use client";

/**
 * Shared, deduplicated reads of /api/mini/* lists. Screens subscribe with `useResource`;
 * callers share one request, and an invalidated request never overwrites newer state.
 */
import { useEffect, useSyncExternalStore } from "react";

import { api } from "../core/api";
import type { Resource, ResourceName } from "../types";

export const ACTIVITY_PAGE = 20;
export const ACTIVITY_MORE = 50;
/** The server's cap on /api/mini/activity?limit (a larger limit is refused with 422). */
export const ACTIVITY_MAX = 50;

let activityLimit = ACTIVITY_PAGE;

const FETCHERS: Record<ResourceName, () => Promise<unknown>> = {
  plans: () => api("/api/mini/plans"),
  activity: () => api(`/api/mini/activity?limit=${activityLimit}`),
  ops: () => api("/api/mini/ops"),
  topup: () => api("/api/mini/topup"),
  support: () => api("/api/mini/support"),
  guides: () => api("/api/mini/guides"),
  club: () => api("/api/mini/club"),
  review: () => api("/api/mini/review"),
};

const LOADING: Resource = { status: "loading" };
const cache = new Map<ResourceName, Resource>();
const inflight = new Map<ResourceName, Promise<Resource>>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Load a resource once; concurrent callers share the same request. */
export function ensureResource(name: ResourceName): Promise<Resource> {
  const current = cache.get(name);
  if (current && current.status === "ready") return Promise.resolve(current);
  const pending = inflight.get(name);
  if (pending) return pending;
  if (!current || current.status !== "loading") {
    cache.set(name, LOADING);
    emit();
  }
  const self: { request?: Promise<Resource> } = {};
  self.request = (async () => {
    let result: Resource;
    try {
      result = { status: "ready", data: await FETCHERS[name]() };
    } catch (err) {
      result = { status: "error", error: err instanceof Error ? err.message : String(err) };
    }
    // An invalidated request must not overwrite newer state.
    if (inflight.get(name) !== self.request) return result;
    inflight.delete(name);
    cache.set(name, result);
    emit();
    return result;
  })();
  inflight.set(name, self.request);
  return self.request;
}

/** Drop a cached resource; the next reader fetches it again. */
export function invalidateResource(name: ResourceName): void {
  cache.delete(name);
  inflight.delete(name);
  emit();
}

export function invalidateAllResources(): void {
  cache.clear();
  inflight.clear();
  emit();
}

/** Drop resources that failed so «تلاش دوباره» refetches only what broke. */
export function invalidateFailedResources(): void {
  for (const [name, value] of cache) {
    if (value.status === "error") {
      cache.delete(name);
      inflight.delete(name);
    }
  }
  emit();
}

export function peekResource<T>(name: ResourceName): Resource<T> | undefined {
  return cache.get(name) as Resource<T> | undefined;
}

/** Load more of the activity list (wallet history). */
export function growActivity(): void {
  activityLimit = Math.min(activityLimit + ACTIVITY_MORE, ACTIVITY_MAX);
  invalidateResource("activity");
}

export function resetActivityLimit(): void {
  activityLimit = ACTIVITY_PAGE;
}

export function currentActivityLimit(): number {
  return activityLimit;
}

/** Subscribe to a resource and start loading it when first read. */
export function useResource<T>(name: ResourceName, enabled = true): Resource<T> {
  const value = useSyncExternalStore(
    subscribe,
    () => cache.get(name) ?? LOADING,
    () => LOADING,
  ) as Resource<T>;
  const missing = !cache.has(name);
  useEffect(() => {
    if (enabled && missing) void ensureResource(name);
  }, [enabled, missing, name]);
  return value;
}
