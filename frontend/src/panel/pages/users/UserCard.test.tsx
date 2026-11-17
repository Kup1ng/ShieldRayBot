import { toast } from "@heroui/react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppToastProvider } from "@/components/feedback/AppToast";

const get = vi.fn();
const action = vi.fn();

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return { ...actual, panelGet: (path: string) => get(path), panelAction: (path: string, fields: unknown) => action(path, fields) };
});

import { ResellerIdentity } from "../resellers/ResellerEditPage";
import { cardEditHref } from "./format";
import type { UserCard, UserCardPage } from "./types";
import { UserCardHost } from "./UserCardHost";
import { UserCardModal } from "./UserCardModal";
import { UserIdentity } from "./UserIdentity";

const HOSTILE = '<img src=x onerror="alert(1)">';

function card(patch: Partial<UserCard> = {}, user: Partial<UserCard["user"]> = {}): UserCard {
  return {
    user: { id: 7, name: "علی", username: "ali_shop", telegram_id: 5501, role: "user", is_blocked: false, is_demo: false, message_name: "علی", ...user },
    risk_tag: { key: "red", title: "پرریسک" },
    wallet_balance: 80,
    points_balance: 340,
    paid_total: 100,
    paid_count: 1,
    joined: "۱ مهر ۱۴۰۵",
    services: [{ id: 1, label: "ماهانه · svc", plan_name: "ماهانه", pg_username: "shop_a_service", volume_text: "۵۰ گیگ", expire_text: "۲ روز", expire_tone: "warn", days_left: 2, has_alert: false }],
    edit_target: "user",
    can_message: true,
    opened_from: "users",
    ...patch,
  };
}

function mountCard(data: UserCard, page: UserCardPage = "users", onMessage = vi.fn()) {
  get.mockResolvedValue(data);
  render(
    <>
      <AppToastProvider />
      <UserCardModal userId={data.user.id} page={page} onClose={vi.fn()} onMessage={onMessage} />
    </>,
  );
  return onMessage;
}

const assign = vi.fn();

beforeEach(() => {
  get.mockReset();
  action.mockReset();
  assign.mockReset();
  action.mockResolvedValue({ ok: true, message: "پیام ارسال شد" });
  vi.stubGlobal("location", { ...window.location, assign });
});

afterEach(() => {
  cleanup();
  toast.clear();
  vi.unstubAllGlobals();
});

