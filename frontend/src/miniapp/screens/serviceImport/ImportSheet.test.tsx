import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { useMini } from "../../state/store";
import { customerMe, fakeApi, renderMini, type FakeHandler } from "../../test/harness";
import { RouteProbe, SheetOutlet, currentView } from "../shop/shopTestKit";
import { IMPORT_PATH } from "./importKit";
import { openImportSheet } from "./ImportSheet";

type User = ReturnType<typeof userEvent.setup>;

const LINK = "https://p.example/sub/tok-secret-0000001";
const TITLE = "اتصال اشتراک قبلی";

function Opener() {
  const mini = useMini();
  return <button onClick={() => openImportSheet(mini)}>باز کردن</button>;
}

function setup(routes: Record<string, FakeHandler> = {}) {
  const api = fakeApi({
    "GET /api/mini/me": () => ({ json: customerMe() }),
    "GET /api/mini/services": () => ({ json: { items: [], next_before_id: null } }),
    ...routes,
  });
  renderMini(
    <>
      <RouteProbe />
      <Opener />
      <SheetOutlet />
    </>,
  );
  return api;
}

const posts = (api: ReturnType<typeof setup>) => api.callsTo("POST", IMPORT_PATH);
const field = () => screen.getByRole("textbox", { name: "لینک اشتراک" });
const submit = () => screen.getByRole("button", { name: "افزودن سرویس" });

async function open(user: User) {
  await user.click(screen.getByRole("button", { name: "باز کردن" }));
  await screen.findByRole("heading", { name: TITLE });
}

describe("import a previous service", () => {
  it("never sends an empty link and says what is missing", async () => {
    const user = userEvent.setup();
    const api = setup();
    await open(user);
    await user.type(field(), "   ");
    await user.click(submit());
    expect((await screen.findByRole("alert")).textContent).toBe("لینک اشتراک را وارد کنید.");
    expect(posts(api)).toHaveLength(0);
  });

  it("sends the trimmed link once per tap, in the body only, then opens the refreshed service list", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const api = setup({
      [`POST ${IMPORT_PATH}`]: async () => {
        await gate;
        return { json: { outcome: "added", message: "سرویس به لیست شما اضافه شد.", service_id: 7 } };
      },
    });
    await open(user);
    expect(field().getAttribute("dir")).toBe("ltr");
    await user.type(field(), `  ${LINK}  `);
    fireEvent.click(submit());
    fireEvent.click(submit());
    release();
    await waitFor(() => expect(screen.queryByRole("heading", { name: TITLE })).toBeNull());
    expect(posts(api)).toHaveLength(1);
    expect(posts(api)[0].body).toEqual({ link: LINK });
    expect(api.calls.some((call) => call.path.includes("tok-secret") || call.path.includes("?"))).toBe(false);
    expect((await screen.findAllByText("سرویس به لیست شما اضافه شد.")).length).toBeGreaterThan(0);
    await waitFor(() => expect(currentView()).toBe("services"));
    expect(api.callsTo("GET", "/api/mini/me").length).toBeGreaterThanOrEqual(1);
  });

  it("shows a refusal in Persian inside the sheet and keeps the link for a fix", async () => {
    const user = userEvent.setup();
    const refusal = "این لینک قابل افزودن نیست. لینک اشتراک را بررسی کنید یا با پشتیبانی تماس بگیرید.";
    const api = setup({ [`POST ${IMPORT_PATH}`]: () => ({ status: 400, json: { detail: refusal } }) });
    await open(user);
    await user.type(field(), LINK);
    await user.click(submit());
    expect((await screen.findByRole("alert")).textContent).toBe(refusal);
    expect(screen.getByRole("heading", { name: TITLE })).toBeTruthy();
    expect((field() as HTMLInputElement).value).toBe(LINK);
    expect(api.callsTo("GET", "/api/mini/me")).toHaveLength(0);
    expect(currentView()).toBe("home");
  });

  it("never shows raw English or markup from the server", async () => {
    const user = userEvent.setup();
    setup({ [`POST ${IMPORT_PATH}`]: () => ({ status: 500, json: { detail: "<img src=x onerror=alert(1)> Traceback" } }) });
    await open(user);
    await user.type(field(), LINK);
    await user.click(submit());
    expect((await screen.findByRole("alert")).textContent).toBe("ارتباط با سرور برقرار نشد؛ دوباره تلاش کنید.");
    expect(document.querySelector("img[onerror]")).toBeNull();
  });

  it("closes without opening the list when the request waits for an admin", async () => {
    const user = userEvent.setup();
    const api = setup({
      [`POST ${IMPORT_PATH}`]: () => ({ json: { outcome: "pending_approval", message: "درخواست شما ثبت شد.", service_id: null } }),
    });
    await open(user);
    await user.type(field(), LINK);
    await user.click(submit());
    await waitFor(() => expect(screen.queryByRole("heading", { name: TITLE })).toBeNull());
    expect((await screen.findAllByText("درخواست شما ثبت شد.")).length).toBeGreaterThan(0);
    expect(currentView()).toBe("home");
    expect(api.callsTo("GET", "/api/mini/me")).toHaveLength(0);
  });

  it("a lost response is not retried and the state is read again", async () => {
    const user = userEvent.setup();
    const api = setup({ [`POST ${IMPORT_PATH}`]: () => "network-error" });
    await open(user);
    await user.type(field(), LINK);
    await user.click(submit());
    expect((await screen.findByRole("alert")).textContent).toContain("نتیجه مشخص نشد");
    await waitFor(() => expect(api.callsTo("GET", "/api/mini/me").length).toBeGreaterThanOrEqual(1));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(posts(api)).toHaveLength(1);
  });
});
