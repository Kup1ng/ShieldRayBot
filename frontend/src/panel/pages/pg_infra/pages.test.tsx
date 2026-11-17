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
// The floating bar animates in with the Web Animations API, which happy-dom cancels noisily.
vi.mock("@heroui-pro/react", () => {
  const Part = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const ActionBar = ({ isOpen, children, ...rest }: { isOpen: boolean; children?: React.ReactNode; "aria-label"?: string }) =>
    isOpen ? (
      <div role="toolbar" aria-label={rest["aria-label"]}>
        {children}
      </div>
    ) : null;
  const EmptyState = Object.assign(Part, { Header: Part, Media: Part, Title: Part, Description: Part, Content: Part });
  return { ActionBar: Object.assign(ActionBar, { Prefix: Part, Content: Part, Suffix: Part }), EmptyState };
});
vi.mock("../../core/confirm", () => ({ confirm: (message: string, options: unknown) => ask(message, options) }));

import { AdminsContent } from "./AdminsPage";
import { InboundsContent } from "./InboundsPage";
import { NodesContent } from "./NodesPage";
import { OverviewContent } from "./PgOverviewPage";
import type { AdminRow, AdminsData, InboundsData, NodeRow, NodesData, OverviewShell, OwnerWidgets, ShopWidgets, WebAccess } from "./types";

