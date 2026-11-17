import { describe, expect, it } from "vitest";

import { BULK_META, editIdFrom, eligibleIds, fill, money, samePath, selectedIds, sortRows, userIdFromPath } from "./format";
import type { BulkOp, UserRow } from "./types";
import { checkAmount, normalizeAmount } from "./WalletAdjustForm";

function row(id: number, patch: Partial<UserRow> = {}): UserRow {
  return {
    id,
    telegram_id: 1000 + id,
    name: `user ${id}`,
    message_name: `user ${id}`,
    username: "",
    role: "user",
    is_demo: false,
    is_blocked: false,
    tag: { key: "green", title: "مطمئن" },
    has_alert: false,
    service_count: 0,
    services: [],
    volume_text: "—",
    expire_text: "—",
    expire_tone: "",
    days_left: null,
    wallet_balance: 0,
    can_message: true,
    can_renew: false,
    bulk_ops: [],
    ...patch,
  };
}

describe("sortRows", () => {
  const rows = [row(1, { days_left: 9, wallet_balance: 5 }), row(2, { days_left: null, wallet_balance: -3 }), row(3, { days_left: 2, wallet_balance: 50 })];

  it("keeps the server order without a sort", () => {
    expect(sortRows(rows, null).map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("puts an unknown expiry last when ascending and first when descending", () => {
    expect(sortRows(rows, { column: "expire", direction: "ascending" }).map((r) => r.id)).toEqual([3, 1, 2]);
    expect(sortRows(rows, { column: "expire", direction: "descending" }).map((r) => r.id)).toEqual([2, 1, 3]);
  });

  it("sorts by wallet, including negative balances, and does not mutate its input", () => {
    expect(sortRows(rows, { column: "wallet", direction: "descending" }).map((r) => r.id)).toEqual([3, 1, 2]);
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
  });
});

describe("bulk selection", () => {
  const rows = [row(1, { bulk_ops: ["block", "delete"] }), row(2, { bulk_ops: ["unblock"] }), row(3, { bulk_ops: ["block", "renew"] })];

  it("applies an action only to the selected rows that offer it", () => {
    const selected = new Set([1, 2, 3]);
    expect(eligibleIds(rows, selected, "block")).toEqual([1, 3]);
    expect(eligibleIds(rows, selected, "unblock")).toEqual([2]);
    expect(eligibleIds(rows, new Set([2]), "delete")).toEqual([]);
  });

  it("turns the table's selection into ids, «all» included", () => {
    expect(selectedIds("all", rows)).toEqual(new Set([1, 2, 3]));
    expect(selectedIds(new Set(["2", "x"]), rows)).toEqual(new Set([2]));
  });

  it("asks a reason for every bulk action the server logs, and fills in the count", () => {
    const withReason = (Object.keys(BULK_META) as BulkOp[]).filter((op) => BULK_META[op].reasonLabel);
    expect(withReason).toEqual(["block", "unblock", "renew", "delete"]);
    expect(fill("{n} کاربر مسدود شوند؟", 3)).toBe("۳ کاربر مسدود شوند؟");
  });
});

describe("addresses", () => {
  it("reads the customer id of the edit screen", () => {
    expect(userIdFromPath("/users/12/edit")).toBe(12);
    expect(userIdFromPath("/users/12/edit/")).toBe(12);
    expect(userIdFromPath("/users/x/edit")).toBeNull();
    expect(userIdFromPath("/users/12/delete")).toBeNull();
  });

  it("follows a handler's location only inside the panel", () => {
    expect(samePath("/users?uid=5")).toBe("/users?uid=5");
    expect(samePath("//evil.example/x")).toBeNull();
    expect(samePath("https://evil.example")).toBeNull();
    expect(samePath("/a\\b")).toBeNull();
    expect(editIdFrom("/users?uid=5&edit=5")).toBe(5);
    expect(editIdFrom("/users?uid=5")).toBeNull();
  });
});

describe("money amounts", () => {
  it("accepts Persian digits and grouping marks", () => {
    expect(normalizeAmount("۵۰٬۰۰۰")).toBe("50000");
    expect(normalizeAmount("١٢٣,٤٥٦")).toBe("123456");
  });

  it("refuses text, decimals, signs and amounts under the floor", () => {
    expect(checkAmount("50000", 1000, "مبلغ")).toEqual({ value: "50000" });
    for (const bad of ["", "abc", "12.5", "-5000", "999"]) {
      expect(checkAmount(bad, 1000, "مبلغ")).toHaveProperty("error");
    }
  });

  it("formats a balance with Persian digits and keeps its sign", () => {
    expect(money(1500)).toContain("۱");
    expect(money(-2500)).toMatch(/۲/);
  });
});
