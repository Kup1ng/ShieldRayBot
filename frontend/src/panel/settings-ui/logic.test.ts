import { describe, expect, it } from "vitest";

import {
  checkListItem,
  fieldVisible,
  formFields,
  initialState,
  isDirty,
  moveTo,
  parseChannels,
  parseGuides,
  parseListItems,
  serializeChannels,
  serializeGuides,
  serializeListItems,
  tokenProblem,
  tokensIn,
} from "./logic";
import type { SettingField, SettingGroup } from "./types";

const field = (patch: Partial<SettingField>): SettingField => ({ key: "k", label: "L", kind: "text", help: "", options: [], value: "", show_when: null, variables: null, ...patch });

const groups: SettingGroup[] = [
  {
    name: "g",
    caption: "",
    notice: null,
    fields: [
      field({ key: "shop_title", value: "فروشگاه" }),
      field({ key: "service_import_enabled", kind: "toggle", value: true }),
      field({ key: "force_off", kind: "toggle", value: false }),
      field({ key: "service_import_mode", kind: "select", value: "instant", options: [{ value: "instant", label: "فوری" }, { value: "approval", label: "تأیید" }] }),
      field({ key: "approve_minutes", kind: "number", value: "30", show_when: { key: "service_import_mode", values: ["approval"] } }),
      field({ key: "qr_background", kind: "image", value: "uploads/qr.png" }),
      field({ key: "bbc_key", kind: "password", value: "", has_value: true }),
      field({ key: "panel_pass", kind: "text", value: "", has_value: true }),
    ],
  },
];

describe("settings form state", () => {
  it("posts every field with its s_ name; a switch that is off is left out like an unchecked box", () => {
    const posted = formFields(groups, initialState(groups));
    expect(posted).toMatchObject({ s_shop_title: "فروشگاه", s_service_import_enabled: "1", s_service_import_mode: "instant", s_approve_minutes: "30", s_bbc_key: "", s_panel_pass: "" });
    expect("s_force_off" in posted).toBe(false);
  });

  it("keeps a hidden dependent field in the post so its saved value survives", () => {
    const state = initialState(groups);
    const dependent = groups[0].fields[4];
    expect(fieldVisible(dependent, state)).toBe(false);
    expect(formFields(groups, state).s_approve_minutes).toBe("30");
    expect(fieldVisible(dependent, { ...state, service_import_mode: "approval" })).toBe(true);
  });

  it("sends an image as a file, a removal as a clear flag, and nothing when untouched", () => {
    const state = initialState(groups);
    expect("s_qr_background" in formFields(groups, state)).toBe(false);
    const file = new File(["x"], "qr.png", { type: "image/png" });
    expect(formFields(groups, state, { files: { qr_background: file }, cleared: {} }).s_qr_background).toBe(file);
    const cleared = formFields(groups, state, { files: {}, cleared: { qr_background: true } });
    expect(cleared.s_qr_background_clear).toBe("1");
    expect("s_qr_background" in cleared).toBe(false);
  });

  it("notices edits, a typed secret and a chosen image, but not a pristine form", () => {
    const state = initialState(groups);
    expect(isDirty(groups, state)).toBe(false);
    expect(isDirty(groups, { ...state, shop_title: "x" })).toBe(true);
    expect(isDirty(groups, { ...state, bbc_key: "secret" })).toBe(true);
    expect(isDirty(groups, { ...state, panel_pass: "secret" })).toBe(true);
    expect(isDirty(groups, state, { files: {}, cleared: { qr_background: true } })).toBe(true);
  });
});

describe("secrets", () => {
  it("never starts a secret with its saved value, whatever the field's kind", () => {
    const secrets: SettingGroup[] = [{ name: "g", caption: "", notice: null, fields: [field({ key: "token", kind: "text", value: "saved-secret", has_value: true })] }];
    expect(initialState(secrets).token).toBe("");
  });

  it("matches a controlling value without regard to case", () => {
    const gated = field({ key: "a", show_when: { key: "mode", values: ["approval"] } });
    expect(fieldVisible(gated, { mode: "Approval" })).toBe(true);
    expect(fieldVisible(field({ key: "b", show_when: { key: "mode", values: ["TRC20"] } }), { mode: "TRC20" })).toBe(true);
    expect(fieldVisible(gated, { mode: "instant" })).toBe(false);
  });
});

describe("list fields", () => {
  it("splits on commas, Persian commas, semicolons and lines, and normalizes money digits", () => {
    expect(parseListItems("۵۰۰۰۰، 100000;\n۰۲۰۰۰۰", "money")).toEqual(["50000", "100000", "20000"]);
    expect(parseListItems("/sub\n/hamid, admin", "text")).toEqual(["/sub", "/hamid", "admin"]);
    expect(serializeListItems(["1", "2"])).toBe("1,2");
  });

  it("refuses empty, duplicate, multi-value and out-of-range entries with a reason", () => {
    expect(checkListItem("  ", "text", []).error).not.toBe("");
    expect(checkListItem("a", "text", ["a"]).error).toContain("قبلاً");
    expect(checkListItem("a,b", "text", []).error).toContain("یک مقدار");
    expect(checkListItem("500", "money", []).error).toContain("۱٬۰۰۰");
    expect(checkListItem("3000000000", "money", []).error).not.toBe("");
    expect(checkListItem("0", "telegram", []).error).not.toBe("");
    expect(checkListItem("12x", "telegram", []).value).toBe("12");
  });

  it("accepts a valid entry, and the same value when it is the one being edited", () => {
    expect(checkListItem("۵۰٬۰۰۰", "money", [])).toEqual({ value: "50000", error: "" });
    expect(checkListItem("50000", "money", ["50000", "70000"], 0)).toEqual({ value: "50000", error: "" });
    expect(checkListItem("70000", "money", ["50000", "70000"], 0).error).not.toBe("");
  });
});

