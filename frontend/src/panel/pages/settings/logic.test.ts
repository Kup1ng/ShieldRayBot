import { describe, expect, it } from "vitest";

import { inkFor, namingSample, webhookPreview } from "./logic";

describe("small helpers", () => {
  it("builds the service naming example like the bot does", () => {
    expect(namingSample("", "-x", "", "ab12cd34")).toBe("clk_ab12cd34-x");
    expect(namingSample("vip", "", "{prefix}-{id}-{plan_volume}{plan_unit}-{username}", "r")).toBe("vip-42-30GB-ali_user");
  });

  it("picks dark ink on light brand colours and white on dark ones", () => {
    expect(inkFor("#ffffff")).toBe("#1c1007");
    expect(inkFor("#1d4ed8")).toBe("#ffffff");
  });

  it("previews the webhook address from the base or the public address", () => {
    expect(webhookPreview("https://bot.example.com/", "", "telegram/hook/")).toBe("https://bot.example.com/telegram/hook");
    expect(webhookPreview("", "https://panel.example.com", "")).toBe("https://panel.example.com/telegram/webhook");
    expect(webhookPreview("", "", "/x")).toBe("");
  });
});
