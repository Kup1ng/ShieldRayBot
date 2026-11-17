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

import { RandomDiscountsPage, rangeLabel } from "./RandomDiscountsPage";
import type { RandomDiscountRow, RandomDiscountsData } from "./types";

const ACTIVE: RandomDiscountRow = {
  id: 7, title: "تخفیف شب", mode: "code", reduction_kind: "amount", minimum: 1000, maximum: 5000, step: 100, window_minutes: 60, code: "NIGHT", is_active: true,
};

function data(patch: Partial<RandomDiscountsData> = {}): RandomDiscountsData {
  return { sections: [], discounts: [ACTIVE], next_before: null, request_key: "a".repeat(32), ...patch };
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
  window.history.replaceState(null, "", "/");
});

function mount() {
  return render(
    <>
      <AppToastProvider />
      <RandomDiscountsPage />
    </>,
  );
}

describe("random discounts page", () => {
  it("labels a range in its own unit", () => {
    expect(rangeLabel({ minimum: 1000, maximum: 5000, reduction_kind: "amount" })).toBe("۱٬۰۰۰ تا ۵٬۰۰۰ تومان");
    expect(rangeLabel({ minimum: 5, maximum: 20, reduction_kind: "percent" })).toBe("۵ تا ۲۰٪");
  });

  it("reads the list for the page in the address", async () => {
    window.history.replaceState(null, "", "/random-discounts?before=40");
    get.mockResolvedValue(data());
    mount();
    expect(await screen.findByText("تخفیف شب")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/panel/random-discounts?before=40");
  });

  it("creates an automatic rule with the form's key and sends no code", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(data({ discounts: [] }));
    mount();
    expect(await screen.findByText("هنوز تخفیف تصادفی تعریف نشده است.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "تخفیف تازه" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: /^عنوان/ }), "عید");
    await user.type(within(dialog).getByRole("textbox", { name: /^حداقل تخفیف/ }), "1,000");
    await user.type(within(dialog).getByRole("textbox", { name: /^حداکثر تخفیف/ }), "5000");
    await user.click(within(dialog).getByRole("button", { name: "ساخت تخفیف" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const [path, fields] = action.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/random-discounts");
    expect(fields).toMatchObject({ title: "عید", mode: "automatic", reduction_kind: "amount", minimum: "1000", maximum: "5000", step: "1", window_minutes: "60", request_key: "a".repeat(32) });
    expect(fields).not.toHaveProperty("code");
  });

  it("asks before stopping a rule and says old orders keep their amount", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(data());
    mount();
    await user.click(await screen.findByRole("button", { name: "عملیات تخفیف شب" }));
    await user.click(await screen.findByRole("menuitem", { name: /توقف/ }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/random-discounts/7/stop", {}));
    const [, options] = ask.mock.calls[0] as [string, { description: string }];
    expect(options.description).toContain("مبلغ سفارش‌های قبلی تغییر نمی‌کند");
  });

  it("shows a hostile title as text", async () => {
    get.mockResolvedValue(data({ discounts: [{ ...ACTIVE, title: "<img src=x onerror=alert(1)>" }] }));
    const { container } = mount();
    expect(await screen.findByText("<img src=x onerror=alert(1)>")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });
});
