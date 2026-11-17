"use client";

import { useCallback, useState } from "react";

import { run } from "../../core/actions";
import type { ActionResult } from "../../core/api";

/** Pending flag + toast + «only continue on success» for one form's post. */
export function useFormSubmit(onSuccess: (result: ActionResult) => void) {
  const [pending, setPending] = useState(false);
  const send = useCallback(
    async (path: string, fields: Parameters<typeof run>[1], successText?: string) => {
      setPending(true);
      try {
        const result = await run(path, fields, { success: successText });
        if (result?.ok) onSuccess(result);
        return result;
      } finally {
        setPending(false);
      }
    },
    [onSuccess],
  );
  return { pending, send };
}
