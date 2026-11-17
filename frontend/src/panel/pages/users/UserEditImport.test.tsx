import { toast } from "@heroui/react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppToastProvider } from "@/components/feedback/AppToast";

const action = vi.fn();
const preview = vi.fn();

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return { ...actual, panelAction: (path: string, fields: unknown) => action(path, fields) };
});
vi.mock("../../core/session", () => ({ usePanelSession: () => ({ session: { csrf_token: "csrf-token" }, refresh: vi.fn() }) }));
vi.mock("../../settings-ui/rawPost", () => ({
  postForm: (path: string, fields: unknown, csrf: string) => preview(path, fields, csrf),
}));

import { attachableId, faDigits, previewError, previewRows } from "./importAssign";
import type { UserEdit } from "./types";
import { ImportServiceSection } from "./UserEditImport";

const LINK = "https://panel.example/sub/tok-secret-0000001";
const ANSWER = { ok: true, panel_user_id: 11, panel_username: "plat-one", status: "فعال", used: "1 گیگ", limit: "نامحدود", expire: "—", already_yours: false };

const EDIT = { user: { id: 7, name: "مشتری", username: "", telegram_id: 7007, role: "user", is_blocked: false, is_demo: false } } as UserEdit;

function mount(reload = vi.fn()) {
  render(
    <>
      <AppToastProvider />
      <ImportServiceSection edit={EDIT} reload={reload} />
    </>,
  );
  return reload;
}

async function check(ui: ReturnType<typeof userEvent.setup>, value = LINK) {
  await ui.type(screen.getByRole("textbox", { name: /لینک یا نام کاربری/ }), value);
  await ui.click(screen.getByRole("button", { name: "بررسی" }));
}

function attachButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "افزودن سرویس" }) as HTMLButtonElement;
}

beforeEach(() => {
  action.mockReset();
  preview.mockReset();
  action.mockResolvedValue({ ok: true, message: "سرویس «plat-one» به سرویس‌های این مشتری اضافه شد" });
  preview.mockResolvedValue({ status: 200, body: ANSWER });
});

afterEach(() => {
  cleanup();
  toast.clear();
});

describe("«افزودن سرویس قبلی»", () => {
  it("cannot attach before a service was checked", () => {
    mount();
    expect(attachButton().disabled).toBe(true);
  });

  it("checks the service in a POST body, never in the address, and shows what the panel answered", async () => {
    mount();
    await check(userEvent.setup());
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    const [path, fields, csrf] = preview.mock.calls[0];
    expect(path).toBe("/users/7/import-service/preview");
    expect(path).not.toContain("tok-secret");
    expect(fields).toEqual({ kind: "link", value: LINK });
    expect(csrf).toBe("csrf-token");
    expect(await screen.findByText("plat-one")).toBeTruthy();
    expect(screen.getByText("نامحدود")).toBeTruthy();
    expect(screen.getByText("۱ گیگ")).toBeTruthy();
    expect(attachButton().disabled).toBe(false);
  });

  it("attaches exactly the previewed panel user with a reason, then forgets the link", async () => {
    const reload = mount();
    const ui = userEvent.setup();
    await check(ui);
    await screen.findByText("plat-one");
    await ui.click(attachButton());
    await ui.type(await screen.findByRole("textbox", { name: /علت افزودن/ }), "مشتری لینک را فرستاد");
    await ui.click(screen.getAllByRole("button", { name: "افزودن سرویس" }).at(-1) as HTMLElement);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const [path, fields] = action.mock.calls[0];
    expect(path).toBe("/users/7/import-service");
    expect(fields).toEqual({ kind: "link", value: LINK, panel_user_id: "11", reason: "مشتری لینک را فرستاد", notify: true });
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect((screen.getByRole("textbox", { name: /لینک یا نام کاربری/ }) as HTMLInputElement).value).toBe("");
    expect(document.body.textContent).not.toContain("tok-secret");
  });

  it("does not offer a service that is already in the customer's list", async () => {
    preview.mockResolvedValue({ status: 200, body: { ...ANSWER, already_yours: true } });
    mount();
    await check(userEvent.setup());
    expect(await screen.findByText("این سرویس از قبل در سرویس‌های این مشتری است.")).toBeTruthy();
    expect(attachButton().disabled).toBe(true);
  });

  it("shows the server's refusal and attaches nothing", async () => {
    preview.mockResolvedValue({ status: 409, body: { ok: false, error: "این سرویس به مشتری دیگری وصل است." } });
    mount();
    await check(userEvent.setup());
    expect((await screen.findByRole("alert")).textContent).toBe("این سرویس به مشتری دیگری وصل است.");
    expect(attachButton().disabled).toBe(true);
    expect(action).not.toHaveBeenCalled();
  });

  it("asks for a new check when the input changes after a preview", async () => {
    mount();
    const ui = userEvent.setup();
    await check(ui);
    await screen.findByText("plat-one");
    await ui.type(screen.getByRole("textbox", { name: /لینک یا نام کاربری/ }), "x");
    expect(screen.queryByText("plat-one")).toBeNull();
    expect(attachButton().disabled).toBe(true);
  });

  it("asks for the link before checking", async () => {
    mount();
    await userEvent.setup().click(screen.getByRole("button", { name: "بررسی" }));
    expect((await screen.findByRole("alert")).textContent).toContain("لینک اشتراک یا نام کاربری پنل را وارد کنید");
    expect(preview).not.toHaveBeenCalled();
  });
});

describe("the preview helpers", () => {
  it("writes figures in Persian digits and keeps the panel username as it is", () => {
    const rows = previewRows({ ...ANSWER, panel_username: "user10", used: "3 گیگ", expire: "2027/01/20 · 65 روز" });
    expect(rows[0]).toMatchObject({ label: "کاربر پنل", value: "user10", ltr: true });
    expect(rows[2].value).toBe("۳ گیگ");
    expect(rows[4].value).toBe("۲۰۲۷/۰۱/۲۰ · ۶۵ روز");
    expect(faDigits("a1")).toBe("a۱");
  });

  it("shows a dash for what the answer lacks, and only text", () => {
    expect(previewRows({}).map((row) => row.value)).toEqual(["—", "—", "—", "—", "—"]);
    expect(previewRows({ panel_username: { toString: () => "<b>x</b>" } as unknown as string })[0].value).toBe("—");
  });

  it("allows attaching only a positive integer panel id of a fresh service", () => {
    expect(attachableId(ANSWER)).toBe("11");
    expect(attachableId({ ...ANSWER, already_yours: true })).toBe("");
    expect(attachableId({ ...ANSWER, ok: false })).toBe("");
    for (const id of [0, -1, 1.5, Number.NaN, "11", null, undefined, true]) {
      expect(attachableId({ ...ANSWER, panel_user_id: id as unknown as number }), String(id)).toBe("");
    }
    expect(attachableId(null)).toBe("");
  });

  it("shows only Persian server text as a refusal", () => {
    expect(previewError({ error: "این سرویس به مشتری دیگری وصل است." })).toBe("این سرویس به مشتری دیگری وصل است.");
    expect(previewError({ error: "Traceback (most recent call last)" })).toBe("بررسی انجام نشد. دوباره تلاش کنید.");
    expect(previewError(null)).toBe("بررسی انجام نشد. دوباره تلاش کنید.");
  });
});
