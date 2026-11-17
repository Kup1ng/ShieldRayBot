"use client";

import { Icon } from "@/icons/Icon";

import { closeApp, openExternal } from "../../core/telegram";
import { ActionButton } from "../../ui/ActionButton";
import { GateFrame } from "./GateFrame";

const VPN_HINT = "اگر همین حالا داخل تلگرام هستید و فقط از پروکسی داخل تلگرام استفاده می‌کنید، VPN سیستم را روشن کنید و مینی‌اپ را دوباره باز کنید.";
const REOPEN_HINT = "مینی‌اپ را ببندید و دوباره از دکمهٔ «Open» باز کنید.";

function Notice({ icon, tone, message }: { icon: string; tone: "warning" | "danger" | "accent"; message: string }) {
  const color = tone === "warning" ? "bg-warning/12 text-warning" : tone === "danger" ? "bg-danger/10 text-danger" : "bg-accent-soft text-accent";
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <span className={`inline-flex size-14 items-center justify-center rounded-full ${color}`}>
        <Icon name={icon} size={28} />
      </span>
      <p className="max-w-xs text-sm leading-7 whitespace-pre-line text-foreground/80">{message}</p>
    </div>
  );
}

/** The entry gate is on and an admin has not approved this customer yet (`entry_pending`). */
export function PendingApprovalScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <GateFrame title="در انتظار تأیید">
      <Notice icon="solar:hourglass-bold" tone="warning" message={message} />
      <ActionButton tone="neutral" icon="solar:refresh-linear" fullWidth onPress={onRetry}>
        بررسی دوباره
      </ActionButton>
    </GateFrame>
  );
}

/** This account is blocked (`blocked`): nothing a retry can change. */
export function BlockedScreen({ message }: { message: string }) {
  return (
    <GateFrame title="دسترسی مسدود است">
      <Notice icon="solar:shield-warning-bold" tone="danger" message={message} />
      <ActionButton tone="ink" fullWidth onPress={() => !closeApp() && window.alert(REOPEN_HINT)}>
        بستن مینی‌اپ
      </ActionButton>
    </GateFrame>
  );
}

/**
 * Opened in a browser: say so, and open the same Mini App in Telegram when the bot is known.
 * `sdkBlocked`: telegram.org did not load, so a Telegram window behind a proxy looks the same.
 */
export function OutsideTelegramScreen({ bot, sdkBlocked }: { bot: string; sdkBlocked: boolean }) {
  return (
    <GateFrame title="فقط داخل تلگرام">
      <Notice icon="solar:plain-2-bold" tone="accent" message="این صفحه فقط داخل تلگرام کار می‌کند؛ ورود شما را خود تلگرام تأیید می‌کند." />
      {bot ? (
        <>
          <ActionButton tone="ink" trailingIcon="solar:arrow-left-linear" fullWidth onPress={() => openExternal(`https://t.me/${bot}?startapp`)}>
            باز کردن در تلگرام
          </ActionButton>
          <p dir="ltr" className="text-center text-xs text-muted">
            @{bot}
          </p>
        </>
      ) : (
        <p className="text-center text-sm leading-6 text-muted">مینی‌اپ را از دکمهٔ «Open» ربات در تلگرام باز کنید.</p>
      )}
      {sdkBlocked ? <p className="text-center text-xs leading-6 text-muted">{VPN_HINT}</p> : null}
    </GateFrame>
  );
}
