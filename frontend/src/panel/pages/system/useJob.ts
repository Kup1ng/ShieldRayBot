"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { panelGet } from "../../core/api";
import { RESTART_MESSAGE, STAY_WARNING, waitForRestart, type Health } from "./restart";
import type { JobStatus } from "./types";

const POLL_MS = 1500;
const LOST_STATUS_MESSAGE = "خطا در دریافت وضعیت؛ دوباره تلاش می‌شود…";

export type JobPhase = "idle" | "running" | "restarting" | "error" | "done";

/** Where a job is, from the status file the server keeps (update and restore share its shape). */
export function phaseOf(status: JobStatus | null | undefined): JobPhase {
  if (!status) return "idle";
  if (status.awaiting_restart) return "restarting";
  if (status.state === "running") return "running";
  if (status.state === "error" || status.restart_required) return "error";
  if (status.state === "done") return "done";
  return "idle";
}

export function isBusy(phase: JobPhase): boolean {
  return phase === "running" || phase === "restarting";
}

/** Ask the browser to confirm leaving while a long job runs. */
export function useLeaveGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = STAY_WARNING;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);
}

type JobOptions = {
  statusUrl: string;
  /** The status the page loaded with; a running job found there is followed at once. */
  initial: JobStatus | null | undefined;
  /** The version the service must report after the restart (an update to a known release). */
  expectedVersion?: () => string;
  /** The service came back as a new process. */
  onRestarted: (health: Health | null) => void;
  /** The job stopped on its own: finished, failed or went idle. */
  onSettled: (phase: JobPhase, status: JobStatus) => void;
};

export type Job = {
  status: JobStatus | null;
  phase: JobPhase;
  /** What the restart wait shows while the service is down. */
  note: string;
  /** Follow the job from now on (after a start request was accepted or its reply was lost). */
  follow: () => void;
};

/**
 * Follows a long job of the server (panel update, backup restore): polls its status file, then,
 * when it asks for a service restart, waits until a new process answers. Never posts anything,
 * so a lost reply or a reload can only ever read the state again.
 */
export function useJob(options: JobOptions): Job {
  const [status, setStatus] = useState<JobStatus | null>(options.initial ?? null);
  const [following, setFollowing] = useState(() => isBusy(phaseOf(options.initial)));
  const [note, setNote] = useState(RESTART_MESSAGE);
  const latest = useRef(options);
  const statusRef = useRef(status);
  useEffect(() => {
    latest.current = options;
    statusRef.current = status;
  });

  const phase = phaseOf(status);
  // A reloaded page payload is the newest word of the server: adopt it when it changes.
  const initialKey = JSON.stringify(options.initial ?? null);
  const [seenKey, setSeenKey] = useState(initialKey);
  if (seenKey !== initialKey) {
    const fresh = (JSON.parse(initialKey) as JobStatus | null) ?? null;
    setSeenKey(initialKey);
    setStatus(fresh);
    if (isBusy(phaseOf(fresh))) setFollowing(true);
  }

  const settle = useCallback((next: JobStatus) => {
    setFollowing(false);
    latest.current.onSettled(phaseOf(next), next);
  }, []);

  useEffect(() => {
    if (!following || phase === "restarting") return;
    let cancelled = false;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const next = await panelGet<JobStatus>(latest.current.statusUrl);
        if (cancelled) return;
        setStatus(next);
        setNote(RESTART_MESSAGE);
        if (!isBusy(phaseOf(next))) settle(next);
      } catch {
        if (!cancelled) setNote(LOST_STATUS_MESSAGE);
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [following, phase, settle]);

  const preBootId = status?.pre_boot_id ?? null;
  useEffect(() => {
    if (phase !== "restarting") return;
    const controller = new AbortController();
    const watchStatus = async (): Promise<boolean> => {
      try {
        const next = await panelGet<JobStatus>(latest.current.statusUrl);
        if (controller.signal.aborted) return true;
        statusRef.current = next;
        setStatus(next);
        return !next.awaiting_restart;
      } catch {
        return false;
      }
    };
    void waitForRestart({
      preBootId,
      expectedVersion: status?.to_version || latest.current.expectedVersion?.() || "",
      signal: controller.signal,
      onState: (state) => setNote(state.message),
      onWaiting: watchStatus,
    }).then((health) => {
      if (controller.signal.aborted) return;
      const current = statusRef.current;
      if (!health && current && phaseOf(current) === "error") {
        settle(current);
        return;
      }
      setFollowing(false);
      setStatus(null);
      latest.current.onRestarted(health);
    });
    return () => controller.abort();
    // The wait belongs to one restart: it starts when the job turns «awaiting restart» and ends with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, preBootId, settle]);

  useLeaveGuard(isBusy(phase));
  const follow = useCallback(() => setFollowing(true), []);
  return { status, phase, note, follow };
}
