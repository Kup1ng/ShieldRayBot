import { describe, expect, it } from "vitest";

import { blankRow, parseRows, serializeRows } from "./payDest";

describe("payment destination lists", () => {
  it("starts an empty list with one blank row and tolerates broken JSON", () => {
    expect(parseRows("cards", "[]")).toHaveLength(1);
    expect(parseRows("cards", "not json")).toHaveLength(1);
    expect(parseRows("crypto", "")[0].asset).toBe("USDT");
  });

  it("keeps only digits of a card number and drops rows without one", () => {
    const rows = parseRows("cards", JSON.stringify([{ id: "a", number: "6037 9975-0000", holder: " علی ", enabled: true }]));
    rows.push(blankRow("cards"));
    const out = JSON.parse(serializeRows("cards", rows));
    expect(out).toEqual([{ id: "a", number: "603799750000", holder: "علی", enabled: true, sort: 0 }]);
  });

  it("writes a button colour only when the row does not inherit", () => {
    const rows = parseRows(
      "gateways",
      JSON.stringify([
        { id: "g", name: "N", link: "https://x/{amount}", button_style: "" },
        { id: "h", name: "M", link: "l" },
      ]),
    );
    const out = JSON.parse(serializeRows("gateways", rows));
    expect(out[0].button_style).toBe("");
    expect("button_style" in out[1]).toBe(false);
  });

  it("names an unnamed link gateway and skips an empty one", () => {
    const rows = [{ ...blankRow("gateways"), link: "https://pay" }, blankRow("gateways")];
    const out = JSON.parse(serializeRows("gateways", rows));
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("درگاه پرداخت");
  });

  it("never invents a credential: a saved online gateway sends a blank key to keep the stored one", () => {
    const rows = parseRows("psp", JSON.stringify([{ id: "p1", name: "Z", provider: "zarinpal", has_secret: true, enabled: true }]));
    expect(rows[0].hasSecret).toBe(true);
    const out = JSON.parse(serializeRows("psp", rows));
    expect(out[0].merchant_id).toBe("");
    expect(out[0].id).toBe("p1");
    expect(JSON.stringify(out)).not.toContain("has_secret");
  });

  it("drops a brand-new online gateway with neither name nor key", () => {
    expect(JSON.parse(serializeRows("psp", [blankRow("psp")]))).toEqual([]);
  });

  it("keeps the asset and network defaults of a wallet", () => {
    const out = JSON.parse(serializeRows("crypto", [{ ...blankRow("crypto"), address: " TXyz " }]));
    expect(out[0]).toMatchObject({ asset: "USDT", network: "TRC20", address: "TXyz" });
  });
});
