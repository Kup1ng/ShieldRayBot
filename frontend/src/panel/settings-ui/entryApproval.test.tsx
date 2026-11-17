import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const action = vi.fn();
const ask = vi.fn();

vi.mock("../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../core/api")>();
  return { ...actual, panelGet: (path: string) => get(path), panelAction: (path: string, fields: unknown) => action(path, fields) };
});
vi.mock("../core/confirm", () => ({ confirm: (message: string, options: unknown) => ask(message, options) }));
vi.mock("../core/session", () => ({ usePanelSession: () => ({ session: { csrf_token: "token" }, refresh: vi.fn() }) }));
vi.mock("../layout/PanelShell", () => ({ PanelShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { PanelError } from "../core/api";
import { ShopSettingsPage } from "../pages/ops/ShopSettingsPage";
import type { SettingSection, ShopSettings } from "../pages/ops/types";
import { GenericTab } from "../pages/settings/GenericTab";
import type { SettingField, TabData } from "../pages/settings/types";
import { EntryApprovalRequests } from "./EntryApprovalRequests";
import type { EntryApprovalRow } from "./types";

const row = (patch: Partial<EntryApprovalRow>): EntryApprovalRow => ({ id: 1, customer: 777, customer_name: "علی", username: "ali", status: "pending", requested_at: "2026-01-01T10:00:00+00:00", decided_at: "", expired: false, ...patch });
const PENDING = [row({ id: 7, customer: 777 }), row({ id: 8, customer: 888, customer_name: "", username: "sara" })];
const CLOSED = [row({ id: 9, customer: 999, status: "rejected", expired: true, decided_at: "2026-01-02T10:00:00+00:00" }), row({ id: 10, customer: 1010, status: "blocked", decided_at: "2026-01-03T10:00:00+00:00" })];

function serve(rows: { pending?: EntryApprovalRow[]; closed?: EntryApprovalRow[] } = {}) {
  get.mockImplementation((path: string) => {
    if (path.startsWith("/entry-approvals")) return Promise.resolve({ ok: true, view: "x", requests: path.endsWith("closed") ? (rows.closed ?? CLOSED) : (rows.pending ?? PENDING) });
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

beforeEach(() => {
  get.mockReset();
  action.mockReset();
  ask.mockReset();
  ask.mockResolvedValue(true);
  action.mockResolvedValue({ ok: true, message: "" });
  window.history.replaceState(null, "", "/settings?tab=limits");
});
afterEach(cleanup);

describe("entry approval requests", () => {
  it("lists the waiting customers with all three decisions and the handle apart from the name", async () => {
    serve();
    render(<EntryApprovalRequests />);
    expect(await screen.findByText("علی")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/entry-approvals?view=pending");
    expect(screen.getByRole("button", { name: "تأیید علی" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "رد علی" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "مسدود علی" })).toBeTruthy();
    expect(screen.getByText("@ali")).toBeTruthy();
    expect(screen.getByText("@sara")).toBeTruthy();
  });

  it("asks first, then posts the decision and reloads the list", async () => {
    const user = userEvent.setup();
    serve();
    render(<EntryApprovalRequests />);
    await user.click(await screen.findByRole("button", { name: "تأیید علی" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(ask).toHaveBeenCalledWith("تأیید ورود", expect.objectContaining({ confirmLabel: "تأیید" }));
    expect(action).toHaveBeenCalledWith("/entry-approvals/7/approve", {});
    await waitFor(() => expect(get.mock.calls.filter(([path]) => path === "/entry-approvals?view=pending")).toHaveLength(2));
  });

  it("posts nothing when the staff member declines the question", async () => {
    ask.mockResolvedValue(false);
    const user = userEvent.setup();
    serve();
    render(<EntryApprovalRequests />);
    await user.click(await screen.findByRole("button", { name: "مسدود علی" }));
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(action).not.toHaveBeenCalled();
  });

  it("shows the rejected and blocked ones in their own view, with only the decisions still possible", async () => {
    const user = userEvent.setup();
    serve();
    render(<EntryApprovalRequests />);
    await screen.findByText("علی");
    await user.click(screen.getByRole("tab", { name: "ردشده و مسدود" }));
    expect(await screen.findByText("منقضی")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/entry-approvals?view=closed");
    const expired = screen.getByText("منقضی").closest("tr") as HTMLElement;
    expect(within(expired).getAllByRole("button").map((button) => button.textContent)).toEqual(["تأیید", "مسدود"]);
    const blocked = screen.getAllByRole("row").find((tr) => tr.textContent?.includes("1010")) as HTMLElement;
    expect(within(blocked).getAllByRole("button").map((button) => button.textContent)).toEqual(["تأیید"]);
  });

  it("does not keep the waiting customers on screen while the other view loads", async () => {
    const user = userEvent.setup();
    let release: (value: unknown) => void = () => undefined;
    get.mockImplementation((path: string) => (path.endsWith("closed") ? new Promise((resolve) => (release = resolve)) : Promise.resolve({ ok: true, view: "pending", requests: PENDING })));
    render(<EntryApprovalRequests />);
    await screen.findByText("علی");
    await user.click(screen.getByRole("tab", { name: "ردشده و مسدود" }));
    expect(screen.queryByText("علی")).toBeNull();
    release({ ok: true, view: "closed", requests: CLOSED });
    expect(await screen.findByText("منقضی")).toBeTruthy();
  });

  it("says so when nobody waits", async () => {
    serve({ pending: [] });
    render(<EntryApprovalRequests />);
    expect(await screen.findByText("درخواست ورودی در انتظار نیست")).toBeTruthy();
  });

  it("stays out of the page for staff who may not decide", async () => {
    get.mockRejectedValue(new PanelError("دسترسی تأیید ورود کاربران را ندارید.", 403));
    const { container } = render(<EntryApprovalRequests />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    await waitFor(() => expect(container.textContent).toBe(""));
  });

  it("offers a retry when the list cannot be loaded", async () => {
    get.mockRejectedValueOnce(new PanelError("ارتباط برقرار نشد", 500));
    serve();
    const user = userEvent.setup();
    render(<EntryApprovalRequests />);
    await user.click(await screen.findByRole("button", { name: /تلاش دوباره/ }));
    expect(await screen.findByText("علی")).toBeTruthy();
  });

  it("shows a hostile name as text", async () => {
    const hostile = '<img src=x onerror="alert(1)">';
    serve({ pending: [row({ id: 3, customer_name: hostile })] });
    const { container } = render(<EntryApprovalRequests />);
    expect(await screen.findByText(hostile)).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });
});

const field = (patch: Partial<SettingField>): SettingField => ({ key: "k", label: "L", kind: "text", help: "", options: [], value: "", show_when: null, variables: null, ...patch });
const WHEN_ON = { key: "entry_approval_enabled", values: ["1"] };
const GATE_NAME = "تأیید ورود کاربران جدید";
const REFERRAL_NAME = "معرف اجباری";
const SWITCH = /ورود فقط با تأیید ادمین/;

function ownerLimits(enabled: boolean): TabData {
  return {
    tab: "limits",
    nav: { kind: "bot", panel_tabs: [], security_href: "/security", groups: [] },
    groups: [
      {
        name: GATE_NAME,
        caption: "",
        notice: null,
        fields: [
          field({ key: "entry_approval_enabled", label: "ورود فقط با تأیید ادمین", kind: "toggle", value: enabled }),
          field({ key: "entry_approval_skip_referred", label: "معافیت ورود با لینک دعوت", kind: "toggle", value: false, show_when: WHEN_ON }),
          field({ key: "entry_approval_retry_hours", label: "درخواست دوباره بعد از رد (ساعت)", kind: "number", value: "24", show_when: WHEN_ON }),
          field({ key: "entry_approval_pending_text", label: "پیام در انتظار تأیید", kind: "textarea", value: "منتظر بمانید", show_when: WHEN_ON }),
        ],
      },
      { name: REFERRAL_NAME, caption: "", notice: null, fields: [field({ key: "referral_required", label: "معرف اجباری", kind: "toggle", value: false })] },
    ],
  };
}

const hoursWrapper = () => screen.getByRole("spinbutton", { name: /درخواست دوباره/, hidden: true }).closest("[hidden]");
const textWrapper = () => screen.getByRole("textbox", { name: "پیام در انتظار تأیید", hidden: true }).closest("[hidden]");

describe("the owner's limits tab", () => {
  it("puts the requests list first, then the switches' card, then the other limits", async () => {
    serve();
    render(<GenericTab data={ownerLimits(true)} reload={vi.fn()} />);
    const list = (await screen.findByText("درخواست‌های ورود")).closest("section") as HTMLElement;
    const gate = screen.getByText(GATE_NAME).closest("section") as HTMLElement;
    const referral = screen.getByText(REFERRAL_NAME, { selector: "h3" }).closest("section") as HTMLElement;
    expect(list.compareDocumentPosition(gate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(gate.compareDocumentPosition(referral) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(gate).getByRole("switch", { name: SWITCH })).toBeTruthy();
  });

  it("shows the dependent fields as soon as the switch is turned on, before saving, and hides them again when it goes off", async () => {
    const user = userEvent.setup();
    serve();
    render(<GenericTab data={ownerLimits(false)} reload={vi.fn()} />);
    expect(hoursWrapper()).not.toBeNull();
    expect(textWrapper()).not.toBeNull();
    await user.click(screen.getByRole("switch", { name: SWITCH }));
    expect(hoursWrapper()).toBeNull();
    expect(textWrapper()).toBeNull();
    expect(action).not.toHaveBeenCalled();
    await user.click(screen.getByRole("switch", { name: SWITCH }));
    expect(hoursWrapper()).not.toBeNull();
  });

  it("keeps the switches open as the first folded item when the tab has many groups, and they still drive their fields", async () => {
    const user = userEvent.setup();
    serve();
    const data = ownerLimits(false);
    const others = ["شماره تماس خرید", "اکانت تست", "ضدتقلب رسید"].map((name) => ({ name, caption: "", notice: null, fields: [field({ key: `k_${name}`, label: `فیلد ${name}`, kind: "toggle", value: false })] }));
    data.groups = [...(data.groups ?? []), ...others];
    render(<GenericTab data={data} reload={vi.fn()} />);
    const switchControl = screen.getByRole("switch", { name: SWITCH });
    expect(switchControl).toBeTruthy();
    expect(hoursWrapper()).not.toBeNull();
    await user.click(switchControl);
    expect(hoursWrapper()).toBeNull();
  });

  it("still posts the hidden fields, so their saved values survive the switch being off", async () => {
    const user = userEvent.setup();
    serve();
    render(<GenericTab data={ownerLimits(false)} reload={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "ذخیره محدودیت‌ها" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const [path, fields] = action.mock.calls[0] as [string, Record<string, string>];
    expect(path).toBe("/settings?tab=limits");
    expect(fields).toMatchObject({ s_entry_approval_retry_hours: "24", s_entry_approval_pending_text: "منتظر بمانید" });
    expect(fields.s_entry_approval_enabled).toBeUndefined();
  });
});

type ShopField = SettingSection["fields"][number];
const shopField = (patch: Partial<ShopField>): ShopField => ({ key: "k", label: "L", kind: "text", help: "", options: [], value: "", show_when: null, ...patch });
const section = (title: string, fields: ShopField[]): SettingSection => ({ title, notice: null, caption: "", fields });

function shopLimits(withGate: boolean): ShopSettings {
  const gate = section(GATE_NAME, [
    shopField({ key: "entry_approval_enabled", label: "ورود فقط با تأیید ادمین", kind: "toggle", value: false }),
    shopField({ key: "entry_approval_retry_hours", label: "درخواست دوباره بعد از رد (ساعت)", kind: "number", value: "24", show_when: WHEN_ON }),
  ]);
  return {
    tab: "limits",
    nav: [],
    preview: false,
    shop_title: "فروشگاه",
    reset: { enabled: false, confirm: "" },
    style_options: [],
    sections: [...(withGate ? [gate] : []), section(REFERRAL_NAME, [shopField({ key: "referral_required", label: "معرف اجباری", kind: "toggle", value: false })])],
    extra: {},
  };
}

function serveShop(data: ShopSettings, listing: "allowed" | "forbidden") {
  get.mockImplementation((path: string) => {
    if (path.startsWith("/api/panel/shop-settings")) return Promise.resolve(data);
    if (listing === "forbidden") return Promise.reject(new PanelError("دسترسی تأیید ورود کاربران را ندارید.", 403));
    return Promise.resolve({ ok: true, view: "pending", requests: PENDING });
  });
}

describe("the shop's limits tab", () => {
  it("shows the requests list above the switches' card and the switch reveals its fields before saving", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/shop-settings?tab=limits");
    serveShop(shopLimits(true), "allowed");
    render(<ShopSettingsPage />);
    const list = (await screen.findByText("درخواست‌های ورود")).closest("section") as HTMLElement;
    const gate = screen.getByText(GATE_NAME).closest("section") as HTMLElement;
    expect(list.compareDocumentPosition(gate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hoursWrapper()).not.toBeNull();
    await user.click(screen.getByRole("switch", { name: SWITCH }));
    expect(hoursWrapper()).toBeNull();
  });

  it("shows neither the list nor the switches to a shop without the permission", async () => {
    window.history.replaceState(null, "", "/shop-settings?tab=limits");
    serveShop(shopLimits(false), "forbidden");
    render(<ShopSettingsPage />);
    await screen.findByText(REFERRAL_NAME, { selector: "h3" });
    await waitFor(() => expect(get).toHaveBeenCalledWith("/entry-approvals?view=pending"));
    expect(screen.queryByText("درخواست‌های ورود")).toBeNull();
    expect(screen.queryByText(GATE_NAME)).toBeNull();
  });
});
