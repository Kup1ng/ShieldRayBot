import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const action = vi.fn();
const ask = vi.fn();

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return { ...actual, panelAction: (path: string, fields: unknown) => action(path, fields) };
});
vi.mock("../../core/confirm", () => ({ confirm: (message: string, options: unknown) => ask(message, options) }));

import { creditFields, CreditSection, isTempValid } from "./EditCredit";
import type { CreditBlock } from "./types";

const CREDIT: CreditBlock = {
  status: "active",
  frozen: false,
  limit: 500000,
  used: 120000,
  available: 380000,
  percent: 24,
  credit_limit: 500000,
  temp_limit: null,
  temp_limit_until: "",
  statements: [
    { id: 9, period: "2026-10", amount_due: 120000, due_at: "2026-11-10", status: "issued" },
    { id: 8, period: "2026-09", amount_due: 50000, due_at: "2026-10-10", status: "paid" },
  ],
  events: [{ id: 1, kind: "limit", old_value: "0", new_value: "500000", note: "<img src=x onerror=1>", actor: "owner", created_at: "2026-11-01" }],
};

const settled = vi.fn();

beforeEach(() => {
  action.mockReset();
  ask.mockReset();
  settled.mockReset();
  ask.mockResolvedValue(true);
  action.mockResolvedValue({ ok: true, message: "" });
});

afterEach(cleanup);

describe("credit field building", () => {
  it("posts the old form's fields and the marker that the freeze switch was shown", () => {
    expect(creditFields({ limit: "1000", temp: "", days: "7", note: " n ", frozen: true })).toEqual({ credit_limit: "1000", note: "n", frozen_shown: true, frozen: true });
  });

  it("sends a temporary limit together with its duration, and none without a temporary limit", () => {
    expect(creditFields({ limit: "1000", temp: "5000", days: "7", note: "", frozen: false })).toMatchObject({ temp_limit: "5000", temp_limit_days: "7" });
    expect(creditFields({ limit: "1000", temp: "", days: "7", note: "", frozen: false })).not.toHaveProperty("temp_limit_days");
  });

  it("requires a duration of 1 to 365 days only for a temporary limit", () => {
    expect(isTempValid("", "")).toBe(true);
    expect(isTempValid("5000", "")).toBe(false);
    expect(isTempValid("5000", "0")).toBe(false);
    expect(isTempValid("5000", "366")).toBe(false);
    expect(isTempValid("5000", "365")).toBe(true);
  });
});

describe("credit section", () => {
  const mount = (credit: CreditBlock = CREDIT) => render(<CreditSection shopId={5} credit={credit} onSettled={settled} />);

  it("shows the use of the line and the recent changes as text", () => {
    const { container } = mount();
    expect(screen.getByText(/۲۴٪/)).toBeTruthy();
    expect(screen.getByText(/<img src=x onerror=1>/)).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("asks before saving a limit and posts to the shop's credit handler", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "ذخیرهٔ اعتبار" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const [path, fields] = action.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/resellers/5/credit");
    expect(fields).toMatchObject({ credit_limit: "500000", frozen_shown: true, frozen: false });
    const [, options] = ask.mock.calls[0] as [string, { description: string }];
    expect(options.description).toContain("۵۰۰٬۰۰۰ تومان");
    await waitFor(() => expect(settled).toHaveBeenCalled());
  });

  it("does not post when the question is declined", async () => {
    const user = userEvent.setup();
    ask.mockResolvedValue(false);
    mount();
    await user.click(screen.getByRole("button", { name: "ذخیرهٔ اعتبار" }));
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(action).not.toHaveBeenCalled();
  });

  it("blocks saving a temporary limit that has no duration", () => {
    mount({ ...CREDIT, temp_limit: 900000 });
    expect((screen.getByRole("button", { name: "ذخیرهٔ اعتبار" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers the write-off only on an unpaid statement and says it cannot be undone", async () => {
    const user = userEvent.setup();
    mount();
    expect(screen.queryByRole("button", { name: "عملیات صورت‌حساب 2026-09" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "عملیات صورت‌حساب 2026-10" }));
    await user.click(await screen.findByRole("menuitem", { name: /بخشودگی/ }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/resellers/5/credit/statements/9/writeoff", {}));
    const [, options] = ask.mock.calls[0] as [string, { description: string }];
    expect(options.description).toContain("۱۲۰٬۰۰۰ تومان");
    expect(options.description).toContain("قابل برگشت نیست");
  });
});
