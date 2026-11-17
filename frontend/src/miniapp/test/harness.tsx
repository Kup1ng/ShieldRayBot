/**
 * Test harness for Mini App screens: a fake /api/mini backend, a provider wrapper and a
 * customer /me payload. Screens run exactly as in the app, only `fetch` is replaced.
 */
import { AppToastProvider } from "@/components/feedback/AppToast";
import { act, cleanup, render, screen, waitFor, within, type RenderResult } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, vi } from "vitest";

import { invalidateAllResources } from "../state/resources";
import { MiniProvider } from "../state/store";
import type { MePayload, Route } from "../types";

export type FakeRequest = { method: string; path: string; body: unknown; headers: Record<string, string> };
export type FakeReply = { status?: number; json?: unknown; headers?: Record<string, string> } | "network-error";
export type FakeHandler = (req: FakeRequest) => FakeReply | Promise<FakeReply>;

/** Install a fake backend: `routes["POST /api/mini/buy"] = req => ({json: {...}})`. Unknown routes 404. */
export function fakeApi(routes: Record<string, FakeHandler>) {
  const calls: FakeRequest[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), "http://mini.test");
    const method = (init.method || "GET").toUpperCase();
    let body: unknown = init.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        // Leave non-JSON bodies as they are.
      }
    }
    const req: FakeRequest = { method, path: url.pathname + url.search, body, headers: (init.headers as Record<string, string>) || {} };
    calls.push(req);
    const handler = routes[`${method} ${url.pathname + url.search}`] ?? routes[`${method} ${url.pathname}`];
    const reply: FakeReply = handler ? await handler(req) : { status: 404, json: { detail: "مورد درخواستی پیدا نشد." } };
    if (reply === "network-error") throw new TypeError("Failed to fetch");
    return new Response(reply.json === undefined ? "" : JSON.stringify(reply.json), {
      status: reply.status ?? 200,
      headers: { "Content-Type": "application/json", ...(reply.headers || {}) },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock, callsTo: (method: string, path: string) => calls.filter((c) => c.method === method && c.path.startsWith(path)) };
}

export function customerMe(overrides: Partial<MePayload> = {}): MePayload {
  return {
    persona: "user",
    nav: [
      { id: "home", label: "خانه" },
      { id: "services", label: "سرویس‌ها" },
      { id: "shop", label: "خرید" },
      { id: "account", label: "حساب" },
    ],
    user: { id: 10, name: "علی", role: "user", wallet: 240000 },
    currency: "تومان",
    panel_base: "https://panel.test",
    commerce_allowed: true,
    brand: { name: "ShieldRay" },
    customer: {
      wallet: 240000,
      wallet_pay_enabled: true,
      qr_enabled: true,
      commerce_allowed: true,
      home: { service_count: 0, attention: [], recent: [] },
      badges: { support: 0, club: 0 },
    },
    ...overrides,
  };
}

/**
 * Answer the app's confirmation dialog (Figma "Pop up") like a person: «الان نه» for no, the
 * action button for yes. Use it in tests that render the shell (MiniShell mounts the dialog).
 */
export async function answerConfirm(yes: boolean): Promise<string> {
  // Toasts are alert dialogs too (react-aria); the confirmation is the one that is not a toast.
  const dialog = await waitFor(() => {
    const found = screen.getAllByRole("alertdialog").find((el) => el.getAttribute("data-slot") !== "toast");
    if (!found) throw new Error("no confirmation dialog");
    return found;
  });
  const question = within(dialog).getByRole("heading").textContent ?? "";
  const buttons = within(dialog).getAllByRole("button").filter((b) => b.getAttribute("aria-label") !== "بستن");
  const no = buttons.find((b) => b.textContent?.includes("الان نه")) ?? buttons[0];
  const ok = buttons.find((b) => b !== no) ?? buttons[buttons.length - 1];
  await act(async () => {
    (yes ? ok : no).click();
  });
  return question;
}

export function renderMini(ui: ReactNode, { me = customerMe(), route = { view: "home" } as Route } = {}): RenderResult {
  return render(
    <MiniProvider initialMe={me} initialRoute={route}>
      <AppToastProvider />
      {ui}
    </MiniProvider>,
  );
}

afterEach(() => {
  cleanup();
  invalidateAllResources();
  vi.unstubAllGlobals();
  // A screen's go() rewrites the hash; start the next test from a clean address.
  window.history.replaceState(null, "", "/");
});
