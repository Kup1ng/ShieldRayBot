import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import "../../test/harness"; // unmounts rendered screens after every test
import { priceView } from "./catalogPrice";
import { PriceText } from "./PriceText";

describe("catalog price display", () => {
  it("shows a temporary offer as the struck-out old price, the new price and its deadline", () => {
    const { container } = render(<PriceText quote={{ price: 80000, original_price: 100000, discount_ends_at: "2026-10-14T12:00:00Z" }} />);
    const old = container.querySelector("s");
    expect(old?.textContent).toContain("۱۰۰,۰۰۰ تومان");
    expect(screen.getByText("۸۰,۰۰۰ تومان").closest("b")).toBeTruthy();
    expect(screen.getByText("۸۰,۰۰۰ تومان").closest("s")).toBeNull();
    expect(screen.getByText(/تخفیف تا/)).toBeTruthy();
  });

  it("writes the deadline in Persian digits and Tehran time", () => {
    // 12:00 UTC is 15:30 in Tehran.
    const { container } = render(<PriceText quote={{ price: 80000, original_price: 100000, discount_ends_at: "2026-10-14T12:00:00Z" }} />);
    expect(container.textContent).toContain("تخفیف تا ۱۴۰۵/۷/۲۲, ۱۵:۳۰");
  });

  it("reads the old price aloud for screen readers", () => {
    render(<PriceText quote={{ price: 80000, original_price: 100000, discount_ends_at: null }} />);
    expect(screen.getByText(/قیمت پیشین/)).toBeTruthy();
  });

  it("keeps the amount in a bidi-isolated span, never a forced left-to-right box", () => {
    // Forcing LTR would put the currency before the amount inside Persian text.
    const { container } = render(<PriceText quote={{ price: 80000, original_price: 100000, discount_ends_at: "2026-10-14T12:00:00Z" }} />);
    expect(container.querySelector('[dir="ltr"]')).toBeNull();
    expect(container.querySelectorAll("bdi").length).toBeGreaterThanOrEqual(2);
  });

  it("shows a permanent price plainly, with no strike-through and no deadline", () => {
    const { container } = render(<PriceText quote={{ price: 80000, original_price: null, discount_ends_at: null }} />);
    expect(container.querySelector("s")).toBeNull();
    expect(screen.queryByText(/تخفیف/)).toBeNull();
    expect(screen.getByText("۸۰,۰۰۰ تومان")).toBeTruthy();
  });

  it("does not strike anything out when the old price is not higher", () => {
    const { container } = render(<PriceText quote={{ price: 100000, original_price: 80000 }} />);
    expect(container.querySelector("s")).toBeNull();
    expect(screen.queryByText(/تخفیف/)).toBeNull();
  });

  it("shows no deadline for an offer without an end", () => {
    render(<PriceText quote={{ price: 80000, original_price: 100000, discount_ends_at: null }} />);
    expect(screen.queryByText(/تخفیف تا/)).toBeNull();
  });

  it("turns hostile price and deadline values into plain numbers and no markup", () => {
    const hostile = { price: '<img onerror="alert(1)">' as unknown as number, original_price: 100, discount_ends_at: '<svg onload="alert(1)">' };
    const { container } = render(<PriceText quote={hostile} />);
    expect(container.querySelector("img, svg")).toBeNull();
    expect(container.innerHTML).not.toContain("onerror");
    expect(container.innerHTML).not.toContain("onload");
    expect(screen.queryByText(/تخفیف تا/)).toBeNull();
  });
});

describe("priceView", () => {
  it("is plain when there is no real offer", () => {
    expect(priceView({ price: 80, original_price: null })).toEqual({ price: 80, previous: null, deadline: "" });
    expect(priceView({ price: 100, original_price: 80 })).toEqual({ price: 100, previous: null, deadline: "" });
    expect(priceView({ price: 100, original_price: 100 }).previous).toBeNull();
  });

  it("keeps whole-number money and ignores an unreadable deadline", () => {
    const view = priceView({ price: 80000, original_price: 100000, discount_ends_at: "not a date" });
    expect(view).toEqual({ price: 80000, previous: 100000, deadline: "" });
  });
});
