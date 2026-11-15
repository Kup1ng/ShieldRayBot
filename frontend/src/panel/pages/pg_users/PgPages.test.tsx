import { toast } from "@heroui/react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
vi.mock("../../core/session", () => ({
  usePanelSession: () => ({
    session: { nav: [{ id: "pg", label: "پاسارگارد", items: [{ id: "pg_users", href: "/pg/users", label: "کاربران" }, { id: "pg_hosts", href: "/pg/hosts", label: "هاست" }] }] },
    refresh: vi.fn(),
  }),
}));

import { PgGroupsContent } from "./PgGroupsPage";
import { PgHostsContent } from "./PgHostsPage";
import { PgTemplatesContent } from "./PgTemplatesPage";
import { PgUsersContent } from "./PgUsersPage";
import type { PgGroupsPayload, PgHostsPayload, PgTemplatesPayload, PgUserRow, PgUsersPayload } from "./types";

beforeEach(() => {
  get.mockReset();
  action.mockReset();
  ask.mockReset();
  ask.mockResolvedValue(true);
  action.mockResolvedValue({ ok: true, message: "انجام شد" });
  window.history.replaceState(null, "", "/pg/users");
});

afterEach(() => {
  cleanup();
  toast.clear();
});

function mount(node: React.ReactNode) {
  return render(
    <>
      <AppToastProvider />
      {node}
    </>,
  );
}

const PAGER = { page: 1, page_size: 50, total: 1, pages: 1, has_prev: false, has_next: false, prev_page: null, next_page: null };
const CAN = { create: true, custom_create: true, template_create: true, require_template: false, modify: true, delete: true, reset: true, revoke: true, disable: true, enable: true, bulk: true };

function userRow(id: number, patch: Partial<PgUserRow> = {}): PgUserRow {
  return {
    id, username: `user_${id}`, status: "active", status_label: "فعال", disabled: false, on_hold: false, used_traffic: 1, data_limit: 2, traffic_text: "۱ / ۲ گیگ", traffic_percent: 50,
    data_gb: 2, days_left: 10, expire_text: "2026/12/01 · 10 روز", owner: "", hwid_limit: 2, group_ids: [1], ops: ["disable", "reset", "revoke", "delete"], ...patch,
  };
}

function users(rows: PgUserRow[], patch: Partial<PgUsersPayload> = {}): PgUsersPayload {
  return { rows, q: "", pager: PAGER, show_owner: false, templates: [{ id: 7, name: "ماهانه" }], groups: [{ id: 1, name: "اصلی" }, { id: 2, name: "ویژه" }], can: CAN, error: null, ...patch };
}

