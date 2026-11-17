import { toast } from "@heroui/react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppToastProvider } from "@/components/feedback/AppToast";

const action = vi.fn();
const ask = vi.fn();

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return { ...actual, panelAction: (path: string, fields: unknown) => action(path, fields) };
});
vi.mock("../../core/confirm", () => ({ confirm: (message: string, options: unknown) => ask(message, options) }));

import type { UserEdit } from "./types";
import { EditBody } from "./UserEditPage";

function edit(patch: Partial<UserEdit> = {}): UserEdit {
  return {
    user: { id: 7, name: "مشتری", username: "", telegram_id: 7007, role: "user", is_blocked: false, is_demo: false },
    tag: { key: "", label: "", color: "" } as unknown as UserEdit["tag"],
    color_tags: [],
    note: "",
    wallet: { balance: 0, nonce: "n", transactions: [] },
    services: [],
    plans: [],
    can: { manage: false, demo: false, private_marks: false, view_services: false, pg_create: false, pg_update: false, pg_delete: false, delete_user: false },
    shop_wallet: null,
    shop_block: null,
    points: { balance: 340 },
    shop_points: null,
    platform_points: null,
    ...patch,
  };
}

function mount(data: UserEdit, reload = vi.fn()) {
  render(
    <>
      <AppToastProvider />
      <EditBody edit={data} reload={reload} />
    </>,
  );
  return reload;
}

beforeEach(() => {
  action.mockReset();
  ask.mockReset();
  ask.mockResolvedValue(true);
  action.mockResolvedValue({ ok: true, message: "انجام شد" });
});

afterEach(() => {
  cleanup();
  toast.clear();
});

describe("customer points on the edit screen", () => {
  it("shows the points balance as text next to the wallet", () => {
    mount(edit());
    expect(screen.getByText("امتیاز")).toBeTruthy();
    expect(screen.getByText("۳۴۰")).toBeTruthy();
  });

  it("offers no points form when the server does not allow one", () => {
    mount(edit());
    expect(screen.queryByText("تغییر امتیاز در این فروشگاه")).toBeNull();
    expect(screen.queryByText("تنظیم امتیاز")).toBeNull();
    expect(screen.queryByRole("group", { name: "نوع تنظیم امتیاز" })).toBeNull();
  });

  it("posts the shop points fields with the reason and the screen's request key", async () => {
    const reload = mount(edit({ shop_points: { nonce: "abcdef0123456789", max: 10000, daily: 100000 } }));
    const ui = userEvent.setup();
    expect(screen.getByText(/حداکثر ۱۰٬۰۰۰ امتیاز/)).toBeTruthy();
    await ui.type(screen.getByRole("textbox", { name: /امتیاز/ }), "۲۵۰");
    await ui.type(screen.getByRole("textbox", { name: /علت/ }), "جبران اشتباه");
    await ui.click(screen.getByRole("button", { name: "افزایش" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/users/7/shop-points", { points: "250", mode: "credit", reason: "جبران اشتباه", nonce: "abcdef0123456789" }));
    expect(ask).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it("does not post a points change without a reason", async () => {
    mount(edit({ shop_points: { nonce: "abcdef0123456789", max: 10000, daily: 100000 } }));
    const ui = userEvent.setup();
    await ui.type(screen.getByRole("textbox", { name: /امتیاز/ }), "20");
    await ui.click(screen.getByRole("button", { name: "کاهش" }));
    expect((await screen.findByRole("alert")).textContent).toContain("علت");
    expect(action).not.toHaveBeenCalled();
  });

  it("posts the platform points form of the Owner to its own handler", async () => {
    mount(edit({ platform_points: { nonce: "0123456789abcdef" } }));
    const ui = userEvent.setup();
    await ui.type(screen.getByRole("textbox", { name: /امتیاز/ }), "5");
    await ui.type(screen.getByRole("textbox", { name: /علت/ }), "هدیه");
    await ui.click(screen.getByRole("button", { name: "کاهش" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/users/7/points-adjust", { points: "5", mode: "debit", reason: "هدیه", nonce: "0123456789abcdef" }));
  });
});
