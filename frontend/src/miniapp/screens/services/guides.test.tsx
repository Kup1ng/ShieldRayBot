import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { MiniShell } from "../../layout/MiniShell";
import { customerMe, fakeApi, renderMini, type FakeReply } from "../../test/harness";
import { installTelegram } from "../../test/telegram";
import { ScreenRouter } from "../ScreenRouter";

const HOSTILE = "<img src=x onerror=alert(1)>";
const GUIDES = {
  guides: [
    {
      id: "v2box",
      title: HOSTILE,
      body: HOSTILE,
      opens_subscription: true,
      media_count: 2,
      links: [
        { label: HOSTILE, url: "https://youtu.be/abc" },
        { label: "کانال", url: "https://t.me/channel" },
        { label: "نامعتبر", url: "javascript:alert(1)" },
      ],
    },
    { id: "plain", title: "ساده", body: "متن", opens_subscription: false, media_count: 0, links: [] },
    { id: "../x", title: "عجیب", body: "متن", opens_subscription: false, media_count: 1, links: [] },
  ],
};
const SERVICE = { id: 7, username: "svc7", status: "active", status_fa: "فعال", subscription_url: "https://sub.example.com/s/tok", is_cancelled: false };

function mount(extra: Record<string, () => FakeReply | Promise<FakeReply>> = {}) {
  const api = fakeApi({
    "GET /api/mini/me": () => ({ json: customerMe() }),
    "GET /api/mini/guides": () => ({ json: GUIDES }),
    "GET /api/mini/service/7": () => ({ json: { service: SERVICE } }),
    ...extra,
  });
  renderMini(
    <MiniShell>
      <ScreenRouter />
    </MiniShell>,
    { route: { view: "service", serviceId: 7 } },
  );
  return api;
}

async function openList(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("heading", { name: "سرویس فعلی" });
  await user.click(screen.getByRole("button", { name: "راهنمای اتصال" }));
  await screen.findByText("ساده");
}

describe("connection guides", () => {
  it("lists guides as text, opens one with a way back to the list, and offers the subscription only where it applies", async () => {
    mount();
    const user = userEvent.setup();
    await openList(user);
    expect(document.querySelector("img[onerror]")).toBeNull();
    await user.click(screen.getByRole("button", { name: /۲ عکس یا ویدیو/ }));
    expect(screen.getAllByText(HOSTILE).length).toBeGreaterThan(1);
    expect(document.querySelector("img[onerror]")).toBeNull();
    expect(screen.getByRole("button", { name: "افزودن اشتراک به برنامه" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /ارسال آموزش کامل/ })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "همهٔ آموزش‌ها" }));
    await user.click(await screen.findByRole("button", { name: /ساده/ }));
    expect(screen.queryByRole("button", { name: "افزودن اشتراک به برنامه" })).toBeNull();
    expect(screen.queryByRole("button", { name: /ارسال آموزش کامل/ })).toBeNull();
  });

  it("opens only http(s) guide links, and t.me links inside Telegram", async () => {
    const { tg } = installTelegram();
    mount();
    const user = userEvent.setup();
    await openList(user);
    await user.click(screen.getByRole("button", { name: /۲ عکس یا ویدیو/ }));
    await user.click(screen.getByRole("button", { name: HOSTILE }));
    await user.click(screen.getByRole("button", { name: "کانال" }));
    await user.click(screen.getByRole("button", { name: "نامعتبر" }));
    expect(tg.openLink.mock.calls).toEqual([["https://youtu.be/abc"]]);
    expect(tg.openTelegramLink.mock.calls).toEqual([["https://t.me/channel"]]);
    expect((await screen.findAllByText("لینک معتبر نیست")).length).toBeGreaterThan(0);
  });

  it("adds the subscription to the app through its own link", async () => {
    const { tg } = installTelegram();
    mount();
    const user = userEvent.setup();
    await openList(user);
    await user.click(screen.getByRole("button", { name: /۲ عکس یا ویدیو/ }));
    await user.click(screen.getByRole("button", { name: "افزودن اشتراک به برنامه" }));
    expect(tg.openLink).toHaveBeenCalledWith("https://sub.example.com/s/tok");
  });

  it("sends the full guide as one request per tap", async () => {
    let open: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      open = resolve;
    });
    const api = mount({
      "POST /api/mini/guides/v2box/send": async () => {
        await pending;
        return { json: { ok: true, message: "آموزش فرستاده شد" } };
      },
    });
    const user = userEvent.setup();
    await openList(user);
    await user.click(screen.getByRole("button", { name: /۲ عکس یا ویدیو/ }));
    await user.dblClick(screen.getByRole("button", { name: /ارسال آموزش کامل/ }));
    await act(async () => open());
    expect(await screen.findByText("آموزش فرستاده شد")).toBeTruthy();
    const posts = api.callsTo("POST", "/api/mini/guides/");
    expect(posts.length).toBe(1);
    expect(posts[0].path).toBe("/api/mini/guides/v2box/send");
  });

  it("keeps an odd guide id inside its own path segment", async () => {
    const api = mount({ "POST /api/mini/guides/..%2Fx/send": () => ({ json: { ok: true } }) });
    const user = userEvent.setup();
    await openList(user);
    await user.click(screen.getByRole("button", { name: /عجیب/ }));
    await user.click(screen.getByRole("button", { name: /ارسال آموزش کامل/ }));
    await screen.findByText("آموزش در ربات فرستاده شد");
    expect(api.callsTo("POST", "/api/mini/guides/").map((c) => c.path)).toEqual(["/api/mini/guides/..%2Fx/send"]);
  });
});
