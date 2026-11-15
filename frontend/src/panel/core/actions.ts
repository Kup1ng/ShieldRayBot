"use client";

import { toast } from "@heroui/react";
import { useState } from "react";

import { FALLBACK_ERROR, PanelError, panelAction, type ActionResult } from "./api";
import { confirm } from "./confirm";

export type Ask = {
  /** Dialog heading (the old confirm question). */
  title: string;
  /** What will happen (the old confirm text); destructive and money actions always say it. */
  text?: string;
  confirmLabel?: string;
  tone?: "accent" | "danger" | "warning" | "success";
};

type Fields = Parameters<typeof panelAction>[1];

export type RunOptions = {
  ask?: Ask;
  /** Shown when the handler succeeds without a message of its own. */
  success?: string;
  /** Called after the handler answered or the reply was lost: reload what is on screen. */
  refresh?: () => void;
};

/**
 * Post one of the panel's existing form handlers after the confirmation the old page asked for.
 * The reply is shown as a toast. Returns the handler's answer, or null when the staff member said
 * no or the reply was lost; a lost reply only reloads the screen and never posts again, because
 * the action may have happened.
 */
export async function run(path: string, fields: Fields = {}, { ask, success = "انجام شد.", refresh }: RunOptions = {}): Promise<ActionResult | null> {
  if (ask && !(await confirm(ask.title, { description: ask.text, confirmLabel: ask.confirmLabel, tone: ask.tone }))) return null;
  try {
    const result = await panelAction(path, fields);
    if (result.ok) toast.success(result.message || success);
    else toast.danger(result.message || FALLBACK_ERROR);
    refresh?.();
    return result;
  } catch (err) {
    if (err instanceof PanelError && err.status === 401) return null;
    toast.danger(err instanceof Error ? err.message : FALLBACK_ERROR);
    refresh?.();
    return null;
  }
}

/** Pending flag for a submit button while its post is in flight. */
export function usePending(): { pending: boolean; track: (work: () => Promise<unknown>) => Promise<void> } {
  const [pending, setPending] = useState(false);
  const track = async (work: () => Promise<unknown>) => {
    setPending(true);
    try {
      await work();
    } finally {
      setPending(false);
    }
  };
  return { pending, track };
}

/** Follow a handler's redirect when it is a same-site panel page. */
export function followLocation(location: string | undefined): void {
  if (!location || !location.startsWith("/") || location.startsWith("//")) return;
  window.location.assign(location);
}

const FLASH_KEY = "panel:flash";

/** Keep a message across a page change (clone → edit page); the next page shows it once. */
export function stashFlash(message: string): void {
  try {
    if (message) window.sessionStorage.setItem(FLASH_KEY, message);
  } catch (err) {
    // Storage can be blocked (private mode); the message is only a courtesy.
    console.debug("panel flash not stored", err);
  }
}

export function takeFlash(): string {
  try {
    const message = window.sessionStorage.getItem(FLASH_KEY) || "";
    window.sessionStorage.removeItem(FLASH_KEY);
    return message;
  } catch {
    return "";
  }
}
