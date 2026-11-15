"use client";

import { AlertDialog, Button } from "@heroui/react";
import { useEffect, useRef, useState } from "react";

import { TONE_TILE, TONE_TITLE, TONE_WASH, type FeedbackTone } from "@/components/feedback/tones";
import { Icon } from "@/icons/Icon";



export type ConfirmOptions = {
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "accent" | "danger" | "warning" | "success";
};

export type ConfirmPresenter = (message: string, options: ConfirmOptions) => Promise<boolean>;

type Pending = { message: string; options: ConfirmOptions; resolve: (ok: boolean) => void };

const TONE_ICON: Record<FeedbackTone, string> = {
  info: "solar:info-circle-bold",
  accent: "solar:info-circle-bold",
  success: "solar:check-circle-bold",
  warning: "solar:danger-triangle-bold",
  danger: "solar:danger-circle-bold",
};

/**
 * Figma "Pop up": the app's own confirmation dialog. While mounted it registers itself as the
 * presenter (mini app: confirmAction, panel: confirm); one question at a time, and closing
 * without choosing means «no».
 */
export function ConfirmHost({ register }: { register: (presenter: ConfirmPresenter | null) => () => void }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  useEffect(() => {
    const unregister = register(
      (message, options) =>
        new Promise<boolean>((resolve) => {
          // A newer question answers the older one with «no» rather than leaving it hanging.
          pendingRef.current?.resolve(false);
          const next = { message, options, resolve };
          pendingRef.current = next;
          setPending(next);
        }),
    );
    return () => {
      unregister();
      pendingRef.current?.resolve(false);
      pendingRef.current = null;
    };
  }, [register]);

  const answer = (ok: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(ok);
  };

  const tone: FeedbackTone = pending?.options.tone === "danger" ? "danger" : pending?.options.tone === "warning" ? "warning" : pending?.options.tone === "success" ? "success" : "info";

  return (
    <AlertDialog.Backdrop isOpen={Boolean(pending)} onOpenChange={(open) => !open && answer(false)} isDismissable variant="blur">
      <AlertDialog.Container placement="center" size="sm">
        <AlertDialog.Dialog className={`!rounded-xl !p-5 ${TONE_WASH[tone]}`}>
          {pending ? (
            <>
              <AlertDialog.CloseTrigger aria-label="بستن" className="!start-auto !end-4 !top-4" />
              <AlertDialog.Header className="!flex-row !items-start gap-3 pe-8">
                <span aria-hidden className={`inline-flex size-12 shrink-0 items-center justify-center rounded-lg ${TONE_TILE[tone]}`}>
                  <Icon name={TONE_ICON[tone]} size={24} />
                </span>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <AlertDialog.Heading className={`!text-base !leading-7 font-semibold ${TONE_TITLE[tone]}`}>{pending.message}</AlertDialog.Heading>
                  {pending.options.description ? (
                    <p className="text-sm leading-6 text-muted">{pending.options.description}</p>
                  ) : null}
                </div>
              </AlertDialog.Header>
              <AlertDialog.Footer className="!mt-5 !flex-row !justify-end gap-3">
                <Button variant="outline" className="!h-10 min-w-24 !rounded-lg" onPress={() => answer(false)}>
                  {pending.options.cancelLabel || "الان نه"}
                </Button>
                <Button className="button--ink !h-10 min-w-24 !rounded-lg" onPress={() => answer(true)}>
                  {pending.options.confirmLabel || "تأیید"}
                </Button>
              </AlertDialog.Footer>
            </>
          ) : null}
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
