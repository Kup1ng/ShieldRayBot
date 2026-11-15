import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { activeSection, MarketingStrip } from "./sections";
import { settingsTabFor } from "./LoyaltySettingsModal";

const SECTIONS = [
  { key: "club", label: "باشگاه مشتریان", href: "/loyalty?tab=overview" },
  { key: "club_transactions", label: "تراکنش‌های باشگاه", href: "/loyalty?tab=transactions" },
  { key: "campaigns", label: "کمپین هدفمند", href: "/campaigns" },
];

afterEach(() => window.history.replaceState(null, "", "/"));

describe("marketing tab strip", () => {
  it("tells the two loyalty entries apart by ?tab=", () => {
    expect(activeSection("/loyalty", "")).toBe("club");
    expect(activeSection("/loyalty", "?tab=transactions")).toBe("club_transactions");
    expect(activeSection("/campaigns", "")).toBe("campaigns");
    expect(activeSection("/funnel", "")).toBe("funnel");
    expect(activeSection("/broadcast", "")).toBe("broadcast");
    expect(activeSection("/users", "")).toBe("");
  });

  it("marks only the section of the current page", () => {
    window.history.replaceState(null, "", "/loyalty?tab=transactions");
    render(<MarketingStrip sections={SECTIONS} />);
    const current = screen.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page");
    expect(current.map((link) => link.textContent)).toEqual(["تراکنش‌های باشگاه"]);
  });

  it("draws no strip for a single section", () => {
    window.history.replaceState(null, "", "/campaigns");
    const { container } = render(<MarketingStrip sections={[SECTIONS[2]!]} />);
    expect(container.querySelector("nav")).toBeNull();
  });

  it("escapes a hostile section label instead of inserting markup", () => {
    window.history.replaceState(null, "", "/campaigns");
    const hostile = [{ key: "x", label: "<img src=x onerror=alert(1)>", href: "/loyalty" }, SECTIONS[2]!];
    const { container } = render(<MarketingStrip sections={hostile} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });
});

describe("loyalty settings tab choice", () => {
  it("opens the named tab and falls back to the club tab", () => {
    expect(settingsTabFor("rules", false)).toBe("rules");
    expect(settingsTabFor("wheel", true)).toBe("wheel");
    expect(settingsTabFor("1", true)).toBe("club");
    expect(settingsTabFor("", true)).toBe("club");
    expect(settingsTabFor("nope", true)).toBe("club");
  });

  it("never opens the invite-text tab for staff who may not edit it", () => {
    expect(settingsTabFor("referral", true)).toBe("referral");
    expect(settingsTabFor("referral", false)).toBe("club");
  });
});
