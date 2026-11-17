import { describe, expect, it } from "vitest";

import type { SettingField, SettingGroup } from "../types";
import { fieldVisible, formFields, groupVisible, initialState, isDirty } from "./logic";

const field = (patch: Partial<SettingField>): SettingField => ({ key: "k", label: "L", kind: "text", help: "", options: [], value: "", show_when: null, ...patch });

const groups: SettingGroup[] = [
  {
    name: "روش‌ها",
    gate: null,
    fields: [
      field({ key: "auto_approve_payments", kind: "toggle", value: true }),
      field({ key: "auto_approve_after_minutes", kind: "number", value: "30", show_when: { key: "auto_approve_payments", values: ["1"] } }),
      field({
        key: "crypto_rate_mode",
        kind: "select",
        value: "off",
        options: [
          { value: "off", label: "خاموش" },
          { value: "api", label: "API" },
        ],
      }),
      field({ key: "crypto_rate_api_url", value: "https://x", show_when: { key: "crypto_rate_mode", values: ["api"] } }),
      field({ key: "bbc_api_key", kind: "password", value: "", has_value: true }),
      field({ key: "pay_stars_enabled", kind: "toggle", value: false }),
    ],
  },
  { name: "استارز", gate: "pay_stars_enabled", fields: [field({ key: "stars_title", value: "T" })] },
];

describe("finance settings form", () => {
  it("shows a dependent field only while its controller allows it", () => {
    const state = initialState(groups);
    const [minutes, apiUrl] = [groups[0].fields[1], groups[0].fields[3]];
    expect(fieldVisible(minutes, state)).toBe(true);
    expect(fieldVisible(apiUrl, state)).toBe(false);
    expect(fieldVisible(minutes, { ...state, auto_approve_payments: false })).toBe(false);
    expect(fieldVisible(apiUrl, { ...state, crypto_rate_mode: "api" })).toBe(true);
  });

  it("hides a payment method card while its switch is off", () => {
    const state = initialState(groups);
    expect(groupVisible(groups[1], state)).toBe(false);
    expect(groupVisible(groups[1], { ...state, pay_stars_enabled: true })).toBe(true);
    expect(groupVisible(groups[0], state)).toBe(true);
  });

  it("sends every field, drops switches that are off and keeps a blank secret blank", () => {
    const out = formFields(groups, initialState(groups));
    expect(out.s_auto_approve_payments).toBe("1");
    expect("s_pay_stars_enabled" in out).toBe(false);
    expect(out.s_auto_approve_after_minutes).toBe("30");
    expect(out.s_crypto_rate_api_url).toBe("https://x");
    expect(out.s_bbc_api_key).toBe("");
    expect(out.s_stars_title).toBe("T");
  });

  it("notices a change, including a new secret", () => {
    const state = initialState(groups);
    expect(isDirty(groups, state)).toBe(false);
    expect(isDirty(groups, { ...state, bbc_api_key: "new" })).toBe(true);
    expect(isDirty(groups, { ...state, auto_approve_payments: false })).toBe(true);
  });

  it("posts an untouched online gateway list in the editor's form, without the has_secret flag", () => {
    const psp: SettingGroup[] = [
      { name: "g", gate: null, fields: [field({ key: "psp_gateways", kind: "psp_gateways", value: JSON.stringify([{ id: "p1", name: "Z", provider: "zarinpal", has_secret: true, enabled: true }]) })] },
    ];
    const posted = JSON.parse(formFields(psp, initialState(psp)).s_psp_gateways);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ id: "p1", name: "Z", merchant_id: "" });
    expect("has_secret" in posted[0]).toBe(false);
  });
});
