import { describe, expect, it } from "vitest";

import { INHERIT_STYLE, serializeContacts } from "./contacts";

describe("support contacts", () => {
  it("omits the style for inherit but keeps an explicit white button", () => {
    const rows = [
      { id: "a", title: "A", telegram: "@a", sort: 0, enabled: true, style: INHERIT_STYLE },
      { id: "b", title: "B", telegram: "@b", sort: 1, enabled: false, style: "" },
      { id: "c", title: "", telegram: "", sort: 2, enabled: true, style: "primary" },
    ];
    const saved = JSON.parse(serializeContacts(rows));
    expect(saved).toHaveLength(2);
    expect("button_style" in saved[0]).toBe(false);
    expect(saved[1].button_style).toBe("");
  });
});
