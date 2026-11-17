import { toast } from "@heroui/react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppToastProvider } from "@/components/feedback/AppToast";

const get = vi.fn();
const action = vi.fn();

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return { ...actual, panelGet: (path: string) => get(path), panelAction: (path: string, fields: unknown) => action(path, fields) };
});
vi.mock("../../core/session", () => ({
  usePanelSession: () => ({ session: { nav: [{ id: "shop", items: [{ id: "users" }] }] }, refresh: vi.fn() }),
}));
vi.mock("../../layout/PanelShell", () => ({ PanelShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { deadlineColor, ServiceCleanupPage } from "./ServiceCleanupPage";
import type { ServiceCleanupData } from "./types";

const ROW = { service_id: 11, user_id: 20, username: "svc11", customer: "Eve", kind: "انقضا", since: "2026-10-21", deadline: "2026-11-11", days_left: 1, retrying: false };

function data(patch: Partial<ServiceCleanupData> = {}): ServiceCleanupData {
  return {
    policy: { time_on: true, time_days: 7, warn_first: 3, warn_last: 1, volume_on: false, volume_days: 30 },
    min_days: 1,
    max_days: 365,
    preview: { cache_note: "بر اساس آخرین اطلاعات", expired_total: 4, volume_total: 2, time_due_now: 1, time_due_soon: 2, volume_due_now: 1, volume_due_soon: 0, rows: [ROW] },
    exempt: [{ service_id: 31, user_id: 21, username: "kept", customer: "Bob" }],
    ...patch,
  };
}

beforeEach(() => {
  get.mockReset();
  action.mockReset();
  action.mockResolvedValue({ ok: true, message: "" });
  get.mockResolvedValue(data());
});

afterEach(() => {
  cleanup();
  toast.clear();
  window.history.replaceState(null, "", "/");
});

function mount() {
  return render(
    <>
      <AppToastProvider />
      <ServiceCleanupPage />
    </>,
  );
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole("button", { name }));
}

describe("service cleanup page", () => {
  it("colours a deadline by how close it is", () => {
    expect([deadlineColor(0), deadlineColor(1), deadlineColor(3), deadlineColor(4)]).toEqual(["danger", "danger", "warning", "default"]);
  });

  it("shows the title, the counts and the queue of the page's own endpoint", async () => {
    mount();
    expect(await screen.findByRole("heading", { name: "پاکسازی سرویس‌ها" })).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/panel/service-cleanup");
    expect(screen.getByText("وضعیت فعلی")).toBeTruthy();
    expect(screen.getByText("بر اساس آخرین اطلاعات")).toBeTruthy();
    expect(screen.getByText(/۲ سرویس تا ۷ روز دیگر/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Eve" }).getAttribute("aria-haspopup")).toBe("dialog");
    expect(screen.getByText("kept")).toBeTruthy();
  });

  it("shows empty states and hides the exempt list when there is nothing", async () => {
    get.mockResolvedValue(data({ exempt: [], preview: { ...data().preview, rows: [] } }));
    mount();
    expect(await screen.findByText("سرویسی نزدیک به حذف نیست.")).toBeTruthy();
    expect(screen.queryByText("سرویس‌های معاف از پاکسازی")).toBeNull();
  });

  it("shows hostile customer and service names as text", async () => {
    get.mockResolvedValue(data({ preview: { ...data().preview, rows: [{ ...ROW, customer: "<img src=x onerror=alert(1)>", username: "<b>x</b>" }] } }));
    const { container } = mount();
    expect(await screen.findByText("<img src=x onerror=alert(1)>")).toBeTruthy();
    expect(screen.getByText("<b>x</b>")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  it("saves the rule with the switches as 1 or nothing and every number", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByRole("button", { name: "ذخیره تنظیمات" });
    await user.click(screen.getByRole("switch", { name: /^حذف سرویس بی‌حجم/ }));
    expect(((await screen.findByLabelText(/^مهلت بعد از اتمام حجم/)) as HTMLInputElement).value).toBe("30");
    await user.click(screen.getByRole("button", { name: "ذخیره تنظیمات" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action).toHaveBeenCalledWith("/service-cleanup", { time_on: true, time_days: "7", warn_first: "3", warn_last: "1", volume_on: true, volume_days: "30" });
  });

  it("sends a switched-off rule as absent so the handler reads it as off", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("switch", { name: /^حذف سرویس منقضی/ }));
    await user.click(screen.getByRole("button", { name: "ذخیره تنظیمات" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const [, fields] = action.mock.calls[0] as [string, Record<string, unknown>];
    expect(fields.time_on).toBe(false);
  });

  it("keeps the handler's refusal on screen and does not claim success", async () => {
    const user = userEvent.setup();
    action.mockResolvedValue({ ok: false, message: "مهلت سرویس منقضی باید بین ۱ و ۳۶۵ روز باشد" });
    mount();
    await user.click(await screen.findByRole("button", { name: "ذخیره تنظیمات" }));
    expect(await screen.findByText("مهلت سرویس منقضی باید بین ۱ و ۳۶۵ روز باشد")).toBeTruthy();
  });

  it("asks for a reason before extending the deadline and posts it with the days", async () => {
    const user = userEvent.setup();
    mount();
    await openMenu(user, "عملیات svc11");
    await user.click(await screen.findByRole("menuitem", { name: /۳۰ روز مهلت/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("۳۰ روز به مهلت حذف سرویس svc11 اضافه شود؟")).toBeTruthy();
    expect(action).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText("علت تمدید مهلت"), "درخواست مشتری");
    await user.click(within(dialog).getByRole("button", { name: "تمدید" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/service-cleanup/11/hold", { reason: "درخواست مشتری", days: 30 }));
  });

  it("asks for a reason before exempting a service and posts value 1", async () => {
    const user = userEvent.setup();
    mount();
    await openMenu(user, "عملیات svc11");
    await user.click(await screen.findByRole("menuitem", { name: /معاف از پاکسازی/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("سرویس svc11 برای همیشه از پاکسازی معاف شود؟")).toBeTruthy();
    await user.type(within(dialog).getByLabelText("علت معافیت"), "مشتری ویژه");
    await user.click(within(dialog).getByRole("button", { name: "معاف شود" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/service-cleanup/11/exempt", { reason: "مشتری ویژه", value: "1" }));
  });

  it("returns an exempt service to the cleanup with value 0 and a reason", async () => {
    const user = userEvent.setup();
    mount();
    await openMenu(user, "عملیات kept");
    await user.click(await screen.findByRole("menuitem", { name: /برگردان به پاکسازی/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("علت برگرداندن"), "اشتباه بود");
    await user.click(within(dialog).getByRole("button", { name: "برگردان" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/service-cleanup/31/exempt", { reason: "اشتباه بود", value: "0" }));
  });

  it("does not post when the reason is too short", async () => {
    const user = userEvent.setup();
    mount();
    await openMenu(user, "عملیات svc11");
    await user.click(await screen.findByRole("menuitem", { name: /۷ روز مهلت/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("علت تمدید مهلت"), "ab");
    const confirmButton = within(dialog).getByRole("button", { name: "تمدید" });
    expect(confirmButton.hasAttribute("disabled") || confirmButton.getAttribute("aria-disabled") === "true").toBe(true);
    expect(action).not.toHaveBeenCalled();
  });

  it("marks a service whose delete is being retried", async () => {
    get.mockResolvedValue(data({ preview: { ...data().preview, rows: [{ ...ROW, retrying: true }] } }));
    mount();
    expect(await screen.findByText("تلاش مجدد")).toBeTruthy();
  });
});
