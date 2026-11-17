import { describe, expect, it } from "vitest";

import { adminPath, convertFields, createFields, createProblem, deleteCopy, emptyCreateDraft, resellerFields, staffFields } from "./adminForms";
import { isMoved } from "./data";
import { faDigits, partsText, planLabel, statusColor } from "./format";
import { applyMetrics, areaPoints, backoffDelay, MAX_BACKOFF_MS, POLL_MS, pushSample, rateText, SAMPLES, seedState, sparkPoints } from "./live";
import { allowedOps, NODE_OPS, operableIds, sortNodes } from "./nodeOps";
import type { LiveRates, Metrics, NodeRow, PlanOption } from "./types";

const RATES: LiveRates = { rate_up: 1000, rate_down: 2000, rate_up_num: "1", rate_up_unit: "کیلوبایت/ثانیه", rate_down_num: "2", rate_down_unit: "کیلوبایت/ثانیه" };

function node(patch: Partial<NodeRow>): NodeRow {
  return {
    id: 1,
    name: "n",
    address: "1.1.1.1",
    port: 62050,
    status: "connected",
    status_label: "متصل",
    status_kind: "ok",
    traffic_up: 10,
    traffic_down: 20,
    traffic_total: 30,
    traffic_up_text: "10",
    traffic_down_text: "20",
    traffic_total_text: "30",
    ...patch,
  };
}

describe("persian digits", () => {
  it("converts the server's latin figures and decimal mark", () => {
    expect(faDigits("1.5 گیگ")).toBe("۱٫۵ گیگ");
    expect(faDigits(null)).toBe("");
  });

  it("shows a missing part as a dash", () => {
    expect(partsText({ num: "—", unit: "" })).toBe("—");
    expect(partsText({ num: "12", unit: "مگ" })).toBe("۱۲ مگ");
    expect(partsText(undefined)).toBe("—");
  });

  it("maps node status kinds to chip colors", () => {
    expect(statusColor("ok")).toBe("success");
    expect(statusColor("warn")).toBe("warning");
    expect(statusColor("err")).toBe("danger");
    expect(statusColor("anything")).toBe("default");
  });
});

describe("plan labels", () => {
  const fixed: PlanOption = { id: 1, name: "ماهانه", plan_kind: "subscription", billing_mode: "fixed", price_per_gb: 0, duration_days: 30 };
  const payg: PlanOption = { id: 2, name: "حجمی", plan_kind: "subscription", billing_mode: "payg", price_per_gb: 1500, duration_days: 0 };
  const capacity: PlanOption = { id: 3, name: "ظرفیت فعلی", plan_kind: "current_capacity", billing_mode: "fixed", price_per_gb: 0, duration_days: 0 };

  it("tags the grant forms' options and shows duration or price per GB", () => {
    expect(planLabel(fixed, { tagged: true, withDuration: true })).toBe("[ثابت] ماهانه — ۳۰ روز");
    expect(planLabel(payg, { tagged: true, withDuration: true })).toContain("[PAYG] حجمی · ");
    expect(planLabel(capacity, { tagged: true, withDuration: true })).toBe("[ظرفیت فعلی] ظرفیت فعلی");
  });

  it("leaves the duration out of the create form and the tag out of the secondary admin form", () => {
    expect(planLabel(fixed, { tagged: true, withDuration: false })).toBe("[ثابت] ماهانه");
    expect(planLabel(fixed, { tagged: false, withDuration: true })).toBe("ماهانه — ۳۰ روز");
  });
});

