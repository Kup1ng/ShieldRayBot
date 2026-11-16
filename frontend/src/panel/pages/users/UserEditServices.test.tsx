import { toast } from "@heroui/react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppToastProvider } from "@/components/feedback/AppToast";

const action = vi.fn();

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return { ...actual, panelAction: (path: string, fields: unknown) => action(path, fields) };
});

import type { EditService, UserEdit } from "./types";
import { ServicesSection } from "./UserEditServices";

const SERVICE: EditService = {
  id: 31,
  title: "سرویس یک‌ماهه",
  pg_username: "u31",
  plan_id: 4,
  status_text: "فعال",
  is_active: true,
  error: "",
  volume_text: "۲۰ گیگ",
  remain_text: "۵ گیگ",
  time_label: "۱۰ روز",
  has_link: false,
  is_external: false,
};

function edit(can: Partial<UserEdit["can"]> = {}, services: EditService[] = [SERVICE]): UserEdit {
  return {
    user: { id: 7, name: "مشتری", username: "", telegram_id: 7007, role: "user", is_blocked: false, is_demo: false },
    tag: { key: "", label: "", color: "" } as unknown as UserEdit["tag"],
    color_tags: [],
    note: "",
    wallet: { balance: 0, nonce: "n", transactions: [] },
    services,
    plans: [{ id: 4, label: "یک‌ماهه" }],
    can: { manage: false, demo: false, private_marks: false, view_services: true, pg_create: true, pg_update: true, pg_delete: true, delete_user: false, ...can },
    shop_wallet: null,
    shop_block: null,
  };
}

function mount(data: UserEdit, reload = vi.fn()) {
  render(
    <>
      <AppToastProvider />
      <ServicesSection edit={data} reload={reload} />
    </>,
  );
  return reload;
}

beforeEach(() => {
  action.mockReset();
  action.mockResolvedValue({ ok: true, message: "انجام شد" });
});

afterEach(() => {
  cleanup();
  toast.clear();
});

describe("customer services on the edit screen", () => {
  it("says the services are hidden without the customer-services permission, instead of «no services»", () => {
    mount(edit({ view_services: false }, []));
    expect(screen.getByText("دسترسی به سرویس‌های مشتری ندارید.")).toBeTruthy();
    expect(screen.queryByText("سرویسی برای این کاربر ثبت نشده است.")).toBeNull();
  });

  it("renews a service only with a typed reason and sends it with the plan", async () => {
    const reload = mount(edit());
    const ui = userEvent.setup();
    await ui.click(screen.getByRole("button", { name: "تمدید" }));
    const box = await screen.findByRole("textbox", { name: /علت تمدید/ });
    expect(action).not.toHaveBeenCalled();
    await ui.type(box, "درخواست مشتری");
    await ui.click(screen.getAllByRole("button", { name: "تمدید" }).at(-1) as HTMLElement);
    await waitFor(() => expect(action).toHaveBeenCalledWith("/users/7/services/31/renew", { plan_id: "4", reason: "درخواست مشتری" }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it("deletes a service with its reason, and sends nothing when the dialog is cancelled", async () => {
    mount(edit());
    const ui = userEvent.setup();
    await ui.click(screen.getByRole("button", { name: "حذف سرویس" }));
    await screen.findByRole("textbox", { name: /علت حذف/ });
    await ui.click(screen.getByRole("button", { name: "انصراف" }));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: /علت حذف/ })).toBeNull());
    expect(action).not.toHaveBeenCalled();

    await ui.click(screen.getByRole("button", { name: "حذف سرویس" }));
    await ui.type(await screen.findByRole("textbox", { name: /علت حذف/ }), "پایان همکاری");
    await ui.click(screen.getAllByRole("button", { name: "حذف سرویس" }).at(-1) as HTMLElement);
    await waitFor(() => expect(action).toHaveBeenCalledWith("/users/7/services/31/delete", { reason: "پایان همکاری" }));
  });
});
