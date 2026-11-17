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

/** What the home screen offers a customer with no service: a previous service, a free trial, or both. */
export type HomeOffer = { import_enabled?: boolean; trial_available?: boolean };

const NO_OFFER = { importEnabled: false, trialAvailable: false };

/**
 * Whether the home screen offers to add a previous service and/or take a free trial. Asked once
 * when `enabled`; a failed or refused answer simply means no offer. `hide` removes the card for
 * now (dismissed, or a service was added).
 */
export function useImportOffer(enabled: boolean) {
  const [offer, setOffer] = useState(NO_OFFER);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    api<HomeOffer>(OFFER_PATH, { signal: controller.signal })
      .then((reply) => setOffer({ importEnabled: reply?.import_enabled === true, trialAvailable: reply?.trial_available === true }))
      .catch(() => setOffer(NO_OFFER));
    return () => controller.abort();
  }, [enabled]);

  const hide = useCallback(() => setOffer(NO_OFFER), []);
  return enabled ? { ...offer, hide } : { ...NO_OFFER, hide };
}