describe("live chart", () => {
  it("keeps the newest samples and counts a missing one as zero", () => {
    let buffer: number[] = [];
    for (let i = 1; i <= SAMPLES + 5; i += 1) buffer = pushSample(buffer, i);
    expect(buffer).toHaveLength(SAMPLES);
    expect(buffer[buffer.length - 1]).toBe(SAMPLES + 5);
    expect(pushSample([], null)).toEqual([0]);
    expect(pushSample([], -4)).toEqual([0]);
  });

  it("draws one sample as a level line and the newest sample on the left edge", () => {
    expect(sparkPoints([], 10)).toBe("");
    const single = sparkPoints([5], 10).split(" ");
    expect(single).toHaveLength(2);
    expect(single[0].startsWith("0.0,")).toBe(true);
    const line = sparkPoints([1, 2, 3], 3).split(" ");
    expect(line[2].startsWith("0.0,")).toBe(true);
    expect(Number(line[0].split(",")[0])).toBeGreaterThan(Number(line[1].split(",")[0]));
  });

  it("closes the line down to the bottom edge for the shaded area", () => {
    expect(areaPoints("")).toBe("");
    const area = areaPoints("0.0,10.0 100.0,20.0", 60).split(" ");
    expect(area[0]).toBe("0.0,60");
    expect(area[area.length - 1]).toBe("100.0,60");
  });

  it("formats the peak with the server's units", () => {
    expect(rateText(0)).toBe("۰ بایت/ثانیه");
    expect(rateText(2048)).toBe("۲ کیلوبایت/ثانیه");
    expect(rateText(null)).toBe("—");
  });

  it("waits longer after each failure up to a limit", () => {
    expect(backoffDelay(0)).toBe(0);
    expect(backoffDelay(1)).toBe(POLL_MS);
    expect(backoffDelay(2)).toBe(POLL_MS * 2);
    expect(backoffDelay(20)).toBe(MAX_BACKOFF_MS);
  });

  it("seeds from the widgets and applies a poll without losing the host card when the poll has none", () => {
    const seed = seedState({ host: null, live: RATES, nodes: [] });
    expect(seed.up).toEqual([1000]);
    const metrics: Metrics = {
      cpu_percent: null,
      memory_percent: null,
      memory_ratio_text: null,
      cpu_cores: null,
      cpu_tone: "neutral",
      mem_tone: "neutral",
      live: { ...RATES, rate_up: null, rate_down: null },
      nodes: [],
    };
    const next = applyMetrics({ ...seed, stale: true }, metrics);
    expect(next.stale).toBe(false);
    expect(next.host).toBeNull();
    expect(next.up).toEqual([1000]);
    const withHost = applyMetrics(seed, { ...metrics, cpu_percent: 40, live: RATES });
    expect(withHost.host?.cpu_percent).toBe(40);
    expect(withHost.up).toEqual([1000, 1000]);
  });
});

describe("node operations", () => {
  it("offers only the operations the staff member holds", () => {
    expect(allowedOps({ reconnect: true, create: true, update: false, delete: false })).toEqual(["reconnect"]);
    expect(allowedOps({ reconnect: false, create: false, update: true, delete: true })).toEqual(["sync", "reset", "toggle", "delete"]);
    expect(allowedOps({ reconnect: false, create: true, update: false, delete: false })).toEqual([]);
  });

  it("asks before the destructive single operations the old page asked about", () => {
    expect(NODE_OPS.reset.askOne?.tone).toBe("warning");
    expect(NODE_OPS.delete.askOne?.tone).toBe("danger");
    expect(NODE_OPS.reconnect.askOne).toBeUndefined();
    expect(NODE_OPS.delete.askMany(3).text).toContain("۳");
    expect(NODE_OPS.sync.path(7)).toBe("/pg/nodes/7/sync");
  });

  it("never selects a node without an id", () => {
    expect(operableIds([node({ id: null }), node({ id: 4 })])).toEqual([4]);
  });

  it("sorts by a column and puts missing figures first", () => {
    const rows = [node({ id: 1, name: "b", traffic_total: 5 }), node({ id: 2, name: "a", traffic_total: null }), node({ id: 3, name: "c", traffic_total: 9 })];
    expect(sortNodes(rows, { column: "name", direction: "ascending" }).map((r) => r.id)).toEqual([2, 1, 3]);
    expect(sortNodes(rows, { column: "total", direction: "descending" }).map((r) => r.id)).toEqual([3, 1, 2]);
    expect(sortNodes(rows, null)).toBe(rows);
  });
});