beforeEach(() => {
  get.mockReset();
  action.mockReset();
  ask.mockReset();
  ask.mockResolvedValue(true);
  action.mockResolvedValue({ ok: true, message: "انجام شد" });
  window.history.replaceState(null, "", "/pg");
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

function answer(map: Record<string, unknown>) {
  get.mockImplementation((path: string) => (path in map ? Promise.resolve(map[path]) : Promise.reject(new Error("بدون پاسخ"))));
}

/* ---------- nodes ---------- */

function nodeRow(patch: Partial<NodeRow>): NodeRow {
  return {
    id: 5,
    name: "نود آلمان",
    address: "10.0.0.5",
    port: 62050,
    status: "connected",
    status_label: "متصل",
    status_kind: "ok",
    traffic_up: 1,
    traffic_down: 2,
    traffic_total: 3,
    traffic_up_text: "1 مگ",
    traffic_down_text: "2 مگ",
    traffic_total_text: "3 مگ",
    ...patch,
  };
}

const ALL_CAN = { reconnect: true, create: true, update: true, delete: true };

function nodes(patch: Partial<NodesData> = {}): NodesData {
  return { nodes: [nodeRow({}), nodeRow({ id: 6, name: "نود فرانسه", address: "10.0.0.6", status: "disabled", status_label: "غیرفعال", status_kind: "err" })], can: ALL_CAN, error: null, notice: null, ...patch };
}

describe("nodes page", () => {
  it("lists the nodes and posts a single operation to its handler, then reloads", async () => {
    answer({ "/api/panel/pg/nodes": nodes() });
    const ui = userEvent.setup();
    mount(<NodesContent />);
    await screen.findByText("نود آلمان");
    await ui.click(screen.getByRole("button", { name: "عملیات نود آلمان" }));
    await ui.click(await screen.findByRole("menuitem", { name: "همگام‌سازی" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/pg/nodes/5/sync", {}));
    expect(ask).not.toHaveBeenCalled();
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(1));
  });

  it("shows each node's status in Persian, never the panel's raw English word", async () => {
    answer({ "/api/panel/pg/nodes": nodes() });
    mount(<NodesContent />);
    await screen.findByText("نود آلمان");
    expect(screen.getByText("متصل")).toBeTruthy();
    expect(screen.getByText("غیرفعال")).toBeTruthy();
    expect(screen.queryByText("connected")).toBeNull();
    expect(screen.queryByText("disabled")).toBeNull();
  });

  it("asks before resetting or deleting and posts nothing when declined", async () => {
    answer({ "/api/panel/pg/nodes": nodes() });
    ask.mockResolvedValue(false);
    const ui = userEvent.setup();
    mount(<NodesContent />);
    await screen.findByText("نود آلمان");
    await ui.click(screen.getByRole("button", { name: "عملیات نود آلمان" }));
    await ui.click(await screen.findByRole("menuitem", { name: "حذف" }));
    await waitFor(() => expect(ask).toHaveBeenCalledWith("حذف نود", expect.objectContaining({ description: "این نود حذف شود؟", tone: "danger" })));
    expect(action).not.toHaveBeenCalled();
  });

  it("posts a bulk operation with the selected ids after the old confirmation", async () => {
    answer({ "/api/panel/pg/nodes": nodes() });
    const ui = userEvent.setup();
    mount(<NodesContent />);
    await screen.findByText("نود آلمان");
    await ui.click(screen.getByRole("checkbox", { name: /انتخاب نود آلمان/ }));
    await ui.click(screen.getByRole("checkbox", { name: /انتخاب نود فرانسه/ }));
    const bar = await screen.findByRole("toolbar", { name: "عملیات گروهی نودها" });
    await ui.click(within(bar).getByRole("button", { name: /^ریست مصرف/ }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/pg/nodes/bulk-action", { action: "reset", ids: [5, 6], return_to: "/pg/nodes" }));
    expect(ask).toHaveBeenCalledWith("ریست گروهی", expect.objectContaining({ description: "مصرف ۲ نود ریست شود؟" }));
  });

  it("offers neither selection nor buttons without any node grant", async () => {
    answer({ "/api/panel/pg/nodes": nodes({ can: { reconnect: false, create: false, update: false, delete: false } }) });
    mount(<NodesContent />);
    await screen.findByText("نود آلمان");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "ساخت نود" })).toBeNull();
    expect(screen.queryByRole("button", { name: /اتصال مجدد همه/ })).toBeNull();
  });

  it("creates a node with the fields the old form posted, and never shows a saved key back", async () => {
    answer({ "/api/panel/pg/nodes": nodes({ nodes: [] }) });
    const ui = userEvent.setup();
    mount(<NodesContent />);
    await ui.click((await screen.findAllByRole("button", { name: "ساخت نود" }))[0]);
    const dialog = await screen.findByRole("dialog");
    await ui.type(within(dialog).getByRole("textbox", { name: /^نام/ }), "DE node");
    await ui.type(within(dialog).getByRole("textbox", { name: /^آدرس/ }), "1.2.3.4");
    await ui.type(within(dialog).getByRole("textbox", { name: /^پورت/ }), "62050");
    await ui.click(within(dialog).getByRole("button", { name: "ساخت نود" }));
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith("/pg/nodes", { name: "DE node", address: "1.2.3.4", port: "62050", connection_type: "grpc", core_config_id: "", api_key: "", server_ca: "" }),
    );
  });

  it("reconnects every node from the header", async () => {
    answer({ "/api/panel/pg/nodes": nodes() });
    const ui = userEvent.setup();
    mount(<NodesContent />);
    await ui.click(await screen.findByRole("button", { name: /اتصال مجدد همه/ }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/pg/nodes/reconnect-all", {}));
  });

  it("shows the read error and the stale notice without blanking the page", async () => {
    answer({ "/api/panel/pg/nodes": nodes({ nodes: [], error: "خواندن امن داده‌های پاسارگارد ممکن نیست", notice: { kind: "stale", minutes: 5 } }) });
    mount(<NodesContent />);
    expect(await screen.findByText("خواندن امن داده‌های پاسارگارد ممکن نیست")).toBeTruthy();
    expect(screen.getByText("آخرین اطلاعات دریافت‌شده نمایش داده می‌شود")).toBeTruthy();
    expect(screen.getByText("نودی یافت نشد.")).toBeTruthy();
  });
});

/* ---------- inbounds ---------- */

describe("inbounds page", () => {
  it("shows the tags and the details as rows", async () => {
    const data: InboundsData = { tags: ["VLESS TCP", "Trojan"], details: { rows: [{ key: "VLESS TCP", value: '{"port":443}' }], text: null }, error: null, notice: null };
    answer({ "/api/panel/pg/inbounds": data });
    mount(<InboundsContent />);
    expect(await screen.findByText("Trojan")).toBeTruthy();
    expect(screen.getByText('{"port":443}')).toBeTruthy();
    expect(screen.getByText("برای ساخت گروه و هاست از همین تگ‌ها استفاده کنید.")).toBeTruthy();
  });
});

/* ---------- admins ---------- */

function web(patch: Partial<WebAccess>): WebAccess {
  return {
    source: "none",
    web_username: null,
    is_active: null,
    setup_complete: null,
    reseller_user_id: null,
    staff_id: null,
    note: null,
    detail: null,
    credentials_ready: null,
    password_ready: null,
    api_key_ready: null,
    username_aligned: null,
    ...patch,
  };
}

function admin(patch: Partial<AdminRow>): AdminRow {
  return { id: 1, username: "eve", role_name: "فروش", is_sudo: false, status: "active", note: "", users_text: "۳/۱۰", traffic_text: "۱ / ۱۰ گیگ", lifetime_text: null, web: web({}), ...patch };
}

const CAPACITY: AdminsData["plans"]["grant"][number] = { id: 9, name: "ظرفیت فعلی", plan_kind: "current_capacity", billing_mode: "fixed", price_per_gb: 0, duration_days: 0 };
const MONTHLY: AdminsData["plans"]["grant"][number] = { id: 4, name: "ماهانه", plan_kind: "subscription", billing_mode: "fixed", price_per_gb: 0, duration_days: 30 };

function admins(rows: AdminRow[], patch: Partial<AdminsData> = {}): AdminsData {
  return {
    admins: rows,
    roles: [{ id: 2, name: "فروشنده" }],
    plans: { create: [MONTHLY], staff: [MONTHLY], grant: [MONTHLY, CAPACITY], grant_default_id: 9 },
    feature_perms: [
      { key: "dashboard", label: "خانه / داشبورد" },
      { key: "plans", label: "پلن‌های فروش" },
    ],
    can_toggle_oversell: true,
    error: null,
    notice: null,
    ...patch,
  };
}

describe("admins page", () => {
  it("gives the owner row no actions and the others the actions of how they reach the web panel", async () => {
    answer({
      "/api/panel/pg/admins": admins([
        admin({ id: 1, username: "root", web: web({ source: "owner", detail: "ادمین اصلی وب‌پنل" }) }),
        admin({ id: 2, username: "eve" }),
        admin({ id: 3, username: "sam", web: web({ source: "pg_staff", is_active: true, web_username: "sam", credentials_ready: true, api_key_ready: true, username_aligned: true }) }),
        admin({ id: 4, username: "rex", web: web({ source: "reseller", reseller_user_id: 40, web_username: "rex", is_active: true, staff_id: 7 }) }),
      ]),
    });
    const ui = userEvent.setup();
    mount(<AdminsContent />);
    await screen.findByText("eve");
    expect(screen.queryByRole("button", { name: "عملیات root" })).toBeNull();
    await ui.click(screen.getByRole("button", { name: "عملیات eve" }));
    expect(await screen.findByRole("menuitem", { name: "اعطای ادمین فرعی" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "اعطای نماینده" })).toBeTruthy();
    await ui.keyboard("{Escape}");
    await ui.click(screen.getByRole("button", { name: "عملیات sam" }));
    for (const name of ["ویرایش دسترسی ادمین فرعی", "تبدیل به نماینده", "غیرفعال کردن", "حذف دسترسی", "حذف ادمین"]) expect(await screen.findByRole("menuitem", { name })).toBeTruthy();
    await ui.keyboard("{Escape}");
    await ui.click(screen.getByRole("button", { name: "عملیات rex" }));
    for (const name of ["مدیریت نماینده", "حذف ردیف ادمین فرعی", "حذف ادمین"]) expect(await screen.findByRole("menuitem", { name })).toBeTruthy();
  });

  it("toggles a secondary admin's web access without asking and revokes it only after asking", async () => {
    answer({ "/api/panel/pg/admins": admins([admin({ username: "sam", web: web({ source: "pg_staff", is_active: true, web_username: "sam", credentials_ready: true }) })]) });
    const ui = userEvent.setup();
    mount(<AdminsContent />);
    await screen.findByRole("button", { name: "عملیات sam" });
    await ui.click(screen.getByRole("button", { name: "عملیات sam" }));
    await ui.click(await screen.findByRole("menuitem", { name: "غیرفعال کردن" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/pg/admins/sam/web-access/toggle", {}));
    expect(ask).not.toHaveBeenCalled();
    await ui.click(screen.getByRole("button", { name: "عملیات sam" }));
    await ui.click(await screen.findByRole("menuitem", { name: "حذف دسترسی" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/pg/admins/sam/web-access/revoke", {}));
    expect(ask).toHaveBeenCalledWith("حذف دسترسی وب", expect.objectContaining({ tone: "danger" }));
  });

  it("deletes an admin only with a reason of at least three characters", async () => {
    answer({ "/api/panel/pg/admins": admins([admin({ username: "eve" })]) });
    const ui = userEvent.setup();
    mount(<AdminsContent />);
    await screen.findByText("eve", { selector: "bdi" });
    await ui.click(screen.getByRole("button", { name: "عملیات eve" }));
    await ui.click(await screen.findByRole("menuitem", { name: "حذف ادمین" }));
    const dialog = await screen.findByRole("dialog");
    const submit = within(dialog).getByRole("button", { name: "حذف" });
    expect(submit.hasAttribute("disabled") || submit.getAttribute("aria-disabled") === "true").toBe(true);
    await ui.type(within(dialog).getByRole("textbox", { name: /علت حذف/ }), "ab");
    expect(submit.hasAttribute("disabled") || submit.getAttribute("aria-disabled") === "true").toBe(true);
    await ui.type(within(dialog).getByRole("textbox", { name: /علت حذف/ }), "c");
    await ui.click(submit);
    await waitFor(() => expect(action).toHaveBeenCalledWith("/pg/admins/eve/delete", { reason: "abc" }));
  });

  it("grants a secondary admin with the web username locked to the PasarGuard one", async () => {
    answer({ "/api/panel/pg/admins": admins([admin({ username: "Eve" })]) });
    const ui = userEvent.setup();
    mount(<AdminsContent />);
    await screen.findByText("Eve", { selector: "bdi" });
    await ui.click(screen.getByRole("button", { name: "عملیات Eve" }));
    await ui.click(await screen.findByRole("menuitem", { name: "اعطای ادمین فرعی" }));
    const dialog = await screen.findByRole("dialog");
    await ui.type(within(dialog).getByLabelText(/رمز عبور وب‌پنل/), "Str0ng!Pass");
    await ui.click(within(dialog).getByRole("button", { name: "اعطای دسترسی ادمین فرعی" }));
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith("/pg/admins/Eve/web-access/staff", {
        web_username: "eve",
        web_password: "Str0ng!Pass",
        pg_api_key: "",
        note: "",
        plan_id: "",
      }),
    );
  });

  it("converts a secondary admin to a reseller on the default current-capacity plan", async () => {
    answer({ "/api/panel/pg/admins": admins([admin({ username: "sam", web: web({ source: "pg_staff", is_active: true, web_username: "sam", credentials_ready: true, password_ready: true }) })]) });
    const ui = userEvent.setup();
    mount(<AdminsContent />);
    await screen.findByRole("button", { name: "عملیات sam" });
    await ui.click(screen.getByRole("button", { name: "عملیات sam" }));
    await ui.click(await screen.findByRole("menuitem", { name: "تبدیل به نماینده" }));
    const dialog = await screen.findByRole("dialog");
    await ui.click(within(dialog).getByRole("button", { name: "تبدیل به نماینده" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/pg/admins/sam/convert-to-reseller", { plan_id: "9", web_password: "", note: "" }));
  });

  it("creates an admin as a reseller with the chosen plan and permission switches", async () => {
    answer({ "/api/panel/pg/admins": admins([]) });
    const ui = userEvent.setup();
    mount(<AdminsContent />);
    await ui.click(await screen.findByRole("button", { name: "ساخت ادمین" }));
    const dialog = await screen.findByRole("dialog");
    await ui.type(within(dialog).getByRole("textbox", { name: /نام کاربری/ }), "new_admin");
    await ui.type(within(dialog).getByLabelText(/^رمز عبور/), "Str0ng!Passw0rd");
    await ui.click(within(dialog).getByRole("switch", { name: /این ادمین نماینده شود/ }));
    await ui.click(within(dialog).getByRole("button", { name: /انتخاب کنید|انتخاب پلن/ }));
    await ui.click(await screen.findByRole("option", { name: /ماهانه/ }));
    await ui.click(within(dialog).getByRole("switch", { name: "پلن‌های فروش" }));
    await ui.click(within(dialog).getByRole("button", { name: "ساخت ادمین" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const [path, fields] = action.mock.calls[0];
    expect(path).toBe("/pg/admins");
    expect(fields).toMatchObject({ username: "new_admin", as_reseller: true, plan_id: "4", perm_dashboard: true });
    expect(fields).not.toHaveProperty("perm_plans");
    expect(fields).not.toHaveProperty("grant_web");
  });

  it("refuses a short password without posting", async () => {
    answer({ "/api/panel/pg/admins": admins([]) });
    const ui = userEvent.setup();
    mount(<AdminsContent />);
    await ui.click(await screen.findByRole("button", { name: "ساخت ادمین" }));
    const dialog = await screen.findByRole("dialog");
    await ui.type(within(dialog).getByRole("textbox", { name: /نام کاربری/ }), "new_admin");
    await ui.type(within(dialog).getByLabelText(/^رمز عبور/), "short");
    await ui.click(within(dialog).getByRole("button", { name: "ساخت ادمین" }));
    expect(await screen.findByText("رمز عبور حداقل ۱۲ کاراکتر باشد.")).toBeTruthy();
    expect(action).not.toHaveBeenCalled();
  });
});

/* ---------- overview ---------- */

const SHELL: OverviewShell = { owner: true, external_url: "https://pg.example.test", ticket_alert: null, remediation: null };

const OWNER: OwnerWidgets = {
  owner: true,
  error: null,
  notice: null,
  links: { users: true, nodes: true },
  counts: { total: 120, online: 7, active: 100, expired: 5, limited: 3, disabled: 10, on_hold: 2 },
  segments: [
    { key: "active", label: "فعال", count: 100, pct: 83.3 },
    { key: "expired", label: "منقضی", count: 5, pct: 4.2 },
  ],
  version: "1.4.0",
  nodes_connected: 1,
  nodes_total: 2,
  nodes_state: "warn",
  facts: { admins: 3, groups: 4, hosts: 5, nodes: 2 },
  host: { cpu_percent: 40, memory_percent: 60, memory_ratio_text: "6 / 10 گیگ", cpu_cores: 4, cpu_tone: "ok", mem_tone: "warn" },
  live: { rate_up: 1024, rate_down: 2048, rate_up_num: "1", rate_up_unit: "کیلوبایت/ثانیه", rate_down_num: "2", rate_down_unit: "کیلوبایت/ثانیه" },
  nodes: [
    {
      id: 1,
      name: "نود آلمان",
      status: "connected",
      status_label: "متصل",
      status_kind: "ok",
      cpu_percent: 10,
      cpu_text: "10٪",
      cpu_tone: "ok",
      mem_percent: 20,
      mem_text: "20٪",
      mem_tone: "ok",
      traffic_up: { num: "1", unit: "گیگ" },
      traffic_down: { num: "2", unit: "گیگ" },
      rate_up_parts: { num: "3", unit: "مگ/ثانیه" },
      rate_down_parts: { num: "—", unit: "" },
    },
  ],
};

const SHOP: ShopWidgets = {
  owner: false,
  error: null,
  notice: null,
  links: { users: true, nodes: false },
  counts: { total: 12, online: 1, active: 10, expired: 1, limited: 0, disabled: 1, on_hold: 0 },
  segments: [{ key: "active", label: "فعال", count: 10, pct: 100 }],
  ready: true,
  account_error: null,
  limits: {
    username: "shop_admin",
    status_label: "فعال",
    status_badge: "active",
    users: { label: "کاربران", has_limit: true, pct: 12, remain_pct: 88, tone: "ok", exhausted: false, used_text: "12", limit_text: "100", remain_text: "88", ratio_text: "12/100" },
    traffic: null,
    constraints: [],
    lifetime_text: null,
  },
};

describe("overview page", () => {
  it("shows the owner's server, traffic, tiles, users and nodes, with the link to PasarGuard", async () => {
    answer({ "/api/panel/pg": SHELL, "/api/panel/pg/widgets": OWNER });
    mount(<OverviewContent />);
    expect(await screen.findByText("سرور پاسارگارد")).toBeTruthy();
    expect(screen.getByText("ترافیک زنده")).toBeTruthy();
    expect(screen.getByText("نود آلمان")).toBeTruthy();
    expect(screen.getByText("متصل")).toBeTruthy();
    expect(screen.queryByText("connected")).toBeNull();
    expect(screen.getByText("کل کاربران")).toBeTruthy();
    expect(screen.getByRole("button", { name: /ورود به پاسارگارد/ })).toBeTruthy();
  });

  it("shows a shop admin only their own quota and users", async () => {
    answer({ "/api/panel/pg": { ...SHELL, owner: false, external_url: null }, "/api/panel/pg/widgets": SHOP });
    mount(<OverviewContent />);
    expect(await screen.findByText("سقف حساب پاسارگارد")).toBeTruthy();
    expect(screen.getByText("کاربران من")).toBeTruthy();
    expect(screen.queryByText("سرور پاسارگارد")).toBeNull();
    expect(screen.queryByText("ترافیک زنده")).toBeNull();
    expect(screen.queryByRole("button", { name: /ورود به پاسارگارد/ })).toBeNull();
  });

  it("explains an unreadable account and keeps the page when PasarGuard is down", async () => {
    answer({
      "/api/panel/pg": { ...SHELL, owner: false, external_url: null },
      "/api/panel/pg/widgets": { ...SHOP, ready: false, limits: null, account_error: "ادمین پاسارگارد برای این حساب تنظیم نشده است", notice: { kind: "unavailable", minutes: 0 } },
    });
    mount(<OverviewContent />);
    expect(await screen.findByText("ادمین پاسارگارد برای این حساب تنظیم نشده است")).toBeTruthy();
    expect(screen.getByText("اطلاعات پاسارگارد در دسترس نیست")).toBeTruthy();
  });

  it("shows the ticket alert and the credential reminder of a secondary admin", async () => {
    answer({
      "/api/panel/pg": { owner: false, external_url: null, ticket_alert: { title: "یک تیکت خوانده‌نشده", detail: "پاسخ جدید", href: "/tickets" }, remediation: { username_aligned: true, credentials_ready: false, can_self_serve: true } },
      "/api/panel/pg/widgets": SHOP,
    });
    mount(<OverviewContent />);
    expect(await screen.findByText("یک تیکت خوانده‌نشده")).toBeTruthy();
    expect(screen.getByText("اعتبارنامه پاسارگارد ذخیره نشده")).toBeTruthy();
    expect(screen.getByRole("button", { name: "تغییر رمز" })).toBeTruthy();
  });
});
