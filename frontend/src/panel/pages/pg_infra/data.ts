"use client";

import { useEffect } from "react";

import { followLocation } from "../../core/actions";
import { useJson, type Resource } from "../../core/data";

/**
 * What a data endpoint answers when the permission check turned the request into a redirect:
 * the panel's JSON layer reports it as `{ok, message, location}` instead of the data.
 */
type Moved = { ok: boolean; message: string; location: string };

export function isMoved(data: unknown): data is Moved {
  if (!data || typeof data !== "object") return false;
  const body = data as Record<string, unknown>;
  return typeof body.location === "string" && Object.keys(body).every((key) => key === "ok" || key === "message" || key === "location");
}

/**
 * `useJson` for the PasarGuard endpoints: a staff member whose access ended while the page was open
 * is taken to the page the server chose for them, and the half-answer never reaches the screen.
 */
export function usePgData<T>(path: string | null): Resource<T> {
  const state = useJson<T | Moved>(path);
  const moved = state.data !== null && isMoved(state.data);
  useEffect(() => {
    if (moved && state.data) followLocation((state.data as Moved).location);
  }, [moved, state.data]);
  if (moved) return { status: "loading", data: null, reload: state.reload };
  return state as Resource<T>;
}
