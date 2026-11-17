import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { fakeApi, renderMini, type FakeHandler } from "../../test/harness";
import { SheetOutlet, meWithWallet } from "../shop/shopTestKit";
import { AccountScreen } from "./AccountScreen";

const WAITING = { id: 9, amount: 100000, method: "card", status: "pending", status_fa: "در انتظار رسید", waiting_receipt: true, created_at: "2026-10-01T10:00:00Z" };

type User = ReturnType<typeof userEvent.setup>;

function receipts(extra: Record<string, FakeHandler> = {}) {
  const me = meWithWallet(0);
  const api = fakeApi({
    "GET /api/mini/me": () => ({ json: me }),
    "GET /api/mini/activity": () => ({ json: { items: [] } }),
    "GET /api/mini/topup": () => ({
      json: { methods: [], presets: [], min_amount: 1000, max_amount: 5000000, bot_only: false, recent: [WAITING] },
    }),
    ...extra,
  });
  renderMini(
    <>
      <AccountScreen />
      <SheetOutlet />
    </>,
    { me, route: { view: "account" } },
  );
  return api;
}

const sheet = () => screen.getByRole("region", { name: "برگهٔ باز" });
const uploads = (api: ReturnType<typeof receipts>) => api.calls.filter((c) => c.method === "POST" && c.path.endsWith("/receipt"));

async function openReceipt(user: User) {
  await user.click(await screen.findByRole("button", { name: "ارسال رسید" }));
  await screen.findByRole("heading", { name: "ارسال رسید" });
}

function fileInput(): HTMLInputElement {
  const input = sheet().querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("no file input in the receipt sheet");
  return input;
}

function pick(file: File | null) {
  fireEvent.change(fileInput(), { target: { files: file ? [file] : [] } });
}

const submit = () => screen.getAllByRole("button", { name: "ارسال رسید" }).find((b) => sheet().contains(b))!;
const photo = () => new File(["jpeg-bytes"], "receipt.jpg", { type: "image/jpeg" });

describe("receipt upload", () => {
  it("sends the chosen image once as the raw body with its own type, then closes", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const api = receipts({
      "POST /api/mini/topup/9/receipt": async () => {
        await gate;
        return { json: { status: "pending", message: "رسید ثبت شد" } };
      },
    });
    await openReceipt(user);
    const file = photo();
    pick(file);
    expect(within(sheet()).getByText("receipt.jpg")).toBeTruthy();
    fireEvent.click(submit());
    fireEvent.click(submit());
    release();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "ارسال رسید" })).toBeNull());
    expect(uploads(api)).toHaveLength(1);
    expect(uploads(api)[0].path).toBe("/api/mini/topup/9/receipt");
    expect(uploads(api)[0].body).toBe(file);
    expect(uploads(api)[0].headers["Content-Type"]).toBe("image/jpeg");
    expect((await screen.findAllByText("رسید ثبت شد")).length).toBeGreaterThan(0);
  });

  it("a lost response is not retried, and the top-up list and wallet are read again", async () => {
    const user = userEvent.setup();
    const api = receipts({ "POST /api/mini/topup/9/receipt": () => "network-error" });
    await openReceipt(user);
    pick(photo());
    const topupReads = api.callsTo("GET", "/api/mini/topup").length;
    fireEvent.click(submit());
    expect((await screen.findAllByText(/نتیجهٔ ارسال رسید مشخص نشد/)).length).toBeGreaterThan(0);
    await waitFor(() => expect(api.callsTo("GET", "/api/mini/me").length).toBeGreaterThanOrEqual(1));
    await waitFor(() => expect(api.callsTo("GET", "/api/mini/topup").length).toBeGreaterThan(topupReads));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(uploads(api)).toHaveLength(1);
  });

  it("a server refusal is shown as is, without re-reading the wallet", async () => {
    const user = userEvent.setup();
    const api = receipts({ "POST /api/mini/topup/9/receipt": () => ({ status: 409, json: { detail: "برای این پرداخت رسید ثبت شده است." } }) });
    await openReceipt(user);
    pick(photo());
    fireEvent.click(submit());
    expect((await screen.findAllByText("برای این پرداخت رسید ثبت شده است.")).length).toBeGreaterThan(0);
    expect(api.callsTo("GET", "/api/mini/me")).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "ارسال رسید" })).toBeTruthy();
  });

  it.each([
    ["a PDF", new File(["%PDF"], "r.pdf", { type: "application/pdf" })],
    ["an SVG picture", new File(["<svg onload=alert(1)>"], "r.svg", { type: "image/svg+xml" })],
    ["no file at all", null],
  ])("never uploads %s", async (_name, file) => {
    const user = userEvent.setup();
    const api = receipts();
    await openReceipt(user);
    pick(file);
    fireEvent.click(submit());
    expect((await screen.findAllByText(/تصویر رسید را انتخاب کنید|این نوع تصویر پشتیبانی نمی‌شود/)).length).toBeGreaterThan(0);
    expect(uploads(api)).toHaveLength(0);
  });

  it("is not offered for a top-up that already has its receipt", async () => {
    fakeApi({
      "GET /api/mini/activity": () => ({ json: { items: [] } }),
      "GET /api/mini/topup": () => ({
        json: { methods: [], presets: [], min_amount: 1000, max_amount: 5000000, bot_only: false, recent: [{ ...WAITING, waiting_receipt: false, status_fa: "در حال بررسی" }] },
      }),
    });
    renderMini(<AccountScreen />, { me: meWithWallet(0), route: { view: "account" } });
    expect(await screen.findByText("در حال بررسی")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "ارسال رسید" })).toBeNull();
  });
});
