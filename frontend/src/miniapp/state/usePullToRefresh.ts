"use client";

import { useEffect, useRef, useState } from "react";

/** The page moves half as far as the finger; past ARM_PX a release refreshes. */
export const DAMPING = 0.5;
export const ARM_PX = 64;
const MAX_PX = 96;

export type PullState = { offset: number; armed: boolean; loading: boolean };

/**
 * Pull down at the top of a screen to load it again. Listeners are passive, so scrolling is
 * never blocked; `canStart()` keeps it off while a sheet is open or the app has not loaded.
 */
export function usePullToRefresh(onRefresh: () => Promise<void>, canStart: () => boolean): PullState {
  const [state, setState] = useState<PullState>({ offset: 0, armed: false, loading: false });
  const refreshRef = useRef(onRefresh);
  const canStartRef = useRef(canStart);

  useEffect(() => {
    refreshRef.current = onRefresh;
    canStartRef.current = canStart;
  });

  useEffect(() => {
    let startY: number | null = null;
    let pulled = 0;
    let busy = false;

    const show = (px: number) => {
      pulled = px;
      setState((prev) => ({ ...prev, offset: px, armed: px >= ARM_PX }));
    };
    const reset = () => {
      startY = null;
      pulled = 0;
      setState({ offset: 0, armed: false, loading: false });
    };
    const onStart = (event: TouchEvent) => {
      const single = event.touches.length === 1;
      startY = !busy && single && window.scrollY <= 0 && canStartRef.current() ? event.touches[0].clientY : null;
    };
    const onMove = (event: TouchEvent) => {
      if (startY === null) return;
      const dy = event.touches[0].clientY - startY;
      show(dy > 0 && window.scrollY <= 0 ? Math.min(MAX_PX, dy * DAMPING) : 0);
    };
    const onEnd = async () => {
      if (startY === null) return;
      startY = null;
      if (pulled < ARM_PX) {
        reset();
        return;
      }
      busy = true;
      setState({ offset: ARM_PX, armed: true, loading: true });
      try {
        await refreshRef.current();
      } finally {
        busy = false;
        reset();
      }
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", reset);
    };
  }, []);

  return state;
}
