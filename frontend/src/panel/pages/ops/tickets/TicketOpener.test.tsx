import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();

vi.mock("../../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../core/api")>();
  return { ...actual, panelGet: (path: string) => get(path), panelAction: vi.fn() };
});
vi.mock("../../../core/confirm", () => ({ confirm: vi.fn() }));
vi.mock("../../../core/session", () => ({
  usePanelSession: () => ({
    session: { csrf_token: "token", alerts: { tickets: 0, inbox: false, cancellations: false }, nav: [{ id: "shop", items: [{ id: "customers" }] }] },
    refresh: vi.fn(),
  }),
}));
vi.mock("../../../layout/PanelShell", () => ({ PanelShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import type { BotTicketDetail, TicketsOverview } from "../types";
import { TicketsPage } from "./TicketsPage";

const WHO = "علی (@ali_x) · آیدی 424242";
const ROW = { id: 4, user_id: 11, user_label: WHO, subject: "سؤال", status: "open", status_label: "باز", status_color: "warning", updated_at: null } as const;

const OVERVIEW: TicketsOverview = {
  is_owner: false,
  can_create: false,
  can_manage_supports: false,
  show_bot_tickets: true,
  panel_tickets: [],
  bot_tickets: [ROW],
  priorities: [],
  limit: 150,
};

beforeEach(() => {
  get.mockReset();
  window.history.replaceState(null, "", "/tickets");
});

afterEach(cleanup);

describe("who opened a customer ticket", () => {
  it("shows the name, username and Telegram id in the list as one button that opens the customer's card", async () => {
    get.mockResolvedValue(OVERVIEW);
    render(<TicketsPage />);
    const who = await screen.findByText(WHO);
    expect(who.closest("button")?.getAttribute("aria-haspopup")).toBe("dialog");
    expect(who.closest("a")).toBeNull();
  });

  it("shows the same label in the ticket dialog", async () => {
    window.history.replaceState(null, "", "/tickets?tg=4");
    const detail: BotTicketDetail = { ...ROW, messages: [], hidden_earlier: 0, can_reply: true, user_known: true } as BotTicketDetail;
    get.mockImplementation(async (path: string) => (path === "/api/panel/tickets" ? OVERVIEW : detail));
    render(<TicketsPage />);
    await screen.findByText("پیامی ثبت نشده.");
    expect(screen.getAllByText(WHO).length).toBe(2);
  });

  it("renders a hostile label as plain text", async () => {
    get.mockResolvedValue({ ...OVERVIEW, bot_tickets: [{ ...ROW, user_label: "<b>x</b> · آیدی 5" }] });
    render(<TicketsPage />);
    expect(await screen.findByText("<b>x</b> · آیدی 5")).toBeTruthy();
    expect(document.querySelector("b")).toBeNull();
  });
});
