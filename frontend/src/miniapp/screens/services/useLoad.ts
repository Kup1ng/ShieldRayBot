"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Loaded<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; error: string };

/**
 * Load once on mount. `reload()` shows the skeleton again, `reload(true)` refreshes in place
 * (a failed silent reload keeps what is already on screen). A slower, older request never
 * overwrites a newer one.
 */
export function useLoad<T>(load: () => Promise<T>) {
  const [state, setState] = useState<Loaded<T>>({ status: "loading" });
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  const seq = useRef(0);

  const run = useCallback(async (keepOnError: boolean) => {
    const n = ++seq.current;
    try {
      const data = await loadRef.current();
      if (n === seq.current) setState({ status: "ready", data });
    } catch (err) {
      if (n !== seq.current) return;
      const error = err instanceof Error ? err.message : String(err);
      setState((prev) => (keepOnError && prev.status === "ready" ? prev : { status: "error", error }));
    }
  }, []);

  useEffect(() => {
    void run(false);
    return () => {
      seq.current += 1;
    };
  }, [run]);

  const reload = useCallback(
    (silent = false) => {
      if (!silent) setState({ status: "loading" });
      void run(silent);
    },
    [run],
  );

  const replace = useCallback((data: T) => {
    seq.current += 1;
    setState({ status: "ready", data });
  }, []);

  /** Changes part of what is on screen; the change applies to the latest data, never to a copy a sheet kept. */
  const update = useCallback((change: (current: T) => T) => {
    setState((prev) => (prev.status === "ready" ? { status: "ready", data: change(prev.data) } : prev));
  }, []);

  return { state, reload, replace, update };
}
