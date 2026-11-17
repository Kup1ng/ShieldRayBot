"use client";

import { useState } from "react";

import type { CustomerSummary } from "../../types";
import { cleanServiceName, serviceNameProblem } from "./serviceName";

/**
 * The required service name of a purchase: what the customer typed, whether the field may still
 * change, and the value to send. `check()` is called when the customer tries to pay.
 */
export function useServiceName(options: CustomerSummary["checkout"], notify: (text: string, tone: "err") => void) {
  const required = Boolean(options?.service_name_required);
  const [value, setValue] = useState("");
  const [tried, setTried] = useState(false);
  // Once an order carries its name (a payment started, or its start may have gone through) it must not change.
  const [pinned, setPinned] = useState(false);

  /** True when the name may be sent; otherwise says why not and returns false. */
  const check = (): boolean => {
    if (!required) return true;
    const problem = serviceNameProblem(value);
    if (!problem) return true;
    setTried(true);
    notify(problem, "err");
    return false;
  };

  return {
    required,
    value,
    setValue,
    tried,
    pinned,
    pin: () => setPinned(true),
    unpin: () => setPinned(false),
    check,
    /** The body field(s) to add to a purchase request: only where the shop requires a name. */
    field: (): { service_name?: string } => (required ? { service_name: cleanServiceName(value) } : {}),
    /** A purchase finished: the next one starts with an empty field. */
    clear: () => {
      setValue("");
      setTried(false);
      setPinned(false);
    },
  };
}
