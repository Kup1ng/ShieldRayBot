import { describe, expect, it } from "vitest";

import { availableOps, eligibleIds } from "./bulk";
import {
  addAddresses,
  createUserError,
  createUserFields,
  defaultCreateMode,
  editUserFields,
  editUserForm,
  groupBodyFields,
  hostFields,
  hostForm,
  templateFields,
  templateForm,
  USERNAME_ERROR,
  type CreateUserForm,
} from "./forms";
import { groupLabels, userStatusColor } from "./format";
import type { PgHostRow, PgTemplateRow, PgUserRow } from "./types";

const blank: CreateUserForm = { username: "user_01", mode: "custom", gb: "", days: "", hwid: "", groupIds: ["1"], templateId: "" };

describe("create user form", () => {
  it("refuses a username the handler would refuse, before posting", () => {
    for (const bad of ["ab", "has space", "کاربر", "x".repeat(33), ""]) expect(createUserError({ ...blank, username: bad })).toBe(USERNAME_ERROR);
    expect(createUserError(blank)).toBeNull();
  });

  it("needs a group in custom mode and a template in template mode", () => {
    expect(createUserError({ ...blank, groupIds: [] })).toBeTruthy();
    expect(createUserError({ ...blank, mode: "template", groupIds: [], templateId: "" })).toBeTruthy();
    expect(createUserError({ ...blank, mode: "template", groupIds: [], templateId: "7" })).toBeNull();
  });

  it("posts the old field names: one group_<id> per chosen group in custom mode", () => {
    expect(createUserFields({ ...blank, gb: "50", days: "30", hwid: "2", groupIds: ["1", "4"] })).toEqual({
      username: "user_01",
      mode: "custom",
      data_limit_gb: "50",
      duration_days: "30",
      hwid_limit: "2",
      group_1: "1",
      group_4: "4",
    });
  });

  it("posts only the template in template mode", () => {
    expect(createUserFields({ ...blank, mode: "template", templateId: "7", groupIds: ["1"], gb: "9" })).toEqual({ username: "user_01", mode: "template", template_id: "7" });
  });

  it("opens in template mode when the role requires it or only templates are possible", () => {
    expect(defaultCreateMode({ requireTemplate: true, canCustom: true, canTemplate: true })).toBe("template");
    expect(defaultCreateMode({ requireTemplate: false, canCustom: false, canTemplate: true })).toBe("template");
    expect(defaultCreateMode({ requireTemplate: false, canCustom: true, canTemplate: true })).toBe("custom");
  });
});

const user: PgUserRow = {
  id: 5, username: "alice", status: "active", status_label: "فعال", disabled: false, on_hold: false, used_traffic: 1, data_limit: 2,
  traffic_text: "1 / 2 گیگ", traffic_percent: 50, data_gb: 50, days_left: 12, expire_text: "x", owner: "", hwid_limit: 3, group_ids: [1, 2], ops: ["delete"],
};

describe("edit user form", () => {
  it("starts from the user's current limits and groups", () => {
    expect(editUserForm(user)).toEqual({ gb: "50", days: "12", hwid: "3", groupIds: ["1", "2"] });
    expect(editUserForm({ ...user, data_gb: null, days_left: null, hwid_limit: null })).toEqual({ gb: "", days: "", hwid: "", groupIds: ["1", "2"] });
  });

  it("always sends the device limit (empty means unlimited) and edit_group_<id> per group", () => {
    expect(editUserFields({ gb: "", days: "", hwid: "", groupIds: ["2"] })).toEqual({ data_limit_gb: "", duration_days: "", hwid_limit: "", edit_group_2: "2" });
  });
});

describe("template, group and host forms", () => {
  const template: PgTemplateRow = { id: 7, name: "ماهانه", data_limit: 1, limit_text: "x", data_gb: 30, expire_days: null, group_ids: [1] };

  it("defaults a new template to 30 days and keeps an existing one's values", () => {
    expect(templateForm(null).days).toBe("30");
    expect(templateForm(template)).toEqual({ name: "ماهانه", gb: "30", days: "30", groupIds: ["1"] });
    expect(templateFields({ name: " A ", gb: "", days: "10", groupIds: ["1", "3"] })).toEqual({ name: "A", data_limit_gb: "", expire_days: "10", g_1: "1", g_3: "3" });
  });

  it("posts group tags as tag_<n> and is_disabled only when on in the edit form", () => {
    const form = { name: "Main", tags: ["vless", "trojan"], disabled: true };
    expect(groupBodyFields(form, { editing: true })).toEqual({ name: "Main", tag_1: "vless", tag_2: "trojan", is_disabled: "1" });
    expect(groupBodyFields(form, { editing: false })).toEqual({ name: "Main", tag_1: "vless", tag_2: "trojan" });
    expect(groupBodyFields({ ...form, disabled: false }, { editing: true })).not.toHaveProperty("is_disabled");
  });

  it("joins host addresses with commas and falls back to priority 0", () => {
    const row: PgHostRow = { id: 3, remark: "IR", address: ["a.example", "b.example"], port: 443, inbound_tag: "vless", priority: 2, is_disabled: false };
    expect(hostFields(hostForm(row))).toEqual({ remark: "IR", address: "a.example,b.example", port: "443", priority: "2", inbound_tag: "vless" });
    expect(hostFields({ ...hostForm(row), priority: "" }).priority).toBe("0");
  });

  it("splits pasted addresses on commas, Persian commas and lines without duplicates", () => {
    expect(addAddresses(["a.example"], "b.example, a.example،c.example\nd.example")).toEqual(["a.example", "b.example", "c.example", "d.example"]);
    expect(addAddresses([], "  ")).toEqual([]);
  });
});

describe("bulk eligibility and labels", () => {
  const rows = [
    { id: 1, ops: ["disable", "delete"] },
    { id: 2, ops: ["enable"] },
    { id: null, ops: ["delete"] },
  ];

  it("lists only selected rows that accept the operation", () => {
    expect(eligibleIds(rows, new Set([1, 2]), "delete")).toEqual([1]);
    expect(availableOps(rows, new Set([2]), ["disable", "enable", "delete"])).toEqual(["enable"]);
    expect(availableOps(rows, new Set(), ["disable"])).toEqual([]);
  });

  it("names groups and keeps an id the allow-list hides", () => {
    expect(groupLabels([1, 9], [{ id: 1, name: "Main" }])).toEqual(["Main", "9"]);
  });

  it("colors a status by what the staff member should notice", () => {
    expect(userStatusColor({ disabled: true, on_hold: false, status: "disabled" })).toBe("warning");
    expect(userStatusColor({ disabled: false, on_hold: false, status: "expired" })).toBe("danger");
    expect(userStatusColor({ disabled: false, on_hold: false, status: "active" })).toBe("success");
  });
});
