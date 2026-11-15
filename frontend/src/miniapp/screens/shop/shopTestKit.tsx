/**
 * Helpers shared by the shop and account tests: an outlet that draws the open bottom sheet
 * (the real shell draws it in a portal), a route probe, Telegram stubs and the shop address.
 */
import { toast } from "@heroui/react";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import { resetLaunchCache } from "../../core/launch";
import { useMini } from "../../state/store";
import type { MePayload } from "../../types";
import { customerMe } from "../../test/harness";

/** Draws what `openSheet` was given, like the shell's bottom sheet but without the portal. */
export function SheetOutlet() {
  const { sheet, closeSheet } = useMini();
  if (!sheet) return null;
  return (
    <section aria-label="برگهٔ باز">
      <h2>{sheet.title}</h2>
      {sheet.render(closeSheet)}
    </section>
  );
}

/** Says which screen the store is on, so tests can see navigation. */
export function RouteProbe() {
  const { route } = useMini();
  return <output aria-label="صفحهٔ فعلی">{route.view}</output>;
}

export const currentView = () => screen.getByLabelText("صفحهٔ فعلی").textContent;

/** A customer /me with a chosen wallet and any other top-level override. */
export function meWithWallet(wallet: number, overrides: Partial<MePayload> = {}): MePayload {
  const base = customerMe();
  return { ...base, user: { ...base.user, wallet }, customer: { ...base.customer, wallet }, ...overrides };
}

/** Telegram's showConfirm answering `answer`; every question asked is recorded. */
export function stubTelegramConfirm(answer: boolean) {
  const asked: string[] = [];
  window.Telegram = {
    WebApp: {
      initData: "query_id=x&hash=y",
      ready: () => undefined,
      expand: () => undefined,
      close: () => undefined,
      onEvent: () => undefined,
      showConfirm: (message: string, cb: (ok: boolean) => void) => {
        asked.push(message);
        cb(answer);
      },
    },
  };
  return asked;
}

/** The browser's own confirm answering `answer` (used when Telegram has no showConfirm). */
export function stubBrowserConfirm(answer: boolean) {
  return vi.spyOn(window, "confirm").mockReturnValue(answer);
}

/** Pretend this page is served from a shop's Mini App address (or the platform's). */
export function visit(pathname: string) {
  window.history.replaceState(null, "", pathname);
  resetLaunchCache();
}

afterEach(async () => {
  // Unmount first: resetting the address fires a late `hashchange` that a live screen would follow.
  cleanup();
  // The toast queue is global: a message from this test must not be found by the next one.
  toast.clear();
  delete window.Telegram;
  vi.restoreAllMocks();
  visit("/");
  await new Promise((resolve) => setTimeout(resolve, 5));
});
