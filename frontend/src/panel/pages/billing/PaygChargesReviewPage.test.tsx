import { toast } from "@heroui/react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppToastProvider } from "@/components/feedback/AppToast";

const get = vi.fn();
const action = vi.fn();
const ask = vi.fn();

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return { ...actual, panelGet: (path: string) => get(path), panelAction: (path: string, fields: unknown) => action(path, fields) };
});
vi.mock("../../core/confirm", () => ({ confirm: (message: string, options: unknown) => ask(message, options) }));
vi.mock("../../layout/PanelShell", () => ({ PanelShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { changeLabel, PaygChargesReviewPage } from "./PaygChargesReviewPage";
import type { ReviewCharge, ReviewData } from "./types";

const CHARGE: ReviewCharge = { id: 4, shop_id: 5, shop_name: "فروشگاه الف", event: "create", quantity: 3, pg_username: "user7", amount: 20000, created_at: "2026-11-08 12:30" };

function data(charges: ReviewCharge[] = [CHARGE]): ReviewData {
  return { charges };
}

beforeEach(() => {
  get.mockReset();
  action.mockReset();
  ask.mockReset();
  ask.mockResolvedValue(true);
  action.mockResolvedValue({ ok: true, message: "" });
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
      <PaygChargesReviewPage />
    </>,
  );
}

describe("PAYG charges review page", () => {
  it("labels the change with its count only when more than one user was touched", () => {
    expect(changeLabel({ event: "create", quantity: 1 })).toBe("ساخت");
    expect(changeLabel({ event: "reset", quantity: 3 })).toBe("ریست ترافیک × ۳");
    expect(changeLabel({ event: "unknown_event", quantity: 1 })).toBe("unknown_event");
  });

  it("reads the Owner's endpoint and lists the held charges", async () => {
    get.mockResolvedValue(data());
    mount();
    expect(await screen.findByText("فروشگاه الف")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/panel/payg/charges/review");
    expect(screen.getByText("ساخت × ۳")).toBeTruthy();
    expect(screen.getByText("user7")).toBeTruthy();
  });

  it("shows the empty state when nothing waits for review", async () => {
    get.mockResolvedValue(data([]));
    mount();
    expect(await screen.findByText("هزینه‌ای در انتظار بازبینی نیست")).toBeTruthy();
  });

  it("shows shop and panel names as text, never as markup", async () => {
    get.mockResolvedValue(data([{ ...CHARGE, shop_name: "<b>shop</b>", pg_username: "<script>x</script>" }]));
    const { container } = mount();
    expect(await screen.findByText("<b>shop</b>")).toBeTruthy();
    expect(screen.getByText("<script>x</script>")).toBeTruthy();
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });

  it("confirms with the amount before keeping a charge, then posts the settle handler", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(data());
    mount();
    await user.click(await screen.findByRole("button", { name: "بازبینی هزینهٔ فروشگاه الف" }));
    await user.click(await screen.findByRole("menuitem", { name: /اعمال شده/ }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/payg/charges/4/settle", {}));
    const [title, options] = ask.mock.calls[0] as [string, { description: string }];
    expect(title).toBe("تأیید هزینه");
    expect(options.description).toContain("۲۰٬۰۰۰ تومان");
    expect(options.description).toContain("قطعی می‌شود");
  });

  it("says the amount returns to the shop wallet before refunding, and posts nothing when declined", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(data());
    ask.mockResolvedValueOnce(false);
    mount();
    await user.click(await screen.findByRole("button", { name: "بازبینی هزینهٔ فروشگاه الف" }));
    await user.click(await screen.findByRole("menuitem", { name: /برگشت مبلغ/ }));
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
    const [, options] = ask.mock.calls[0] as [string, { description: string }];
    expect(options.description).toContain("۲۰٬۰۰۰ تومان");
    expect(options.description).toContain("به کیف پول نماینده برمی‌گردد");
    expect(action).not.toHaveBeenCalled();
  });

  it("reloads the list after a decision and shows the handler's message", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(data());
    action.mockResolvedValue({ ok: false, message: "این هزینه دیگر در انتظار بازبینی نیست" });
    mount();
    await user.click(await screen.findByRole("button", { name: "بازبینی هزینهٔ فروشگاه الف" }));
    await user.click(await screen.findByRole("menuitem", { name: /برگشت مبلغ/ }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("این هزینه دیگر در انتظار بازبینی نیست")).toBeTruthy();
  });
});