describe("admin forms", () => {
  const perms = ["dashboard", "plans"];

  it("refuses a username or password the panel would refuse", () => {
    const draft = emptyCreateDraft(perms);
    expect(createProblem(draft)).toContain("نام کاربری");
    expect(createProblem({ ...draft, username: "ab" })).toContain("نام کاربری");
    expect(createProblem({ ...draft, username: "bad name", password: "x".repeat(12) })).toContain("نام کاربری");
    expect(createProblem({ ...draft, username: "good_name", password: "short" })).toContain("۱۲");
    expect(createProblem({ ...draft, username: "good_name", password: "x".repeat(12) })).toBeNull();
    expect(createProblem({ ...draft, username: "good_name", password: "x".repeat(12), as_reseller: true })).toContain("پلن");
  });

  it("posts the secondary-admin switch only when the admin does not become a reseller", () => {
    const draft = { ...emptyCreateDraft(perms), username: " eve ", password: "pw" };
    const staff = createFields(draft, { canToggleOversell: true });
    expect(staff).toMatchObject({ username: "eve", grant_web: true });
    expect(staff).not.toHaveProperty("as_reseller");
    expect(staff).not.toHaveProperty("plan_id");
  });

  it("posts the reseller fields, the permission switches and the oversell switch only for the owner", () => {
    const draft = { ...emptyCreateDraft(perms), username: "eve", password: "pw", as_reseller: true, plan_id: "4", perms: ["plans"], allow_volume_oversell: true, share_pg_panel_url: true };
    const owner = createFields(draft, { canToggleOversell: true });
    expect(owner).toMatchObject({ as_reseller: true, plan_id: "4", perm_plans: true, share_pg_panel_url: true, allow_volume_oversell: true });
    expect(owner).not.toHaveProperty("perm_dashboard");
    expect(owner).not.toHaveProperty("grant_web");
    expect(createFields(draft, { canToggleOversell: false })).not.toHaveProperty("allow_volume_oversell");
  });

  it("keeps the web username equal to the PasarGuard one, in lowercase", () => {
    const staff = staffFields("Eve", { web_password: "p", pg_api_key: "", clear_pg_api_key: true, note: "n", plan_id: "", confirm_align: true });
    expect(staff).toMatchObject({ web_username: "eve", clear_pg_api_key: true, confirm_align: true });
    const grant = { plan_id: "2", web_password: "p", note: "", allow_volume_oversell: true, confirm_billing_mode_change: true };
    expect(resellerFields("Eve", grant, { canToggleOversell: true })).toMatchObject({ web_username: "eve", plan_id: "2", allow_volume_oversell: true });
    expect(convertFields(grant, { canToggleOversell: false })).toEqual({ plan_id: "2", web_password: "p", note: "", confirm_billing_mode_change: true });
  });

  it("encodes the username in an admin's action path", () => {
    expect(adminPath("a@b.c", "delete")).toBe("/pg/admins/a%40b.c/delete");
    expect(adminPath("x/../y", "delete")).toBe("/pg/admins/x%2F..%2Fy/delete");
  });

  it("says what a delete will take with it", () => {
    expect(deleteCopy("eve", "reseller").text).toContain("برگشت‌ناپذیر");
    expect(deleteCopy("eve", "pg_staff").text).toContain("دسترسی وب");
    expect(deleteCopy("eve", "none").title).toBe("تأیید حذف");
  });
});

describe("denied data requests", () => {
  it("recognises the answer a redirect becomes and nothing else", () => {
    expect(isMoved({ ok: true, message: "", location: "/pg" })).toBe(true);
    expect(isMoved({ nodes: [], location: "/pg" })).toBe(false);
    expect(isMoved(null)).toBe(false);
  });
});
