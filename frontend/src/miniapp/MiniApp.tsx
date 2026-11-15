"use client";

import { Spinner } from "@heroui/react";
import { useCallback, useEffect, useState } from "react";

import { AppToastProvider } from "@/components/feedback/AppToast";
import { CrystalBackdrop } from "@/components/shell/CrystalBackdrop";
import { applyTheme, currentTheme, hasSavedTheme } from "@/lib/theme";

import { ApiError, api, onAuthLost } from "./core/api";
import { setCurrency } from "./core/format";
import { closeApp, getInitData, initTelegram, isFullscreen, paintTelegramChrome, telegramScheme, whenTelegram } from "./core/telegram";
import { MiniShell } from "./layout/MiniShell";
import { AccessScreen } from "./screens/access/AccessScreen";
import { ScreenRouter } from "./screens/ScreenRouter";
import { MiniProvider, routeFromHash } from "./state/store";
import type { MePayload, Route } from "./types";
import { ActionButton } from "./ui/ActionButton";
import { ErrorState } from "./ui/ScreenState";

/** Reasons a retry with the same Telegram sign-in cannot fix: only reopening the app can. */
const REOPEN_CODES = new Set(["expired", "bad_signature", "no_init_data"]);

/** How long a slow SDK may still arrive after the first screen and get connected. */
const LATE_SDK_MS = 20_000;

type Boot =
  | { phase: "loading" }
  | { phase: "access" }
  | { phase: "ready"; me: MePayload; route: Route }
  | { phase: "error"; message: string; reopen: boolean };

function bootErrorText(err: unknown, sdkReady: boolean): string {
  if (!getInitData() && !sdkReady) {
    return "اتصال به تلگرام برقرار نشد. اگر فقط از پروکسی داخل تلگرام استفاده می‌کنید، VPN سیستم را روشن کنید و مینی‌اپ را دوباره باز کنید.";
  }
  if (!getInitData()) return "مینی‌اپ را از دکمهٔ «Open» کنار چت یا دکمهٔ داخل ربات باز کنید.";
  // The server's own Persian reason (shop switched off, not started, not a customer…).
  return err instanceof Error && err.message ? err.message : "بارگذاری مینی‌اپ ناموفق بود.";
}

/** The server holds the person at the terms gate: /me answers 403 with `X-Mini-Error: terms`. */
function isTermsGate(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403 && err.code === "terms";
}

function needsReopen(err: unknown): boolean {
  return err instanceof ApiError && (REOPEN_CODES.has(err.code) || (err.status === 401 && !err.code));
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForInitData(attempts: number): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (getInitData()) return true;
    await sleep(40 * (i + 1));
  }
  return Boolean(getInitData());
}

/** Follow Telegram's light/dark unless the visitor picked one with the switch. */
function syncTheme() {
  const scheme = telegramScheme();
  if (scheme && !hasSavedTheme()) applyTheme(scheme);
  paintTelegramChrome(currentTheme());
}

function syncFullscreen() {
  document.documentElement.toggleAttribute("data-fullscreen", isFullscreen());
}

function connectTelegram() {
  initTelegram({ onThemeChanged: syncTheme, onFullscreenChanged: syncFullscreen });
  syncTheme();
  syncFullscreen();
}

/** Connect Telegram (now or when a slow SDK arrives), then read /me. Never throws. */
async function loadBoot(): Promise<Boot> {
  const sdkReady = await whenTelegram();
  if (sdkReady) connectTelegram();
  else void whenTelegram(LATE_SDK_MS).then((ok) => ok && connectTelegram());
  try {
    await waitForInitData(6);
    if (!getInitData()) throw new ApiError("no initData", 401);
    const me = await api<MePayload>("/api/mini/me");
    setCurrency(me.currency);
    return { phase: "ready", me, route: routeFromHash(window.location.hash) };
  } catch (err) {
    if (isTermsGate(err)) return { phase: "access" };
    return { phase: "error", message: bootErrorText(err, sdkReady), reopen: needsReopen(err) };
  }
}

export function MiniApp() {
  const [boot, setBoot] = useState<Boot>({ phase: "loading" });

  const start = useCallback(() => {
    void loadBoot().then(setBoot);
  }, []);

  useEffect(() => {
    // A 401 after launch: the session ended under an open screen; show how to reopen.
    onAuthLost((err) => setBoot({ phase: "error", message: bootErrorText(err, true), reopen: needsReopen(err) }));
    start();
    return () => onAuthLost(null);
  }, [start]);

  return (
    <>
      <AppToastProvider />
      {boot.phase === "ready" ? (
        <MiniProvider initialMe={boot.me} initialRoute={boot.route}>
          <MiniShell>
            <ScreenRouter />
          </MiniShell>
        </MiniProvider>
      ) : boot.phase === "access" ? (
        <AccessScreen
          onDone={() => {
            setBoot({ phase: "loading" });
            start();
          }}
        />
      ) : (
        <BootScreen
          boot={boot}
          onRetry={() => {
            setBoot({ phase: "loading" });
            start();
          }}
        />
      )}
    </>
  );
}

function BootScreen({ boot, onRetry }: { boot: Boot; onRetry: () => void }) {
  return (
    <>
      <CrystalBackdrop />
      <div className="mx-auto flex min-h-dvh w-full max-w-[480px] items-center px-4">
        <main className="glass flex w-full flex-col items-center gap-4 rounded-xl p-6">
          {boot.phase === "error" ? (
            <>
              <ErrorState message={boot.message} />
              {boot.reopen ? (
                <ActionButton tone="ink" onPress={() => !closeApp() && window.alert("مینی‌اپ را ببندید و دوباره از دکمهٔ «Open» باز کنید.")}>
                  بستن مینی‌اپ
                </ActionButton>
              ) : (
                <ActionButton tone="neutral" icon="solar:refresh-linear" onPress={onRetry}>
                  تلاش دوباره
                </ActionButton>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-10" role="status">
              <Spinner size="lg" />
              <p className="text-sm text-muted">در حال بارگذاری…</p>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
