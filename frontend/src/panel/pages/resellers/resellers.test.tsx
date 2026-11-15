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

import { eligibleFor } from "./ApplicationsPage";
import { renewAsk } from "./MySubscriptionPage";
import { ReasonDialog } from "./ReasonDialog";
import { rowActions } from "./ResellersTable";
import { shopsText } from "./ShopReviewPage";
import type { ApplicationRow, PackageChoice, ResellerRow } from "./types";

beforeEach(() => {
  action.mockReset();
  ask.mockReset();
  ask.mockResolvedValue(true);
});

afterEach(cleanup);

const ROW: ResellerRow = {
  user_id: 3,
  name: "فروشگاه",
  telegram_id: 303,
  role: "reseller",
  tag: { key: "green", title: "مطمئن" },
  billing_mode: "fixed",
  status: "active",
  oversold: false,
  bot_username: null,
  web_username: null,
  setup: "none",
  usage: { users_text: "3/10", traffic_text: "5/50", lifetime_text: null },
  wallet_balance: 0,
};

const HANDLERS = { onEdit: vi.fn(), onTag: vi.fn(), onDeleteShop: vi.fn(), onDeleteUser: vi.fn() };

describe("reseller row actions", () => {
  it("offers the owner the whole menu", () => {
    expect(rowActions(ROW, true, HANDLERS).map((a) => a.id)).toEqual(["edit", "tag", "delete_shop", "delete_user"]);
  });

  it("offers a representative only the risk tag", () => {
    expect(rowActions(ROW, false, HANDLERS).map((a) => a.id)).toEqual(["tag"]);
  });
});

describe("reason dialog", () => {
  const request = (onConfirm: (reason: string) => Promise<unknown>) => ({ title: "حذف نمایندگی", text: "حذف شود؟", reasonLabel: "علت حذف", confirmLabel: "حذف", onConfirm });

  it("keeps the confirm button off until the reason has three characters", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<ReasonDialog request={request(onConfirm)} onClose={() => undefined} />);
    const button = await screen.findByRole("button", { name: "حذف" });
    expect(button.hasAttribute("disabled") || button.getAttribute("aria-disabled") === "true").toBe(true);
    await userEvent.type(screen.getByLabelText("علت حذف"), "ab");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("passes the trimmed reason on", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<ReasonDialog request={request(onConfirm)} onClose={onClose} />);
    await userEvent.type(await screen.findByLabelText("علت حذف"), "  تخلف  ");
    await userEvent.click(screen.getByRole("button", { name: "حذف" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("تخلف"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe("applications", () => {
  const rows: ApplicationRow[] = [
    { id: 1, user_name: "a", telegram_id: 1, plan_name: "p", price: 1, status: "awaiting_approval", ops: ["approve", "reject"] },
    { id: 2, user_name: "b", telegram_id: 2, plan_name: "p", price: 1, status: "pending_payment", ops: ["reject"] },
    { id: 3, user_name: "c", telegram_id: 3, plan_name: "p", price: 1, status: "approved", ops: [] },
  ];

  it("counts only the rows that accept the operation", () => {
    const all = new Set([1, 2, 3]);
    expect(eligibleFor(rows, all, "approve")).toEqual([1]);
    expect(eligibleFor(rows, all, "reject")).toEqual([1, 2]);
  });
});

describe("my subscription", () => {
  const choice = (relation: PackageChoice["relation"]): PackageChoice => ({ plan_id: 2, name: "طلایی", users: 10, gb: 100, duration_days: 30, price: 200000, relation, label: "ارتقا", blocked: null });

  it("asks with the price before renewing the current package", () => {
    const ask = renewAsk(choice("current"));
    expect(ask.title).toBe("تمدید بسته");
    expect(ask.text).toContain("۲۰۰٬۰۰۰ تومان");
  });

  it("warns that a new package applies at once", () => {
    expect(renewAsk(choice("upgrade")).text).toContain("همین حالا اعمال می‌شود");
  });
});

describe("shop review", () => {
  it("names the platform for an empty shop", () => {
    expect(shopsText([null, 5])).toBe("پلتفرم، ۵");
    expect(shopsText([])).toBe("—");
  });
});
