"use client";

import { useCallback, useEffect, useState } from "react";

import { api } from "../../core/api";

export const OFFER_PATH = "/api/mini/service-import/offer";
export const DISMISS_PATH = "/api/mini/service-import/dismiss";
export const IMPORT_PATH = "/api/mini/service-import";
/** Same cap as the server (`MAX_LINK_LENGTH`): a longer text can never be a subscription link. */
export const LINK_MAX = 2048;

export type ImportOutcome = "added" | "upgraded" | "already_yours" | "pending_approval";
export type ImportReply = { outcome: ImportOutcome; message: string; service_id: number | null };

/**
 * Whether the home screen offers to add a previous service. Asked once when `enabled`; a failed
 * or refused answer simply means no offer. `hide` removes the card for now (dismissed or done).
 */
export function useImportOffer(enabled: boolean) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    api<{ show?: boolean }>(OFFER_PATH, { signal: controller.signal })
      .then((reply) => setShow(reply?.show === true))
      .catch(() => setShow(false));
    return () => controller.abort();
  }, [enabled]);

  const hide = useCallback(() => setShow(false), []);
  return { show: enabled && show, hide };
}