describe("the user card", () => {
  it("asks the server for the card of the page it was opened from", async () => {
    mountCard(card(), "finance");
    await screen.findByText("علی");
    expect(get).toHaveBeenCalledWith("/api/panel/users/7/card?from=finance");
  });

  it("opens with the identity header: name, copyable @username and Telegram id", async () => {
    mountCard(card());
    expect(await screen.findByRole("heading", { name: "علی" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "کپی یوزرنیم" }).textContent).toContain("@ali_shop");
    expect(screen.getByRole("button", { name: "کپی آیدی عددی" }).textContent).toContain("5501");
    expect(screen.getByText("فعال")).toBeTruthy();
    expect(screen.getByText("پرریسک")).toBeTruthy();
  });

  it("shows the status once, in the header, and the account figures in one box", async () => {
    mountCard(card());
    await screen.findByRole("heading", { name: "علی" });
    expect(screen.getAllByText("فعال")).toHaveLength(1);
    const stats = screen.getByLabelText("خلاصهٔ حساب");
    for (const label of ["کیف پول", "امتیاز", "خرید موفق", "عضویت"]) expect(stats.textContent).toContain(label);
    expect(stats.textContent).toContain("۳۴۰");
    expect(screen.getByText("shop_a_service")).toBeTruthy();
  });

  it("copies the username and the id on tap", async () => {
    mountCard(card());
    const ui = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    await ui.click(await screen.findByRole("button", { name: "کپی یوزرنیم" }));
    await ui.click(screen.getByRole("button", { name: "کپی آیدی عددی" }));
    expect(writeText.mock.calls.map((call) => call[0])).toEqual(["@ali_shop", "5501"]);
  });

  it("has no username chip for a person without a username", async () => {
    mountCard(card({}, { username: "" }));
    await screen.findByRole("heading", { name: "علی" });
    expect(screen.queryByRole("button", { name: "کپی یوزرنیم" })).toBeNull();
    expect(screen.getByRole("button", { name: "کپی آیدی عددی" })).toBeTruthy();
  });

  it("shows a hostile name as text", async () => {
    mountCard(card({}, { name: HOSTILE, message_name: HOSTILE }));
    expect(await screen.findByRole("heading", { name: HOSTILE })).toBeTruthy();
    expect(document.querySelector("img[onerror]")).toBeNull();
  });

  it("edits the customer on the customer's edit screen", async () => {
    mountCard(card({ edit_target: "user" }));
    await userEvent.setup().click(await screen.findByRole("button", { name: "ویرایش" }));
    expect(assign).toHaveBeenCalledWith("/users/7/edit");
  });

  it("edits a reseller on the reseller edit screen when opened from the resellers list", async () => {
    mountCard(card({ edit_target: "reseller" }, { role: "reseller" }), "resellers");
    await userEvent.setup().click(await screen.findByRole("button", { name: "ویرایش" }));
    expect(assign).toHaveBeenCalledWith("/resellers/7/edit");
  });

  it("links to the customer's edit screen from another table", () => {
    expect(cardEditHref("user_link", 11)).toBe("/users/11/edit");
    expect(cardEditHref("user", 11)).toBe("/users/11/edit");
    expect(cardEditHref("reseller", 11)).toBe("/resellers/11/edit");
  });

  it("offers no edit when the server names no edit target", async () => {
    mountCard(card({ edit_target: null }));
    await screen.findByRole("heading", { name: "علی" });
    expect(screen.queryByRole("button", { name: "ویرایش" })).toBeNull();
    expect(screen.getByRole("button", { name: "پیام" })).toBeTruthy();
  });

  it("gives a blocked customer no message button", async () => {
    mountCard(card({ can_message: false }, { is_blocked: true }));
    await screen.findByRole("heading", { name: "علی" });
    expect(screen.queryByRole("button", { name: "پیام" })).toBeNull();
    expect(screen.getByText("مسدود")).toBeTruthy();
  });

  it("hands the message form the page the card was opened from", async () => {
    const onMessage = mountCard(card({ opened_from: "tickets" }), "tickets");
    await userEvent.setup().click(await screen.findByRole("button", { name: "پیام" }));
    expect(onMessage).toHaveBeenCalledWith({ id: 7, name: "علی", returnPage: "tickets" });
  });

  it("shows the server's refusal when the staff member may not open the card", async () => {
    get.mockRejectedValue(new Error("دسترسی ندارید"));
    render(<UserCardModal userId={7} page="finance" onClose={vi.fn()} onMessage={vi.fn()} />);
    expect(await screen.findByText("دسترسی ندارید")).toBeTruthy();
  });
});

describe("a message sent from the card", () => {
  it("returns to the page the card came from", async () => {
    get.mockResolvedValue(card({ opened_from: "trials" }));
    render(
      <>
        <AppToastProvider />
        <UserCardHost userId={7} page="trials" onClose={vi.fn()} />
      </>,
    );
    const ui = userEvent.setup();
    await ui.click(await screen.findByRole("button", { name: "پیام" }));
    await ui.type(await screen.findByRole("textbox", { name: /متن پیام/ }), "سلام");
    await ui.click(screen.getByRole("button", { name: "ارسال" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/users/7/message", { body: "سلام", return_page: "trials" }));
  });
});

describe("one identity header", () => {
  it("is the same on the card, the user edit screen and the reseller edit screen", async () => {
    get.mockResolvedValue({ id: 7, name: "علی", username: "ali_shop", telegram_id: 5501, role: "reseller", is_blocked: true });
    render(
      <ResellerIdentity
        data={{
          user: { id: 7, name: "علی", telegram_id: 5501, role: "reseller", wallet_balance: 0, color_tag: "green" },
          color_tags: [{ key: "green", title: "مطمئن" }],
        }}
      />,
    );
    // The handle and the blocked state arrive from the users API; the header is there at once without them.
    expect(screen.getByRole("heading", { name: "علی" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "کپی آیدی عددی" }).textContent).toContain("5501");
    expect(await screen.findByRole("button", { name: "کپی یوزرنیم" })).toBeTruthy();
    expect(screen.getByText("نماینده")).toBeTruthy();
    expect(screen.getByText("مسدود")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/panel/users/7/identity");
  });

  it("shows a hostile name as text", () => {
    render(<UserIdentity person={{ id: 1, name: HOSTILE, username: "x", telegram_id: 9 }} />);
    expect(screen.getByRole("heading", { name: HOSTILE })).toBeTruthy();
    expect(document.querySelector("img[onerror]")).toBeNull();
  });
});
