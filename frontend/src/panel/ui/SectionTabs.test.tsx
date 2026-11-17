import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SectionTabs } from "./SectionTabs";

const ITEMS = [
  { key: "club", label: "باشگاه مشتریان", href: "/loyalty?tab=overview" },
  { key: "club_transactions", label: "تراکنش‌های باشگاه", href: "/loyalty?tab=transactions" },
  { key: "campaigns", label: "کمپین هدفمند", href: "/campaigns" },
];

afterEach(cleanup);

describe("section tabs", () => {
  it("marks only the active page", () => {
    render(<SectionTabs label="بازاریابی و وفاداری" items={ITEMS} active="club_transactions" />);
    const current = screen.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page");
    expect(current.map((link) => link.textContent)).toEqual(["تراکنش‌های باشگاه"]);
    expect(screen.getByRole("navigation", { name: "بازاریابی و وفاداری" })).toBeTruthy();
  });

  it("links every section it is given", () => {
    render(<SectionTabs label="بازاریابی" items={ITEMS} active="club" />);
    expect(screen.getByText("کمپین هدفمند").getAttribute("href")).toBe("/campaigns");
  });

  it("draws no strip for a single section", () => {
    const { container } = render(<SectionTabs label="بازاریابی" items={[ITEMS[2]!]} active="campaigns" />);
    expect(container.querySelector("nav")).toBeNull();
  });

  it("escapes a hostile label instead of inserting markup", () => {
    const hostile = [{ key: "x", label: "<img src=x onerror=alert(1)>", href: "/loyalty" }, ITEMS[2]!];
    const { container } = render(<SectionTabs label="بازاریابی" items={hostile} active="campaigns" />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });
});
