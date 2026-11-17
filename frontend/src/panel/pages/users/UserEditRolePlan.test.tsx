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
import { roleFields, takesResellerPlan } from "./UserEditForms";
import { EditBody } from "./UserEditPage";

const PLANS = [
  { id: 3, label: "[ثابت] پایه" },
  { id: 4, label: "[PAYG] حجمی" },
];

function edit(patch: Partial<UserEdit> = {}, role = "user"): UserEdit {
  return {
    user: { id: 7, name: "مشتری", username: "", telegram_id: 7007, role, is_blocked: false, is_demo: false },
    tag: { key: "", label: "", color: "" } as unknown as UserEdit["tag"],
    color_tags: [],
    note: "",
    wallet: { balance: 0, nonce: "n", transactions: [] },
    services: [],
    plans: [],
    reseller_plans: PLANS,
    can: { manage: true, demo: false, private_marks: false, view_services: false, pg_create: false, pg_update: false, pg_delete: false, assign_existing_service: false, delete_user: false },
    shop_wallet: null,
    shop_block: null,
    points: { balance: 0 },
    shop_points: null,
    platform_points: null,
    ...patch,
  };
}

function mount(data: UserEdit) {
  render(
    <>
      <AppToastProvider />
      <EditBody edit={data} reload={vi.fn()} />
    </>,
  );
}

async function chooseRole(ui: ReturnType<typeof userEvent.setup>, label: string) {
  await ui.click(screen.getByRole("button", { name: /نقش جدید/ }));
  await ui.click(await screen.findByRole("option", { name: label }));
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

describe("the reseller package next to the role", () => {
  it("shows no package field until the role is changed to reseller", async () => {
    mount(edit());
    const ui = userEvent.setup();
    expect(screen.queryByText("پلن نمایندگی")).toBeNull();
    await chooseRole(ui, "مدیر");
    expect(screen.queryByText("پلن نمایندگی")).toBeNull();
    await chooseRole(ui, "نماینده");
    expect(await screen.findByText("پلن نمایندگی")).toBeTruthy();
  });

  it("posts the chosen package with the role", async () => {
    mount(edit());
    const ui = userEvent.setup();
    await chooseRole(ui, "نماینده");
    await ui.click(await screen.findByRole("button", { name: /پلن نمایندگی/ }));
    await ui.click(await screen.findByRole("option", { name: "[PAYG] حجمی" }));
    await ui.click(screen.getByRole("button", { name: "اعمال نقش" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/users/7/role", { role: "reseller", reseller_plan_id: "4" }));
  });

  it("posts only the role when no package is chosen", async () => {
    mount(edit());
    const ui = userEvent.setup();
    await chooseRole(ui, "نماینده");
    await ui.click(screen.getByRole("button", { name: "اعمال نقش" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/users/7/role", { role: "reseller" }));
  });

  it("never sends a package for another role, even after one was picked", async () => {
    mount(edit());
    const ui = userEvent.setup();
    await chooseRole(ui, "نماینده");
    await ui.click(await screen.findByRole("button", { name: /پلن نمایندگی/ }));
    await ui.click(await screen.findByRole("option", { name: "[ثابت] پایه" }));
    await chooseRole(ui, "مدیر");
    await ui.click(screen.getByRole("button", { name: "اعمال نقش" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/users/7/role", { role: "admin" }));
  });

  it("has no package field for someone who already is a reseller", () => {
    mount(edit({}, "reseller"));
    expect(screen.queryByText("پلن نمایندگی")).toBeNull();
    expect(takesResellerPlan(edit({}, "reseller"), "reseller")).toBe(false);
  });

  it("has no package field when the server offers no packages (not the Owner)", () => {
    const data = edit({ reseller_plans: [] });
    expect(takesResellerPlan(data, "reseller")).toBe(false);
    expect(roleFields(data, "reseller", "3")).toEqual({ role: "reseller" });
  });
});
