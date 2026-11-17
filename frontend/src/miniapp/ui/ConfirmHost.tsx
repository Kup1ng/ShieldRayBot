"use client";

import { ConfirmHost as SharedConfirmHost } from "@/components/feedback/ConfirmHost";

import { setConfirmPresenter } from "../core/telegram";

/** The shared Figma confirmation dialog, answering the Mini App's confirmAction(). */
export function ConfirmHost() {
  return <SharedConfirmHost register={setConfirmPresenter} />;
}
