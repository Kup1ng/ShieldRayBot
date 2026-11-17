import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { panelAction } from "../../core/api";
import { GiftCodeForm, giftCodeFields } from "./GiftCodeForm";
import type { GiftCode, GiftCodesData } from "./types";

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return { ...actual, panelAction: vi.fn(async () => ({ ok: true, message: "ذخیره شد" })) };
});

afterEach(() => {
  cleanup();
  vi.mocked(panelAction).mockClear();
});

const HOSTILE = "<img src=x onerror=alert(1)>";

const DATA: GiftCodesData = {
  codes: [],
  plans: [
    { id: 71, name: "پلن یک", active: true },
    { id: 72, name: HOSTILE, active: false },
  ],
  purchase_types: [
    { key: "new", label: "خرید جدید" },
    { key: "renew", label: "تمدید" },
  ],
  limits: { max_amount: 50_000_000, max_uses: 1000, max_expiry_days: 3650, list_limit: 200 },
  tabs: [],
};

const CODE: GiftCode = {
  id: 9, code: "SPRING", kind: "discount", amount: 0, percent: 15, max_discount_toman: 40000, max_uses: 10, max_uses_per_user: null, used_count: 2,
  first_purchase_only: false, purchase_types: ["new"], purchase_label: "خرید جدید", note: "بهار", is_active: true, state: "فعال",
  expiry_days: "5", expiry_label: "2030/01/01 12:00", plans_label: "پلن یک", plan_ids: [71],
};

async function posted(): Promise<{ path: string; fields: Record<string, unknown> }> {
  await waitFor(() => expect(panelAction).toHaveBeenCalledTimes(1));
  const [path, fields] = vi.mocked(panelAction).mock.calls[0] as [string, Record<string, unknown>];
  return { path, fields };
}

function renderForm(code?: GiftCode) {
  render(<GiftCodeForm data={DATA} code={code} onSaved={() => undefined} onCancel={code ? () => undefined : undefined} />);
}

