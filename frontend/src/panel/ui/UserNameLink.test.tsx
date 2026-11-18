import { Table } from "@heroui/react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
let nav: { id: string; items: { id: string }[] }[] | undefined;

vi.mock("../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../core/api")>();
  return { ...actual, panelGet: (path: string) => get(path), panelAction: vi.fn() };
});
vi.mock("../core/session", () => ({
  usePanelSession: () => {
    if (!nav) throw new Error("usePanelSession must be used inside <PanelSessionProvider>");
    return { session: { nav }, refresh: vi.fn() };
  },
}));

import type { UserCard } from "../pages/users/types";
import { UserNameLink } from "./UserNameLink";

const HOSTILE = '<img src=x onerror="alert(1)">';
const OWNER_NAV = [{ id: "shop", items: [{ id: "users" }, { id: "finance" }] }];
const SHOP_NAV = [{ id: "shop", items: [{ id: "customers" }] }];
const NO_USERS_NAV = [{ id: "shop", items: [{ id: "finance" }] }];

const CARD: UserCard = {
  user: { id: 42, name: "Aboli", username: "", telegram_id: 9, role: "user", is_blocked: false, is_demo: false, message_name: "Aboli" },
  risk_tag: null,
  wallet_balance: 0,
  points_balance: 0,
  paid_total: 0,
  paid_count: 0,
  joined: "—",
  services: [],
  edit_target: "user_link",
  can_message: true,
  opened_from: "finance",
};

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue(CARD);
  nav = OWNER_NAV;
});

afterEach(cleanup);

describe("a customer's name in a table", () => {
  it("opens the card in place, telling the server which page it came from", async () => {
    render(<UserNameLink userId={42} name="Aboli" page="finance" />);
    const name = screen.getByRole("button", { name: "Aboli" });
    expect(get).not.toHaveBeenCalled();
    await userEvent.setup().click(name);
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/panel/users/42/card?from=finance"));
    expect(await screen.findByText("اطلاعات کاربر")).toBeTruthy();
  });

  it("is a button for shop staff with the customers right too", () => {
    nav = SHOP_NAV;
    render(<UserNameLink userId={42} name="Aboli" page="tickets" />);
    expect(screen.getByRole("button", { name: "Aboli" })).toBeTruthy();
  });

  it("stays plain text for staff without the users right", () => {
    nav = NO_USERS_NAV;
    render(<UserNameLink userId={42} name="Aboli" page="finance" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Aboli")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("stays plain text outside the panel shell, where there is no session", () => {
    nav = undefined;
    render(<UserNameLink userId={42} name="Aboli" page="finance" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Aboli")).toBeTruthy();
  });

  it("stays plain text for a row without a customer", () => {
    render(<UserNameLink userId={null} name="—" page="finance" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("shows a hostile name as text", () => {
    render(<UserNameLink userId={42} name={HOSTILE} page="loyalty" />);
    expect(screen.getByRole("button", { name: HOSTILE })).toBeTruthy();
    expect(document.querySelector("img[onerror]")).toBeNull();
  });

  it("keeps the card's keyboard and click events away from the table around it", async () => {
    const onRowKey = vi.fn();
    const onRowClick = vi.fn();
    render(
      <div onKeyDown={onRowKey} onClick={onRowClick}>
        <UserNameLink userId={42} name="Aboli" page="cleanup" />
      </div>,
    );
    const ui = userEvent.setup();
    await ui.click(screen.getByRole("button", { name: "Aboli" }));
    onRowClick.mockClear();
    await screen.findByText("اطلاعات کاربر");
    await ui.keyboard("{ArrowDown}");
    await ui.click(screen.getByRole("heading", { name: "Aboli" }));
    expect(onRowKey).not.toHaveBeenCalled();
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("does not select the table row it sits in", async () => {
    render(
      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label="سفارش‌ها" selectionMode="multiple">
            <Table.Header>
              <Table.Column isRowHeader>کاربر</Table.Column>
            </Table.Header>
            <Table.Body>
              <Table.Row id={1}>
                <Table.Cell>
                  <UserNameLink userId={42} name="Aboli" page="finance" />
                </Table.Cell>
              </Table.Row>
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Aboli" }));
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/panel/users/42/card?from=finance"));
    expect(document.querySelector('[role="row"][aria-selected="true"]')).toBeNull();
  });
});
