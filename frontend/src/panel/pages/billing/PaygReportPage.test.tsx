import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return { ...actual, panelGet: (path: string) => get(path) };
});
vi.mock("../../layout/PanelShell", () => ({ PanelShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import type { FinanceOverview } from "../finance/types";
import { creditChip, PaygReportPage } from "./PaygReportPage";
import type { PaygReportData, PaygReportRow } from "./types";

const ROW: PaygReportRow = { shop_id: 5, label: "alpha", balance: -7000, credit_limit: 20000, credit_status: "overdue", month_charges: 7000, open_debt: 6000, month_cashback: 0, debt: 7000 };
const REPORT: PaygReportData = { rows: [ROW], totals: { debt: 7000, month_charges: 7000, month_cashback: 500 } };
const OWNER: FinanceOverview = { tabs: ["reports", "orders", "payments", "delivery", "cancellations", "automation"], can_orders: true, can_payments: true, can_settings: true, can_void_payment: true, can_payg_report: true };

function serve(report: PaygReportData, overview: FinanceOverview = OWNER) {
  get.mockImplementation((path: string) => Promise.resolve(path === "/api/panel/finance/payg" ? report : overview));
}

beforeEach(() => get.mockReset());
afterEach(cleanup);

describe("PAYG report page", () => {
  it("shows a shop's money, credit state and a link to its card", async () => {
    serve(REPORT);
    render(<PaygReportPage />);
    expect(await screen.findByText("alpha")).toBeTruthy();
    expect(screen.getByText("سررسید گذشته")).toBeTruthy();
    const card = screen.getByRole("link", { name: "کارت نماینده alpha" });
    expect(card.getAttribute("href")).toBe("/resellers/5/edit");
    expect(screen.getByText("بدهی نمایندگان")).toBeTruthy();
  });

  it("keeps the finance tab strip with the PAYG tab active", async () => {
    serve(REPORT);
    render(<PaygReportPage />);
    const tab = await screen.findByRole("tab", { name: "نمایندگان PAYG" });
    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "گزارشات" }).getAttribute("aria-selected")).toBe("false");
  });

  it("offers the CSV as a plain download link and the review page", async () => {
    serve(REPORT);
    render(<PaygReportPage />);
    const csv = await screen.findByRole("link", { name: /خروجی CSV/ });
    expect(csv.getAttribute("href")).toBe("/finance/payg.csv");
    expect(csv.hasAttribute("download")).toBe(true);
    expect(screen.getByRole("button", { name: /بازبینی هزینه‌ها/ })).toBeTruthy();
  });

  it("shows the empty state when no PAYG shop exists", async () => {
    serve({ rows: [], totals: { debt: 0, month_charges: 0, month_cashback: 0 } });
    render(<PaygReportPage />);
    expect(await screen.findByText("نمایندهٔ PAYG وجود ندارد")).toBeTruthy();
  });

  it("shows a shop label as text, never as markup", async () => {
    serve({ ...REPORT, rows: [{ ...ROW, label: "<img src=x onerror=1>" }] });
    const { container } = render(<PaygReportPage />);
    expect(await screen.findByText("<img src=x onerror=1>")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("names the credit state, «عادی» when nothing restricts the line", () => {
    expect(creditChip("frozen").label).toBe("منجمد");
    expect(creditChip("blocked").color).toBe("danger");
    expect(creditChip("active").label).toBe("عادی");
  });
});