describe("gift code form", () => {
  it("asks for the expiry in days and never sends the old date-time field", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByRole("textbox", { name: /^مبلغ شارژ/ }), "50000");
    await user.type(screen.getByRole("spinbutton", { name: /مدت اعتبار/ }), "30");
    await user.click(screen.getByRole("button", { name: "ساخت کد" }));
    const { path, fields } = await posted();
    expect(path).toBe("/plans/gift-codes");
    expect(fields).toMatchObject({ kind: "wallet", amount: "50000", max_uses: "1", max_uses_per_user: "1", expires_in_days: "30", expires_in_days_shown: "" });
    expect(fields).not.toHaveProperty("expires_at");
    expect(screen.queryByText(/YYYY-MM-DD/)).toBeNull();
    // A wallet code carries none of the discount rules.
    for (const name of ["percent", "max_discount_toman", "first_purchase_only", "purchase_types", "plan_ids"]) expect(fields).not.toHaveProperty(name);
  });

  it("makes a code without an expiry by default, and the «بدون انقضا» box brings the days back", async () => {
    const user = userEvent.setup();
    renderForm();
    const days = screen.getByRole("spinbutton", { name: /مدت اعتبار/ }) as HTMLInputElement;
    const none = screen.getByRole("checkbox", { name: "بدون انقضا" });
    expect(days.value).toBe("");
    expect((none as HTMLInputElement).checked).toBe(true);
    await user.click(none);
    expect(days.value).toBe("30");
    await user.click(none);
    expect(days.value).toBe("");
    expect(days.getAttribute("max")).toBe("3650");
    expect(days.getAttribute("min")).toBe("1");
  });

  it("keeps the exact expiry on an edit by sending the days it was opened with, and shows the current one", async () => {
    const user = userEvent.setup();
    renderForm(CODE);
    expect((screen.getByRole("spinbutton", { name: /مدت اعتبار/ }) as HTMLInputElement).value).toBe("5");
    expect(screen.getByText("2030/01/01 12:00")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "ذخیره تنظیمات" }));
    const { path, fields } = await posted();
    expect(path).toBe("/plans/gift-codes/9/edit");
    expect(fields).toMatchObject({ expires_in_days: "5", expires_in_days_shown: "5", percent: "15", max_discount_toman: "40000", max_uses: "10", max_uses_per_user: "", plan_ids: ["71"], purchase_types: ["new"] });
    expect(fields).not.toHaveProperty("code");
  });

  it("removes the expiry of a code that had one, while still saying which days the form showed", async () => {
    const user = userEvent.setup();
    renderForm(CODE);
    await user.click(screen.getByRole("checkbox", { name: "بدون انقضا" }));
    await user.click(screen.getByRole("button", { name: "ذخیره تنظیمات" }));
    expect((await posted()).fields).toMatchObject({ expires_in_days: "", expires_in_days_shown: "5" });
  });

  it("lets an expired code be saved as it is: its field starts at 0 days", () => {
    renderForm({ ...CODE, expiry_days: "0", state: "منقضی" });
    const days = screen.getByRole("spinbutton", { name: /مدت اعتبار/ }) as HTMLInputElement;
    expect(days.value).toBe("0");
    expect(days.getAttribute("min")).toBe("0");
  });

  it("sends an empty cap for a limit switched to «نامحدود» and the number again when it is switched back", async () => {
    const user = userEvent.setup();
    renderForm(CODE);
    // The per-user cap of this code is already unlimited; the total cap is 10.
    const [total, perUser] = screen.getAllByRole("checkbox", { name: "نامحدود" });
    expect((perUser as HTMLInputElement).checked).toBe(true);
    await user.click(total);
    await user.click(perUser);
    await user.click(screen.getByRole("button", { name: "ذخیره تنظیمات" }));
    expect((await posted()).fields).toMatchObject({ max_uses: "", max_uses_per_user: "1" });
  });

  it("limits a discount code to the plans ticked, names an inactive plan and keeps names as text", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: /نوع کد/ }));
    await user.click(await screen.findByRole("option", { name: "تخفیف درصدی خرید" }));
    expect(screen.getByText(`${HOSTILE} (غیرفعال)`)).toBeTruthy();
    expect(document.querySelector("img[onerror]")).toBeNull();
    await user.type(screen.getByRole("spinbutton", { name: "درصد تخفیف" }), "20");
    await user.click(screen.getByRole("checkbox", { name: "پلن یک" }));
    await user.click(screen.getByRole("button", { name: "ساخت کد" }));
    const { fields } = await posted();
    expect(fields).toMatchObject({ kind: "discount", percent: "20", max_discount_toman: "", plan_ids: ["71"], purchase_types: [] });
    expect(fields).not.toHaveProperty("amount");
  });

  it("offers the plan list only to a shop that has plans", async () => {
    const user = userEvent.setup();
    render(<GiftCodeForm data={{ ...DATA, plans: [] }} code={{ ...CODE, plan_ids: [] }} onSaved={() => undefined} />);
    expect(screen.queryByText("فقط برای این پلن‌ها")).toBeNull();
    await user.click(screen.getByRole("button", { name: "ذخیره تنظیمات" }));
    expect((await posted()).fields.plan_ids).toEqual([]);
  });

  it("switching on «فقط خرید اول» limits the code to new purchases", async () => {
    const user = userEvent.setup();
    renderForm({ ...CODE, purchase_types: ["new", "renew"], plan_ids: [] });
    await user.click(screen.getByRole("switch", { name: /فقط خرید اول/ }));
    await user.click(screen.getByRole("button", { name: "ذخیره تنظیمات" }));
    expect((await posted()).fields).toMatchObject({ first_purchase_only: true, purchase_types: ["new"] });
  });
});

describe("gift code fields", () => {
  it("drops the fields the other kind owns and the custom code of an edit", () => {
    const base = { kind: "wallet" as const, amount: "5", percent: "", cap: "", maxUses: "1", perUser: "", days: "", shownDays: "", custom: "X", note: "", firstOnly: false, types: [], planIds: [], editing: false };
    expect(giftCodeFields(base)).toMatchObject({ amount: "5", code: "X" });
    expect(giftCodeFields({ ...base, editing: true })).not.toHaveProperty("code");
    expect(giftCodeFields({ ...base, kind: "discount", percent: "10" })).toMatchObject({ percent: "10", plan_ids: [] });
    expect(giftCodeFields({ ...base, kind: "discount", percent: "10" })).not.toHaveProperty("amount");
  });
});
