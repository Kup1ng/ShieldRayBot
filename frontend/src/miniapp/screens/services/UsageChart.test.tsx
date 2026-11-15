import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { fakeApi, renderMini, type FakeReply } from "../../test/harness";
import { bytesText, usageTickLabel } from "./serviceFormat";
import { UsageChart, type UsageSeries } from "./UsageChart";

const GB = 1024 ** 3;

function series(range: UsageSeries["range"], totalBytes: number, totalText: string): UsageSeries {
  return {
    range,
    period: range === "today" ? "hour" : "day",
    points: [
      { at: "2026-11-14T00:00:00+03:30", bytes: totalBytes },
      { at: "2026-11-15T00:00:00+03:30", bytes: 0 },
    ],
    total_bytes: totalBytes,
    total_text: totalText,
  };
}

function mount(replies: Record<string, FakeReply>) {
  const routes = Object.fromEntries(Object.entries(replies).map(([key, reply]) => [key, () => reply]));
  const api = fakeApi(routes);
  renderMini(<UsageChart serviceId={7} />);
  return { api, user: userEvent.setup() };
}

const week = "GET /api/mini/service/7/usage?range=week";
const today = "GET /api/mini/service/7/usage?range=today";

describe("service usage chart", () => {
  it("opens on the last week and shows its total in Persian digits", async () => {
    mount({ [week]: { json: series("week", 25 * GB / 2, "12.5 گیگ") } });
    expect(await screen.findByLabelText("مصرف هفته اخیر: ۱۲٫۵ گیگ")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "هفته اخیر" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("img", { name: "نمودار مصرف هفته اخیر؛ جمع ۱۲٫۵ گیگ" })).toBeTruthy();
  });

  it("reads another range once and keeps the earlier one for switching back", async () => {
    const { api, user } = mount({ [week]: { json: series("week", GB, "1 گیگ") }, [today]: { json: series("today", GB / 4, "256 مگ") } });
    await screen.findByLabelText("مصرف هفته اخیر: ۱ گیگ");
    await user.click(screen.getByRole("radio", { name: "امروز" }));
    expect(await screen.findByLabelText("مصرف امروز: ۲۵۶ مگ")).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "هفته اخیر" }));
    expect(await screen.findByLabelText("مصرف هفته اخیر: ۱ گیگ")).toBeTruthy();
    expect(api.callsTo("GET", "/api/mini/service/7/usage?range=week")).toHaveLength(1);
    expect(api.callsTo("GET", "/api/mini/service/7/usage?range=today")).toHaveLength(1);
  });

  it("says so when the range has no traffic instead of drawing a flat line", async () => {
    mount({ [week]: { json: series("week", 0, "0") } });
    expect(await screen.findByText("در این بازه مصرفی ثبت نشده است.")).toBeTruthy();
  });

  it("shows the server's Persian message on failure and reads the range again on retry", async () => {
    const { api, user } = mount({ [week]: { status: 502, json: { detail: "نمودار مصرف این سرویس فعلاً در دسترس نیست." } } });
    expect(await screen.findByText("نمودار مصرف این سرویس فعلاً در دسترس نیست.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /تلاش دوباره/ }));
    await waitFor(() => expect(api.callsTo("GET", "/api/mini/service/7/usage?range=week")).toHaveLength(2));
  });
});

describe("usage chart formatting", () => {
  it("labels days in the Persian calendar and hours on the Tehran clock", () => {
    expect(usageTickLabel("2026-11-14T00:00:00+03:30", "day")).toBe("۸/۲۳");
    expect(usageTickLabel("2026-11-15T10:30:00Z", "hour")).toBe("۱۴:۰۰");
    expect(usageTickLabel("not a date", "day")).toBe("");
  });

  it("writes traffic in the server's units with Persian digits", () => {
    expect(bytesText(3 * GB / 2)).toBe("۱٫۵ گیگ");
    expect(bytesText(320 * 1024 ** 2)).toBe("۳۲۰ مگ");
    expect(bytesText(0)).toBe("۰");
    expect(bytesText(Number.NaN)).toBe("۰");
  });
});
