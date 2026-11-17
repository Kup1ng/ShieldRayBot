import { describe, expect, it } from "vitest";

import { buildEditFields, nextStep, type EditFormState } from "./editFields";
import { addId, formatIdList, parseIdList } from "./idList";

const BASE: EditFormState = {
  billingMode: "fixed",
  confirmBillingChange: false,
  pgAdminUsername: " shop_a ",
  pgRoleId: "10",
  perms: ["orders", "payments"],
  webPassword: "",
  pgApiKey: "",
  clearPgApiKey: false,
  botAdminIds: ["111", "222"],
  isActive: true,
  sharePgPanelUrl: false,
  allowVolumeOversell: false,
};

describe("edit form fields", () => {
  it("posts the names the old form used and leaves secrets out when empty", () => {
    const fields = buildEditFields(BASE, { oversellSwitch: false });
    expect(fields).toMatchObject({
      billing_mode: "fixed",
      pg_admin_username: "shop_a",
      pg_role_id: "10",
      perm_orders: true,
      perm_payments: true,
      bot_admin_ids: "111,222",
      is_active: true,
    });
    expect(fields).not.toHaveProperty("web_password");
    expect(fields).not.toHaveProperty("pg_api_key");
    expect(fields).not.toHaveProperty("clear_pg_api_key");
    expect(fields).not.toHaveProperty("volume_oversell_shown");
  });

  it("sends a new password and key only when typed", () => {
    const fields = buildEditFields({ ...BASE, webPassword: " new-pass ", pgApiKey: "key", clearPgApiKey: true }, { oversellSwitch: false });
    expect(fields).toMatchObject({ web_password: "new-pass", pg_api_key: "key", clear_pg_api_key: true });
  });

  it("marks the oversell switch as shown so an off switch can be saved", () => {
    expect(buildEditFields(BASE, { oversellSwitch: true })).toMatchObject({ volume_oversell_shown: true, allow_volume_oversell: false });
  });
});

describe("what happens after an action", () => {
  it("stays on the page while the handler points back to this shop", () => {
    expect(nextStep("/resellers?edit=7", 7)).toBe("stay");
    expect(nextStep(undefined, 7)).toBe("stay");
  });

  it("leaves when the handler goes to the list or another shop", () => {
    expect(nextStep("/resellers", 7)).toBe("leave");
    expect(nextStep("/resellers?edit=8", 7)).toBe("leave");
  });

  it("never follows an address outside the panel", () => {
    expect(nextStep("//evil.example", 7)).toBe("stay");
    expect(nextStep("https://evil.example/resellers", 7)).toBe("stay");
  });
});

describe("telegram id list", () => {
  it("keeps unique digit ids and drops the rest", () => {
    expect(parseIdList("111, 222 ،111;abc,۳۳۳")).toEqual(["111", "222", "333"]);
    expect(formatIdList(["1", "2"])).toBe("1,2");
  });

  it("adds one valid id and ignores a repeated or invalid one", () => {
    expect(addId(["1"], "2")).toEqual(["1", "2"]);
    expect(addId(["1"], "1")).toEqual(["1"]);
    expect(addId(["1"], "x")).toEqual(["1"]);
  });
});
