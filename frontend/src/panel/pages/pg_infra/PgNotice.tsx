"use client";

import { Button } from "@heroui/react";

import { fa } from "../../core/format";
import { Notice } from "../../ui/States";
import type { ConnectionNotice } from "./types";

/**
 * Shown when PasarGuard answered late or not at all while the page was built: the figures below
 * are then the last good ones (or missing), and the rest of the panel keeps working.
 */
export function ConnectionNoticeBar({ notice, onRetry }: { notice: ConnectionNotice; onRetry?: () => void }) {
  if (!notice) return null;
  const stale = notice.kind === "stale";
  return (
    <div className="flex flex-col gap-2">
      <Notice tone="warning" title={stale ? "آخرین اطلاعات دریافت‌شده نمایش داده می‌شود" : "اطلاعات پاسارگارد در دسترس نیست"}>
        {stale ? (
          <>
            ارتباط با پاسارگارد کند یا قطع است. بخشی از اعداد این صفحه مربوط به حدود <bdi dir="ltr">{fa(notice.minutes)}</bdi> دقیقه پیش است و ممکن است به‌روز نباشد.
          </>
        ) : (
          "ارتباط با پاسارگارد کند یا قطع است. بقیهٔ بخش‌های پنل کار می‌کنند؛ کمی بعد دوباره تلاش کنید."
        )}
      </Notice>
      {onRetry ? (
        <div>
          <Button size="sm" variant="outline" onPress={onRetry}>
            تلاش دوباره
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** The error a page's own read reported (the panel refused or failed), shown above its content. */
export function ReadError({ message }: { message: string | null }) {
  return message ? <Notice tone="danger">{message}</Notice> : null;
}
