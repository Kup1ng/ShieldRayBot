import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return { ...actual, panelAction: vi.fn() };
});

import type { MainAppGuide } from "../../settings-ui/types";
import { MiniappTab } from "./MiniappTab";
import type { MiniappExtra, TabData } from "./types";

afterEach(cleanup);

const URL = "https://panel.example.com/miniapp/";
const GUIDE: MainAppGuide = { url: URL, bot_username: "PlatformBot", enabled: true, open_link: "https://t.me/PlatformBot?startapp" };
const TITLE = "دکمهٔ «Open» در جستجوی تلگرام";

function tab(guide: MainAppGuide | null): TabData<MiniappExtra> {
  return {
    tab: "miniapp",
    nav: { kind: "bot", panel_tabs: [], security_href: "/security", groups: [] },
    extra: { accent: "", presets: [], notice: "", notice_max: 200, shops_enabled: false, miniapp_url: URL, main_app: guide },
  };
}

describe("the platform Mini App tab's «Open» button guide", () => {
  it("shows the address, the bot, the status Telegram reports and the test link, without the shop warning", () => {
    render(<MiniappTab data={tab(GUIDE)} reload={() => undefined} />);
    expect(screen.getByText(TITLE)).toBeTruthy();
    expect(screen.getByDisplayValue(URL).getAttribute("dir")).toBe("ltr");
    expect(screen.getByText("روشن")).toBeTruthy();
    expect(screen.getByText("@PlatformBot")).toBeTruthy();
    expect(screen.getByRole("link", { name: GUIDE.open_link }).getAttribute("rel")).toContain("noopener");
    expect(screen.queryByText(/آدرس مینی‌اپ پلتفرم را در ربات فروشگاه وارد نکنید/)).toBeNull();
  });

  it("says the status is unknown when Telegram did not answer", () => {
    render(<MiniappTab data={tab({ ...GUIDE, enabled: null })} reload={() => undefined} />);
    expect(screen.getByText("نامشخص")).toBeTruthy();
    expect(screen.getByText(/پاسخ تلگرام دریافت نشد/)).toBeTruthy();
  });

  it("says what is missing instead of an address while HTTPS is not ready", () => {
    render(<MiniappTab data={tab({ url: "", bot_username: "PlatformBot", enabled: null, open_link: "https://t.me/PlatformBot?startapp" })} reload={() => undefined} />);
    expect(screen.getByText(/آدرس HTTPS مینی‌اپ آماده نیست/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "کپی آدرس مینی‌اپ" })).toBeNull();
  });

  it("shows nothing without a guide", () => {
    render(<MiniappTab data={tab(null)} reload={() => undefined} />);
    expect(screen.queryByText(TITLE)).toBeNull();
  });
});