describe("PasarGuard users", () => {
  it("lists users without any subscription link and asks the endpoint for the visible page only", async () => {
    window.history.replaceState(null, "", "/pg/users?q=ali&page=2");
    get.mockResolvedValue(users([userRow(5)], { q: "ali" }));
    mount(<PgUsersContent />);
    await screen.findByText("user_5");
    expect(get).toHaveBeenCalledWith("/api/panel/pg/users?q=ali&page=2");
    expect(screen.getByText("۱ / ۲ گیگ")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/https?:\/\//);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("hides the create button without the permission and shows the panel's notice", async () => {
    get.mockResolvedValue(users([], { can: { ...CAN, create: false }, error: "پاسخ پاسارگارد دیر رسید" }));
    mount(<PgUsersContent />);
    await screen.findByText("پاسخ پاسارگارد دیر رسید");
    expect(screen.queryByRole("button", { name: "ساخت کاربر" })).toBeNull();
    expect(screen.getByText("کاربری یافت نشد.")).toBeTruthy();
  });

  it("deletes through the row menu after the old question, then reloads", async () => {
    get.mockResolvedValue(users([userRow(5)]));
    const ui = userEvent.setup();
    mount(<PgUsersContent />);
    await screen.findByText("user_5");
    await ui.click(screen.getByRole("button", { name: "عملیات user_5" }));
    await ui.click(await screen.findByRole("menuitem", { name: "حذف" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/pg/users/5/delete", {}));
    expect(ask).toHaveBeenCalledWith("تأیید حذف", expect.objectContaining({ description: "کاربر پاسارگارد حذف شود؟" }));
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(1));
  });

  it("does not post when the question is answered no", async () => {
    ask.mockResolvedValue(false);
    get.mockResolvedValue(users([userRow(5)]));
    const ui = userEvent.setup();
    mount(<PgUsersContent />);
    await screen.findByText("user_5");
    await ui.click(screen.getByRole("button", { name: "عملیات user_5" }));
    await ui.click(await screen.findByRole("menuitem", { name: "ریست مصرف" }));
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(action).not.toHaveBeenCalled();
  });

  it("offers only the operations the server listed for the row", async () => {
    get.mockResolvedValue(users([userRow(5, { disabled: true, status: "disabled", ops: ["enable"] })], { can: { ...CAN, modify: false } }));
    const ui = userEvent.setup();
    mount(<PgUsersContent />);
    await screen.findByText("user_5");
    await ui.click(screen.getByRole("button", { name: "عملیات user_5" }));
    await screen.findByRole("menuitem", { name: "فعال" });
    expect(screen.queryByRole("menuitem", { name: "حذف" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "ویرایش" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "لینک اشتراک" })).toBeTruthy();
  });

  it("fetches a subscription link only when the link dialog is opened", async () => {
    get.mockImplementation((path: string) => (path.startsWith("/pg/users/5/link") ? Promise.resolve({ ok: true, url: "https://panel.example/sub/abc", username: "user_5" }) : Promise.resolve(users([userRow(5)]))));
    const ui = userEvent.setup();
    mount(<PgUsersContent />);
    await screen.findByText("user_5");
    expect(get).not.toHaveBeenCalledWith("/pg/users/5/link");
    await ui.click(screen.getByRole("button", { name: "عملیات user_5" }));
    await ui.click(await screen.findByRole("menuitem", { name: "لینک اشتراک" }));
    const field = await screen.findByDisplayValue("https://panel.example/sub/abc");
    expect(field.getAttribute("dir")).toBe("ltr");
    expect(get).toHaveBeenCalledWith("/pg/users/5/link");
  });

  it("refuses a bad username before posting and keeps the server's refusal inside the dialog", async () => {
    get.mockResolvedValue(users([userRow(5)]));
    action.mockResolvedValue({ ok: false, message: "این نام کاربری وجود دارد" });
    const ui = userEvent.setup();
    mount(<PgUsersContent />);
    await screen.findByText("user_5");
    await ui.click(screen.getByRole("button", { name: "ساخت کاربر" }));
    const name = await screen.findByRole("textbox", { name: /نام کاربری/ });
    await ui.type(name, "ab");
    await ui.click(screen.getByRole("button", { name: "ساخت" }));
    const dialog = await screen.findByRole("dialog");
    expect((await within(dialog).findByRole("alert")).textContent).toContain("۳ تا ۳۲");
    expect(action).not.toHaveBeenCalled();
    await ui.clear(name);
    await ui.type(name, "new_user");
    await ui.click(screen.getByRole("checkbox", { name: "اصلی" }));
    await ui.click(screen.getByRole("button", { name: "ساخت" }));
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith("/pg/users", { username: "new_user", mode: "custom", data_limit_gb: "", duration_days: "", hwid_limit: "", group_1: "1" }),
    );
    await waitFor(() => expect(within(dialog).getByRole("alert").textContent).toContain("این نام کاربری وجود دارد"));
  });

  it("edits with the user's current values and posts edit_group_<id>", async () => {
    get.mockResolvedValue(users([userRow(5, { data_gb: 50, days_left: 12, hwid_limit: 3, group_ids: [1] })]));
    const ui = userEvent.setup();
    mount(<PgUsersContent />);
    await screen.findByText("user_5");
    await ui.click(screen.getByRole("button", { name: "عملیات user_5" }));
    await ui.click(await screen.findByRole("menuitem", { name: "ویرایش" }));
    expect(((await screen.findByRole("spinbutton", { name: /حجم/ })) as HTMLInputElement).value).toBe("50");
    await ui.click(screen.getByRole("checkbox", { name: "ویژه" }));
    await ui.click(screen.getByRole("button", { name: "ذخیره" }));
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith("/pg/users/5/edit", { data_limit_gb: "50", duration_days: "12", hwid_limit: "3", edit_group_1: "1", edit_group_2: "2" }),
    );
  });

  it("runs a bulk operation for the eligible selected rows after asking", async () => {
    get.mockResolvedValue(users([userRow(5), userRow(6, { ops: [] })]));
    const ui = userEvent.setup();
    mount(<PgUsersContent />);
    await screen.findByText("user_5");
    await ui.click(screen.getByRole("checkbox", { name: /انتخاب user_5/ }));
    await ui.click(screen.getByRole("checkbox", { name: /انتخاب user_6/ }));
    await ui.click(await screen.findByRole("button", { name: /^حذف/ }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/pg/users/bulk-action", { action: "delete", ids: [5], return_to: "/pg/users" }));
    expect(ask).toHaveBeenCalledWith("حذف گروهی", expect.objectContaining({ description: expect.stringContaining("کاربر پاسارگارد حذف شوند") }));
  });

  it("puts the search text in the address and asks for page one of it", async () => {
    get.mockResolvedValue(users([userRow(5)]));
    const ui = userEvent.setup();
    mount(<PgUsersContent />);
    await screen.findByText("user_5");
    await ui.type(screen.getByRole("searchbox", { name: "جستجو" }), "ali{Enter}");
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/panel/pg/users?q=ali"));
    expect(window.location.search).toBe("?q=ali");
  });

  it("shows the retry of a failed load", async () => {
    get.mockRejectedValueOnce(new Error("اتصال برقرار نشد"));
    const ui = userEvent.setup();
    mount(<PgUsersContent />);
    await screen.findByText("اتصال برقرار نشد");
    get.mockResolvedValue(users([userRow(5)]));
    await ui.click(screen.getByRole("button", { name: "تلاش دوباره" }));
    await screen.findByText("user_5");
  });
});

const WRITE = { create: true, update: true, delete: true };

describe("PasarGuard templates", () => {
  const payload = (patch: Partial<PgTemplatesPayload> = {}): PgTemplatesPayload => ({
    rows: [{ id: 7, name: "ماهانه", data_limit: 1, limit_text: "۳۰ گیگ", data_gb: 30, expire_days: 30, group_ids: [1] }],
    groups: [{ id: 1, name: "اصلی" }, { id: 2, name: "ویژه" }],
    can: WRITE,
    error: null,
    ...patch,
  });

  it("edits a template and posts the group switches as g_<id>", async () => {
    get.mockResolvedValue(payload());
    const ui = userEvent.setup();
    mount(<PgTemplatesContent />);
    await screen.findByText("ماهانه");
    await ui.click(screen.getByRole("button", { name: "عملیات ماهانه" }));
    await ui.click(await screen.findByRole("menuitem", { name: "ویرایش" }));
    await ui.click(await screen.findByRole("checkbox", { name: "ویژه" }));
    await ui.click(screen.getByRole("button", { name: "ذخیره تغییرات" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/pg/templates/7/edit", { name: "ماهانه", data_limit_gb: "30", expire_days: "30", g_1: "1", g_2: "2" }));
  });

  it("deletes only after asking and hides write actions without the permission", async () => {
    get.mockResolvedValue(payload());
    const ui = userEvent.setup();
    mount(<PgTemplatesContent />);
    await screen.findByText("ماهانه");
    await ui.click(screen.getByRole("button", { name: "عملیات ماهانه" }));
    await ui.click(await screen.findByRole("menuitem", { name: "حذف" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/pg/templates/7/delete", {}));
    cleanup();
    get.mockResolvedValue(payload({ can: { create: false, update: false, delete: false } }));
    mount(<PgTemplatesContent />);
    await screen.findByText("ماهانه");
    expect(screen.queryByRole("button", { name: "ساخت تمپلیت" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "انتخاب ماهانه" })).toBeNull();
  });

  it("shows the empty state", async () => {
    get.mockResolvedValue(payload({ rows: [] }));
    mount(<PgTemplatesContent />);
    await screen.findByText("تمپلیتی نیست");
  });
});

describe("PasarGuard groups", () => {
  const payload = (patch: Partial<PgGroupsPayload> = {}): PgGroupsPayload => ({
    rows: [{ id: 1, name: "اصلی", inbound_tags: ["vless-ws", "trojan"], total_users: 4, is_disabled: false }],
    inbound_tags: ["vless-ws", "trojan", "vmess"],
    edit_group: null,
    can: WRITE,
    error: null,
    ...patch,
  });

  it("creates a group with the chosen inbounds as tag_<n>", async () => {
    window.history.replaceState(null, "", "/pg/groups");
    get.mockResolvedValue(payload());
    const ui = userEvent.setup();
    mount(<PgGroupsContent />);
    await screen.findAllByText("vless-ws · trojan", { exact: false });
    await ui.click(screen.getByRole("button", { name: "ساخت گروه" }));
    await ui.type(await screen.findByRole("textbox", { name: /نام گروه/ }), "جدید");
    await ui.click(screen.getByRole("checkbox", { name: "vmess" }));
    await ui.click(screen.getByRole("button", { name: "ساخت در پاسارگارد" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/pg/groups", { name: "جدید", tag_1: "vmess" }));
  });

  it("shows hostile group names and tags as plain text", async () => {
    window.history.replaceState(null, "", "/pg/groups");
    get.mockResolvedValue(payload({ rows: [{ id: 2, name: "<img src=x onerror=alert(1)>", inbound_tags: ["<b>tag</b>"], total_users: 0, is_disabled: false }] }));
    mount(<PgGroupsContent />);
    await screen.findByText("<img src=x onerror=alert(1)>");
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("b")).toBeNull();
  });

  it("opens the edit form named in the address and posts is_disabled when switched on", async () => {
    window.history.replaceState(null, "", "/pg/groups?edit=1");
    get.mockResolvedValue(payload());
    const ui = userEvent.setup();
    mount(<PgGroupsContent />);
    expect(get).toHaveBeenCalledWith("/api/panel/pg/groups?edit=1");
    const name = await screen.findByRole("textbox", { name: /نام گروه/ });
    expect((name as HTMLInputElement).value).toBe("اصلی");
    await ui.click(screen.getByRole("switch", { name: "غیرفعال" }));
    await ui.click(screen.getByRole("button", { name: "ذخیره تغییرات" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/pg/groups/1/edit", { name: "اصلی", tag_1: "vless-ws", tag_2: "trojan", is_disabled: "1" }));
  });
});

describe("PasarGuard hosts", () => {
  const payload = (patch: Partial<PgHostsPayload> = {}): PgHostsPayload => ({
    rows: [{ id: 3, remark: "IR-1", address: ["a.example", "b.example"], port: 443, inbound_tag: "vless-ws", priority: 1, is_disabled: false }],
    inbound_tags: ["vless-ws"],
    can: WRITE,
    error: null,
    ...patch,
  });

  it("toggles a host without asking, as the old page did", async () => {
    window.history.replaceState(null, "", "/pg/hosts");
    get.mockResolvedValue(payload());
    const ui = userEvent.setup();
    mount(<PgHostsContent />);
    await screen.findByText("IR-1");
    await ui.click(screen.getByRole("button", { name: "عملیات IR-1" }));
    await ui.click(await screen.findByRole("menuitem", { name: "خاموش" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/pg/hosts/3/toggle", {}));
    expect(ask).not.toHaveBeenCalled();
  });

  it("edits a host and posts its addresses as one comma-separated field", async () => {
    window.history.replaceState(null, "", "/pg/hosts");
    get.mockResolvedValue(payload());
    const ui = userEvent.setup();
    mount(<PgHostsContent />);
    await screen.findByText("IR-1");
    await ui.click(screen.getByRole("button", { name: "عملیات IR-1" }));
    await ui.click(await screen.findByRole("menuitem", { name: "ویرایش" }));
    await ui.click(await screen.findByRole("button", { name: "حذف b.example" }));
    await ui.click(screen.getByRole("button", { name: "ذخیره تغییرات" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/pg/hosts/3/edit", { remark: "IR-1", address: "a.example", port: "443", priority: "1", inbound_tag: "vless-ws" }));
  });

  it("runs the bulk toggle after the old question", async () => {
    window.history.replaceState(null, "", "/pg/hosts");
    get.mockResolvedValue(payload());
    const ui = userEvent.setup();
    mount(<PgHostsContent />);
    await screen.findByText("IR-1");
    await ui.click(screen.getByRole("checkbox", { name: /انتخاب IR-1/ }));
    await ui.click(await screen.findByRole("button", { name: /روشن\/خاموش/ }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/pg/hosts/bulk-action", { action: "toggle", ids: [3], return_to: "/pg/hosts" }));
    expect(ask).toHaveBeenCalledWith("تغییر وضعیت گروهی", expect.objectContaining({ confirmLabel: "اعمال" }));
  });
});
