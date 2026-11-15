"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { RESTART_MESSAGE, probeHealth, waitForRestart, type Health } from "./restart";
import { useLeaveGuard } from "./useJob";

/** A save that restarts the service (general settings, HTTPS switch): follows it until the new process answers. */
export function useServiceRestart(onBack: (health: Health) => void): {
  waiting: boolean;
  note: string;
  /** Read the running process before the save is posted, so its replacement can be recognised. */
  baseline: () => Promise<string | null>;
  /** Start waiting; `bootId` is what `baseline()` returned. */
  begin: (bootId: string | null) => void;
} {
  const [state, setState] = useState<{ bootId: string | null } | null>(null);
  const [note, setNote] = useState(RESTART_MESSAGE);
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  });

  useEffect(() => {
    if (!state) return;
    const controller = new AbortController();
    void waitForRestart({ preBootId: state.bootId, signal: controller.signal, onState: (next) => setNote(next.message) }).then((health) => {
      if (controller.signal.aborted || !health) return;
      setState(null);
      onBackRef.current(health);
    });
    return () => controller.abort();
  }, [state]);

  useLeaveGuard(state !== null);
  const baseline = useCallback(async () => (await probeHealth())?.boot_id ?? null, []);
  const begin = useCallback((bootId: string | null) => {
    setNote(RESTART_MESSAGE);
    setState({ bootId });
  }, []);
  return { waiting: state !== null, note, baseline, begin };
}