describe("forced-join channels", () => {
  it("reads the old plain list and the JSON, dropping duplicates", () => {
    expect(parseChannels("@a, @A\n@b").map((c) => c.id)).toEqual(["@a", "@b"]);
    const rows = parseChannels(JSON.stringify([{ id: "@x", required: false, link: "t.me/x", title: "ایکس" }, "@y", { id: "@x" }]));
    expect(rows).toEqual([
      { id: "@x", required: false, link: "t.me/x", title: "ایکس" },
      { id: "@y", required: true, link: "", title: "" },
    ]);
  });

  it("writes the JSON the bot reads, leaving out half-typed rows", () => {
    const json = serializeChannels([
      { id: "@x", required: true, link: "", title: "" },
      { id: "", required: true, link: "", title: "" },
      { id: "", required: false, link: "https://t.me/+abc", title: "خصوصی" },
    ]);
    expect(JSON.parse(json)).toEqual([{ id: "@x", required: true }, { id: "https://t.me/+abc", required: false, link: "https://t.me/+abc", title: "خصوصی" }]);
  });
});

describe("connection guides", () => {
  it("round-trips a guide without media and drops empty ones", () => {
    const rows = parseGuides(JSON.stringify([{ id: "v2", title: "V2Box", body: "گام", audience: "reseller", sort: 3, enabled: false, deep_link: true, style: "", links: [{ label: "ویدیو", url: "https://y.be/1" }] }, {}]));
    expect(rows[0]).toMatchObject({ id: "v2", audience: "reseller", enabled: false, style: "", sort: "3" });
    const posted = JSON.parse(serializeGuides(rows));
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ id: "v2", title: "V2Box", sort: 3, enabled: false, deep_link: true, style: "", links: [{ label: "ویدیو", url: "https://y.be/1" }] });
    expect("media" in posted[0]).toBe(false);
  });

  it("treats a missing style as the default blue and unreadable JSON as no guides", () => {
    expect(parseGuides(JSON.stringify([{ id: "a", title: "t" }]))[0].style).toBe("primary");
    expect(parseGuides("{broken")).toEqual([]);
  });
});

describe("channels and guides edge cases", () => {
  it("lets a link stand in for a missing id and drops case-insensitive duplicates", () => {
    const json = serializeChannels([
      { id: "@News", required: true, link: "", title: "Daily" },
      { id: "@news", required: false, link: "", title: "" },
      { id: "", required: true, link: "https://t.me/+abc", title: "" },
    ]);
    expect(JSON.parse(json)).toEqual([
      { id: "@News", required: true, title: "Daily" },
      { id: "https://t.me/+abc", required: true, link: "https://t.me/+abc" },
    ]);
    expect(parseChannels(json)).toHaveLength(2);
  });

  it("drops a guide with neither title nor text and empty link rows, and keeps ids", () => {
    const raw = JSON.stringify([
      { id: "g1", title: " V2Box ", body: "steps", audience: "reseller", sort: 2, enabled: false, deep_link: true, style: "", links: [{ label: "v", url: "https://x.example" }, { label: "", url: "" }] },
      { id: "g2", title: "", body: "" },
    ]);
    const guides = parseGuides(raw);
    expect(guides.map((g) => g.id)).toEqual(["g1", "g2"]);
    const saved = JSON.parse(serializeGuides(guides));
    expect(saved).toHaveLength(1);
    expect(saved[0].links).toEqual([{ label: "v", url: "https://x.example" }]);
  });

  it("keeps markup in guide titles and text as plain strings", () => {
    const [guide] = parseGuides(JSON.stringify([{ id: "g", title: "<b>x</b>", body: "<script>1</script>" }]));
    expect(guide.title).toBe("<b>x</b>");
    expect(guide.body).toBe("<script>1</script>");
  });
});

describe("menu order", () => {
  it("moves an entry to another place and stays inside the list", () => {
    expect(moveTo(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveTo(["a", "b", "c"], 1, 0)).toEqual(["b", "a", "c"]);
    expect(moveTo(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveTo(["a", "b", "c"], 2, 3)).toEqual(["a", "b", "c"]);
  });
});

describe("template tokens", () => {
  const allowed = { user_name: "نام", shop_title: "فروشگاه" };

  it("marks supported, unsupported and malformed tokens", () => {
    const tokens = tokensIn("سلام {user_name} {nope} {bad token} {open", allowed);
    const byToken = Object.fromEntries(tokens.map((t) => [t.token, t]));
    expect(byToken["{user_name}"]).toMatchObject({ valid: true, used: true });
    expect(byToken["{nope}"]).toMatchObject({ valid: false, malformed: false });
    expect(byToken["{bad token}"]).toMatchObject({ valid: false, malformed: true });
    expect(byToken["{open"]).toMatchObject({ valid: false, malformed: true });
    expect(byToken["{shop_title}"]).toMatchObject({ valid: true, used: false });
  });

  it("says which tokens a section does not support", () => {
    expect(tokenProblem(tokensIn("{nope}", allowed))).toContain("{nope}");
    expect(tokenProblem(tokensIn("{user_name}", allowed))).toBe("");
    expect(tokenProblem(tokensIn("{a b}", allowed))).toContain("قالب");
  });
});
