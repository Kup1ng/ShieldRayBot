"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../../core/api";
import type { ServiceRow, ServicesPayload } from "./types";

export type ServiceList = {
  items: ServiceRow[];
  /** Cursor for the next page (`before_id`), null at the end. */
  next: number | null;
  status: "loading" | "ready" | "error";
  error: string;
};

const EMPTY: ServiceList = { items: [], next: null, status: "loading", error: "" };

/**
 * Cursor-paged service list for a search text. A new text (or `reset`) starts over; a reply
 * that belongs to an older search or page-set is dropped, like the old `loadServices`.
 */
export function useServiceList(q: string) {
  const [list, setList] = useState<ServiceList>(EMPTY);
  const seq = useRef(0);
  const latest = useRef<ServiceList>(EMPTY);

  const commit = useCallback((next: ServiceList) => {
    latest.current = next;
    setList(next);
  }, []);

  const fetchPage = useCallback(
    async (reset: boolean) => {
      const prev = latest.current;
      if (!reset && (prev.status === "loading" || !prev.next)) return;
      const n = reset ? ++seq.current : seq.current;
      const base: ServiceList = reset ? EMPTY : { ...prev, status: "loading", error: "" };
      commit(base);
      const params = new URLSearchParams();
      if (!reset && prev.next) params.set("before_id", String(prev.next));
      if (q) params.set("q", q);
      const query = params.toString();
      try {
        const data = await api<ServicesPayload>(`/api/mini/services${query ? `?${query}` : ""}`);
        if (n !== seq.current) return;
        commit({ items: base.items.concat(data.items ?? []), next: data.next_before_id || null, status: "ready", error: "" });
      } catch (err) {
        if (n !== seq.current) return;
        commit({ ...base, status: "error", error: err instanceof Error ? err.message : String(err) });
      }
    },
    [commit, q],
  );

  useEffect(() => {
    void fetchPage(true);
    return () => {
      seq.current += 1;
    };
  }, [fetchPage]);

  return {
    list,
    more: useCallback(() => void fetchPage(false), [fetchPage]),
    reset: useCallback(() => void fetchPage(true), [fetchPage]),
  };
}
