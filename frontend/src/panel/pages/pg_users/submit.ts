"use client";

import { useState } from "react";

import { run } from "../../core/actions";
import type { ActionResult } from "../../core/api";
import type { FormFields } from "./forms";

/**
 * Submit state of one dialog form: posts the existing handler, keeps the server's refusal inside the
 * dialog (the old page showed `form_err` there) and closes only when the handler accepted it.
 */
export function useDialogPost({ onClose, refresh }: { onClose: () => void; refresh: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(path: string, fields: FormFields): Promise<ActionResult | null> {
    setError(null);
    setPending(true);
    try {
      const result = await run(path, fields, { refresh });
      if (result?.ok) onClose();
      else if (result) setError(result.message);
      return result;
    } finally {
      setPending(false);
    }
  }

  return { pending, error, setError, post };
}
