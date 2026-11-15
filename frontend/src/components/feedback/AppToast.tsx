"use client";

import { Toast, ToastContent, ToastDescription, ToastTitle, type ToastContentValue } from "@heroui/react";

import { Icon } from "@/icons/Icon";

import { TONE_TILE, TONE_TITLE, type FeedbackTone } from "./tones";

const VARIANT_TONE: Record<NonNullable<ToastContentValue["variant"]>, FeedbackTone> = {
  default: "info",
  accent: "accent",
  success: "success",
  warning: "warning",
  danger: "danger",
};

const TONE_ICON: Record<FeedbackTone, string> = {
  info: "solar:info-circle-bold",
  accent: "solar:info-circle-bold",
  success: "solar:check-circle-bold",
  warning: "solar:danger-triangle-bold",
  danger: "solar:danger-circle-bold",
};

/** A white card washed with the tone from the start edge, as in the Figma alerts. */
const TOAST_WASH: Record<FeedbackTone, string> = {
  info: "",
  accent: "bg-gradient-to-l from-accent/10 via-transparent",
  success: "bg-gradient-to-l from-success/12 via-transparent",
  warning: "bg-gradient-to-l from-warning/14 via-transparent",
  danger: "bg-gradient-to-l from-danger/10 via-transparent",
};

/**
 * Figma "Alerts" toasts: tone icon tile at the start, the message in the tone colour, a close
 * button at the end. Uses HeroUI's global queue, so `toast.success(...)` etc. render here.
 */
export function AppToastProvider({ placement = "top" }: { placement?: "top" | "bottom" }) {
  return (
    <Toast.Provider placement={placement} width="min(440px, calc(100vw - 32px))">
      {({ toast: item }) => {
        const content = item.content as ToastContentValue;
        const tone = VARIANT_TONE[content.variant ?? "default"];
        return (
          <Toast toast={item} variant={content.variant} className={`!rounded-xl !border-0 !bg-overlay !p-0 shadow-[var(--glass-shadow)]`}>
            <div className={`flex w-full items-center gap-3 rounded-xl p-3 pe-10 ${TOAST_WASH[tone]}`}>
              <span aria-hidden className={`inline-flex size-12 shrink-0 items-center justify-center rounded-lg ${TONE_TILE[tone]}`}>
                <Icon name={TONE_ICON[tone]} size={24} />
              </span>
              <ToastContent className="min-w-0 flex-1">
                {content.title ? <ToastTitle className={`!text-sm !leading-6 font-semibold ${TONE_TITLE[tone]}`}>{content.title}</ToastTitle> : null}
                {content.description ? <ToastDescription className="!text-xs !leading-5 text-muted">{content.description}</ToastDescription> : null}
              </ToastContent>
            </div>
            <Toast.CloseButton aria-label="بستن" className="absolute end-3 top-1/2 -translate-y-1/2 !border-none !bg-transparent opacity-100" />
          </Toast>
        );
      }}
    </Toast.Provider>
  );
}
