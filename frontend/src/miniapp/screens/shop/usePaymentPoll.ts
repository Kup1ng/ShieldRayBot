"use client";

import { useEffect, useState } from "react";

import { api } from "../../core/api";
import type { PaymentStatus } from "./orderPay";

/** Figma «ممکن است ۳۰ ثانیه طول بکشد»: ask every 3 s, give up after 30 s. Tests may shorten it. */
export const pollTiming = { intervalMs: 3000, limitMs: 30000 };

export type PollPhase =
  /** Still asking. */
  | "checking"
  /** The order is paid and delivered. */
  | "delivered"
  | "rejected"
  | "expired"
  /** Time ran out while the operator is still reviewing (or the service is being built). */
  | "pending"
  /** Time ran out and the server never got a receipt. */
  | "waiting";

export type PollState = { phase: PollPhase; status: PaymentStatus | null };

/**
 * Follow one payment with read-only GETs. Stops on a final answer, on timeout and on unmount;
 * never sends anything. An answer for another order is ignored, never shown.
 */
export function usePaymentPoll(paymentId: number, orderId: number): PollState {
  const [state, setState] = useState<PollState>({ phase: "checking", status: null });

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    let last: PaymentStatus | null = null;
    const controller = new AbortController();

    const stop = () => {
      alive = false;
      window.clearTimeout(timer);
      window.clearTimeout(deadline);
      controller.abort();
    };

    const finish = (phase: PollPhase) => {
      if (!alive) return;
      stop();
      setState({ phase, status: last });
    };

    const tick = async () => {
      let res: PaymentStatus | null = null;
      try {
        res = await api<PaymentStatus>(`/api/mini/order/payments/${paymentId}`, { signal: controller.signal });
      } catch {
        res = null;
      }
      if (!alive) return;
      if (res && Number(res.order_id) === orderId) {
        last = res;
        if (res.status === "delivered" || res.status === "rejected" || res.status === "expired") {
          finish(res.status);
          return;
        }
        setState({ phase: "checking", status: res });
      }
      timer = window.setTimeout(() => void tick(), pollTiming.intervalMs);
    };

    const deadline = window.setTimeout(() => finish(last?.status === "waiting_receipt" ? "waiting" : "pending"), pollTiming.limitMs);
    void tick();
    return stop;
  }, [paymentId, orderId]);

  return state;
}
