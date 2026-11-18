"use client";

import { Spinner } from "@heroui/react";
import { useCallback, useEffect, useState } from "react";

import { AppToastProvider } from "@/components/feedback/AppToast";
import { CrystalBackdrop } from "@/components/shell/CrystalBackdrop";
import { applyTheme, currentTheme, hasSavedTheme } from "@/lib/theme";

import { ApiError, ENTRY_PENDING, GATE_CODES, BLOCKED, api, onAuthLost, onGate } from "./core/api";
import { setCurrency } from "./core/format";
import { botUsername } from "./core/launch";
import { closeApp, getInitData, initTelegram, isFullscreen, outsideTelegram, paintTelegramChrome, requestWriteAccessOnce, telegramScheme, whenTelegram } from "./core/telegram";
import { MiniShell } from "./layout/MiniShell";
import { BlockedScreen, OutsideTelegramScreen, PendingApprovalScreen } from "./screens/onboarding/GateNotices";
import { OnboardingScreen } from "./screens/onboarding/OnboardingScreen";
import type { Refusal } from "./screens/onboarding/onboardingKit";
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
  /** A referral code, required channels or terms still to finish. */
  | { phase: "onboarding" }
  /** An admin has not approved this customer yet. */
  | { phase: "pending"; message: string }
  | { phase: "blocked"; message: string }
  /** Opened in a browser, not by Telegram. */
  | { phase: "outside"; bot: string; sdkBlocked: boolean }
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

/** The server holds the person at an onboarding step: /me answers 403 with its `X-Mini-Error` code. */
function isOnboardingGate(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403 && GATE_CODES.has(err.code);
}

/**
 * The screen for a refusal at launch. `afterOnboarding`: the server just said every step is
 * done, so a step reported again is an error to show, not a reason to go round again.
 */
function bootFromError(err: unknown, sdkReady: boolean, afterOnboarding: boolean): Boot {
  if (err instanceof ApiError && err.status === 403) {
    if (err.code === ENTRY_PENDING) return { phase: "pending", message: err.message };
    if (err.code === BLOCKED) return { phase: "blocked", message: err.message };
  }
  if (isOnboardingGate(err) && !afterOnboarding) return { phase: "onboarding" };
  return { phase: "error", message: bootErrorText(err, sdkReady), reopen: needsReopen(err) };
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
async function loadBoot(afterOnboarding = false): Promise<Boot> {
  const sdkReady = await whenTelegram();
  if (sdkReady) connectTelegram();
  else void whenTelegram(LATE_SDK_MS).then((ok) => ok && connectTelegram());
  try {
    await waitForInitData(6);
    if (!getInitData()) {
      if (outsideTelegram()) return { phase: "outside", bot: botUsername(), sdkBlocked: !sdkReady };
      throw new ApiError("no initData", 401);
    }
    const me = await api<MePayload>("/api/mini/me");
    setCurrency(me.currency);
    requestWriteAccessOnce();
    return { phase: "ready", me, route: routeFromHash(window.location.hash) };
  } catch (err) {
    return bootFromError(err, sdkReady, afterOnboarding);
  }
}

export function MiniApp() {
  const [boot, setBoot] = useState<Boot>({ phase: "loading" });

  const start = useCallback((afterOnboarding = false) => {
    void loadBoot(afterOnboarding).then(setBoot);
  }, []);

  const refused = useCallback((kind: Refusal, err: ApiError) => {
    setBoot(kind === "pending" ? { phase: "pending", message: err.message } : { phase: "blocked", message: err.message });
  }, []);

  useEffect(() => {
    // A 401 after launch: the session ended under an open screen; show how to reopen.
    onAuthLost((err) => setBoot({ phase: "error", message: bootErrorText(err, true), reopen: needsReopen(err) }));
    // The server holds the person at a step under an open screen (they left a required channel).
    onGate(() => setBoot((current) => (current.phase === "ready" ? { phase: "onboarding" } : current)));
    start();
    return () => {
      onAuthLost(null);
      onGate(null);
    };
  }, [start]);

  const restart = (afterOnboarding = false) => {
    setBoot({ phase: "loading" });
    start(afterOnboarding);
  };

  return (
    <>
      <AppToastProvider />
      {boot.phase === "ready" ? (
        <MiniProvider initialMe={boot.me} initialRoute={boot.route}>
          <MiniShell>
            <ScreenRouter />
          </MiniShell>
        </MiniProvider>
      ) : boot.phase === "onboarding" ? (
        <OnboardingScreen onDone={() => restart(true)} onRefused={refused} />
      ) : boot.phase === "pending" ? (
        <PendingApprovalScreen message={boot.message} onRetry={() => restart()} />
      ) : boot.phase === "blocked" ? (
        <BlockedScreen message={boot.message} />
      ) : boot.phase === "outside" ? (
        <OutsideTelegramScreen bot={boot.bot} sdkBlocked={boot.sdkBlocked} />
      ) : (
        <BootScreen boot={boot} onRetry={() => restart()} />
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
