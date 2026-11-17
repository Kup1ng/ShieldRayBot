"use client";

import { Button } from "@heroui/react";

import { run, usePending } from "../../core/actions";
import type { ActionResult } from "../../core/api";
import { GlassSection } from "../../ui/Page";
import { Notice } from "../../ui/States";

/** Shown only while a new panel-admin password is saved but the panel has not confirmed it. */
export function RotationRetry({ shopId, pending, onSettled }: { shopId: number; pending: boolean; onSettled: (result: ActionResult | null) => void }) {
  const { pending: busy, track } = usePending();
  if (!pending) return null;
  return (
    <GlassSection title="تغییر رمز ادمین پاسارگارد">
      <Notice tone="warning">تغییر رمز ادمین پاسارگارد هنوز تأیید نشده؛ تا تأیید، رمز قبلی ممکن است کار کند.</Notice>
      <div>
        <Button
          variant="outline"
          className="!h-12 !rounded-lg"
          isPending={busy}
          onPress={() =>
            void track(async () =>
              onSettled(
                await run(`/resellers/${shopId}/pg-password-rotation`, {}, {
                  ask: { title: "تکرار تغییر رمز پاسارگارد", text: "رمز تازهٔ ذخیره‌شده دوباره به پاسارگارد فرستاده شود؟ این رمز برای نماینده ارسال نمی‌شود.", confirmLabel: "تکرار تغییر رمز" },
                }),
              ),
            )
          }
        >
          تکرار تغییر رمز پاسارگارد
        </Button>
      </div>
    </GlassSection>
  );
}
