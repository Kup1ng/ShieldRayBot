import { toast } from "@heroui/react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppToastProvider } from "@/components/feedback/AppToast";

const get = vi.fn();
const action = vi.fn();
const ask = vi.fn();

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return { ...actual, panelGet: (path: string) => get(path), panelAction: (path: string, fields: unknown) => action(path, fields) };
});
vi.mock("../../core/confirm", () => ({ confirm: (message: string, options: unknown) => ask(message, options) }));
vi.mock("../../layout/PanelShell", () => ({ PanelShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { ShopBroadcastPage } from "./ShopBroadcastPage";
import type { ShopBroadcastData } from "./shopBroadcastTypes";
import type { BroadcastRow } from "./types";

const KEY = "a".repeat(32);

function row(patch: Partial<BroadcastRow> = {}): BroadcastRow {
  return {
    id: 5, created_at: "2026-05-01T10:00:00+00:00", audience_label: "همهٔ مشتریان", text_snippet: "سلام به همه", text_truncated: false,
    total: 10, ok_count: 9, fail_count: 1, review_count: 0, status: "done", status_label: "انجام شد", created_by: "owner1", is_active: false,
    ...patch,
  };
}

function data(patch: Partial<ShopBroadcastData> = {}): ShopBroadcastData {
  return {
    sections: [], history: [row()], audiences: [{ value: "all", label: "همهٔ مشتریان" }], max_text: 4000, request_key: KEY, ...patch,
  };
}

beforeEach(() => {
  get.mockReset();
  action.mockReset();
  ask.mockReset();
  ask.mockResolvedValue(true);
  action.mockResolvedValue({ ok: true, message: "" });
});

afterEach(() => {
  cleanup();
  toast.clear();
  vi.restoreAllMocks();
});

function mount() {
  return render(
    <>
      <AppToastProvider />
      <ShopBroadcastPage />
    </>,
  );
}

async function openRowMenu(user: ReturnType<typeof userEvent.setup>, id: string) {
  await user.click(await screen.findByRole("button", { name: `عملیات پیام ${id}` }));
}

describe("shop broadcast page", () => {
  it("reads the shop's own endpoint", async () => {
    get.mockResolvedValue(data());
    mount();
    expect(await screen.findByText("سلام به همه")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/panel/shop-broadcast");
  });

  it("sends the text with the form's request key and no audience field", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(data({ history: [] }));
    mount();
    expect(await screen.findByText("هنوز پیامی ارسال نشده")).toBeTruthy();
    await user.type(screen.getByRole("textbox", { name: /^متن پیام/ }), "تخفیف ویژه");
    await user.click(screen.getByRole("button", { name: /ارسال پیام/ }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action).toHaveBeenCalledWith("/shop-broadcast", { text: "تخفیف ویژه", request_key: KEY });
  });

  it("keeps the same key after a refused send and uses a new one after an accepted send", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(data({ history: [] }));
    action.mockResolvedValueOnce({ ok: false, message: "ربات فروشگاه فعال نیست" });
    mount();
    const box = await screen.findByRole("textbox", { name: /^متن پیام/ });
    await user.type(box, "یک");
    await user.click(screen.getByRole("button", { name: /ارسال پیام/ }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: /ارسال پیام/ }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    const first = action.mock.calls[0][1] as { request_key: string; text: string };
    const second = action.mock.calls[1][1] as { request_key: string; text: string };
    expect(first.request_key).toBe(KEY);
    expect(second.request_key).toBe(KEY);
    // The second post was accepted: the text is cleared and the next send gets its own key.
    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe(""));
    await user.type(box, "دو");
    await user.click(screen.getByRole("button", { name: /ارسال پیام/ }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(3));
    const third = action.mock.calls[2][1] as { request_key: string };
    expect(third.request_key).toMatch(/^[0-9a-f]{32}$/);
    expect(third.request_key).not.toBe(KEY);
  });

  it("limits the text to what the server accepts", async () => {
    get.mockResolvedValue(data({ max_text: 1234 }));
    mount();
    const box = await screen.findByRole("textbox", { name: /^متن پیام/ });
    expect(box.getAttribute("maxlength")).toBe("1234");
  });

  it("asks before deleting a finished send", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(data());
    mount();
    await openRowMenu(user, "۵");
    await user.click(await screen.findByRole("menuitem", { name: /حذف/ }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/shop-broadcast/history/5/delete", {}));
    expect(ask).toHaveBeenCalledWith("تأیید حذف", expect.objectContaining({ description: "این رکورد حذف شود؟", tone: "danger" }));
  });

  it("does not delete when the confirmation is declined", async () => {
    const user = userEvent.setup();
    ask.mockResolvedValue(false);
    get.mockResolvedValue(data());
    mount();
    await openRowMenu(user, "۵");
    await user.click(await screen.findByRole("menuitem", { name: /حذف/ }));
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(action).not.toHaveBeenCalled();
  });

  it("offers stop, not delete, for a running send and says sent messages stay sent", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(data({ history: [row({ id: 8, status: "running", status_label: "در حال ارسال", is_active: true })] }));
    mount();
    await openRowMenu(user, "۸");
    expect(screen.queryByRole("menuitem", { name: /حذف/ })).toBeNull();
    await user.click(await screen.findByRole("menuitem", { name: /توقف/ }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/shop-broadcast/history/8/cancel", {}));
    const [, options] = ask.mock.calls[0] as [string, { description: string }];
    expect(options.description).toContain("پیام‌های فرستاده‌شده برنمی‌گردند");
  });

  it("asks before clearing the whole history", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(data());
    mount();
    await user.click(await screen.findByRole("button", { name: /حذف تاریخچه/ }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/shop-broadcast/history/clear", {}));
    expect(ask).toHaveBeenCalledWith("پاک کردن تاریخچه", expect.objectContaining({ description: "همه تاریخچه پیام‌های گروهی این فروشگاه پاک شود؟", tone: "danger" }));
  });

  it("shows hostile message text and names as text", async () => {
    const hostile = '<img src=x onerror="alert(1)">';
    get.mockResolvedValue(data({ history: [row({ text_snippet: hostile, created_by: "<b>x</b>" })] }));
    const { container } = mount();
    const cell = await screen.findByText((_, node) => node?.textContent === hostile && node.tagName === "SPAN");
    expect(within(cell).queryByRole("img")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText("<b>x</b>")).toBeTruthy();
  });

  it("shows an ellipsis for a cut message and the failed and unknown counts", async () => {
    get.mockResolvedValue(data({ history: [row({ text_truncated: true, fail_count: 2, review_count: 3 })] }));
    mount();
    expect(await screen.findByText("سلام به همه…")).toBeTruthy();
    expect(screen.getByText(/ناموفق ۲.*نامشخص ۳/)).toBeTruthy();
  });

  it("refreshes a running send on a timer and stops once nothing is active", async () => {
    const timers = new Map<number, () => void>();
    let nextId = 1;
    vi.spyOn(window, "setInterval").mockImplementation(((callback: () => void, delay?: number) => {
      // Only the page's own five-second poll is tracked; other widgets keep their timers.
      if (delay !== 5000) return 0;
      timers.set(nextId, callback);
      return nextId++;
    }) as unknown as typeof window.setInterval);
    vi.spyOn(window, "clearInterval").mockImplementation(((id: number) => void timers.delete(id)) as typeof window.clearInterval);
    get.mockResolvedValueOnce(data({ history: [row({ status: "running", status_label: "در حال ارسال", is_active: true })] }));
    get.mockResolvedValue(data());
    mount();
    await screen.findByText("در حال ارسال");
    expect(timers.size).toBe(1);
    timers.forEach((callback) => callback());
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await screen.findByText("۱ ناموفق");
    await waitFor(() => expect(timers.size).toBe(0));
  });
});
