import { describe, expect, it } from "vitest";

import { fa } from "../../core/format";
import { hiddenCopy, inboxAlerts } from "./inboxAlerts";
import type { InboxData } from "./types";

function inbox(overrides: Partial<InboxData> = {}): InboxData {
  return {
    has_items: true,
    hidden_count: 0,
    update: null,
    ticket_alert: null,
    shop_maintenance: false,
    capacity_warn: false,
    payg: { suspended: [], low: [], threshold: 0, review: 0, max_names: 3 },
    action_center: { has_items: false, entries: [], pending: 0, tickets: 0 },
    ...overrides,
  };
}

describe("inboxAlerts", () => {
  it("has no rows for an empty inbox", () => {
    expect(inboxAlerts(inbox())).toEqual([]);
  });

  it("builds each alert with the key the dismiss form expects", () => {
    const rows = inboxAlerts(
      inbox({
        update: { version: "1.0", remote_version: "1.1" },
        ticket_alert: { title: "تیکت", detail: "d", href: "/tickets", entity_id: "7" },
        shop_maintenance: true,
        capacity_warn: true,
      }),
    );
    expect(rows.map((r) => r.key)).toEqual(["update", "ticket_alert", "shop_maintenance", "capacity_warn"]);
    expect(rows[0]).toMatchObject({ title: "نسخه 1.1 منتشر شده", detail: "نسخه فعلی شما 1.0 است." });
    expect(rows[1].entity).toBe("7");
    expect(rows.every((r) => r.entity === "" || r.key === "ticket_alert")).toBe(true);
  });

  it("lists at most three reseller names and marks the rest", () => {
    const suspended = ["الف", "ب", "ج", "د"].map((label) => ({ label, balance: -1 }));
    const [row] = inboxAlerts(inbox({ payg: { suspended, low: [], threshold: 0, review: 0, max_names: 3 } }));
    expect(row).toMatchObject({ key: "payg_suspended", status: "danger", title: `${fa(4)} نماینده PAYG مسدود`, detail: "الف، ب، ج…" });
  });

  it("shows the threshold and balances of low-balance resellers", () => {
    const [row] = inboxAlerts(inbox({ payg: { suspended: [], low: [{ label: "ع", balance: 500 }], threshold: 1000, review: 0, max_names: 3 } }));
    expect(row.detail).toBe(`آستانه ${fa(1000)} — ع (${fa(500)})`);
  });

  it("links charges waiting for a decision to their review page and keeps them from being hidden", () => {
    const [row] = inboxAlerts(inbox({ payg: { suspended: [], low: [], threshold: 0, review: 2, max_names: 3 } }));
    expect(row).toMatchObject({ key: "payg_review", title: `${fa(2)} هزینهٔ PAYG در انتظار بازبینی`, action: { label: "بازبینی", href: "/payg/charges/review" }, undismissable: true });
  });

  it("explains the hidden-alerts card by what the inbox holds", () => {
    expect(hiddenCopy({ hidden_count: 2, has_items: false }).title).toBe(`${fa(2)} اعلان مخفی شده`);
    expect(hiddenCopy({ hidden_count: 0, has_items: false }).title).toBe("اعلانی برای نمایش نیست");
    expect(hiddenCopy({ hidden_count: 0, has_items: true }).title).toBe("مدیریت اعلان‌های مخفی");
  });
});
