import { toast } from "@heroui/react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppToastProvider } from "@/components/feedback/AppToast";

import { invalidateAllResources } from "../../state/resources";
import { fakeApi, type FakeHandler } from "../../test/harness";
import { AccessScreen } from "./AccessScreen";

const HOSTILE = "<img src=x onerror=alert(1)>";
const TERMS = { title: "قوانین و شرایط استفاده از خدمات", text: `کاربر گرامی\n۱. محدوده مسئولیت ${HOSTILE}` };

const info = (referral = { asked: false, required: false }, required = true) => ({ json: { required, terms: TERMS, referral } });

function mount(routes: Record<string, FakeHandler> = {}) {
  const onDone = vi.fn();
  const api = fakeApi({ "GET /api/mini/access": () => info(), ...routes });
  render(
    <>
      <AppToastProvider />
      <AccessScreen onDone={onDone} />
    </>,
  );
  return { api, onDone };
}

const posts = (api: ReturnType<typeof mount>["api"]) => api.callsTo("POST", "/api/mini/access");
const submit = () => screen.getByRole("button", { name: "ثبت" });
const accept = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("checkbox", { name: /با قوانین و شرایط استفاده موافقم/ }));

afterEach(() => {
  cleanup();
  toast.clear();
  invalidateAllResources();
});

describe("access check", () => {
  it("shows the terms in a scrollable box as text, the agreement checkbox and no invite field when none is asked", async () => {
    mount();
    expect(await screen.findByRole("heading", { name: "تایید دسترسی" })).toBeTruthy();
    const box = await screen.findByRole("region", { name: TERMS.title });
    expect(box.getAttribute("tabindex")).toBe("0");
    expect(box.textContent).toContain("کاربر گرامی");
    expect(box.textContent).toContain(HOSTILE);
    expect(document.querySelector("img[onerror]")).toBeNull();
    expect(screen.getByRole("checkbox", { name: /با قوانین و شرایط استفاده موافقم/ })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "کد دعوت" })).toBeNull();
  });

  it("sends nothing until the terms are accepted", async () => {
    const user = userEvent.setup();
    const { api, onDone } = mount();
    await screen.findByRole("region", { name: TERMS.title });
    await user.click(submit());
    expect((await screen.findAllByText(/باید قوانین و شرایط استفاده را بپذیرید/)).length).toBeGreaterThan(0);
    expect(posts(api)).toHaveLength(0);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("accepts once on a double tap and then lets the app read /me again", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { api, onDone } = mount({
      "POST /api/mini/access": async () => {
        await gate;
        return { json: { ok: true } };
      },
    });
    await screen.findByRole("region", { name: TERMS.title });
    await accept(user);
    fireEvent.click(submit());
    fireEvent.click(submit());
    release();
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(posts(api)).toHaveLength(1);
    expect(posts(api)[0].body).toEqual({ accept: true, referral_code: null });
  });

  it("asks for an invite code, sends it trimmed, and insists on it when it is required", async () => {
    const user = userEvent.setup();
    const { api, onDone } = mount({
      "GET /api/mini/access": () => info({ asked: true, required: true }),
      "POST /api/mini/access": () => ({ json: { ok: true } }),
    });
    const field = await screen.findByRole("textbox", { name: "کد دعوت" });
    await accept(user);
    await user.click(submit());
    expect((await screen.findAllByText("کد دعوت را وارد کنید")).length).toBeGreaterThan(0);
    expect(posts(api)).toHaveLength(0);
    await user.type(field, "  3v53 ");
    await user.click(submit());
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(posts(api)[0].body).toEqual({ accept: true, referral_code: "3v53" });
  });

  it("lets an optional invite code stay empty", async () => {
    const user = userEvent.setup();
    const { api, onDone } = mount({
      "GET /api/mini/access": () => info({ asked: true, required: false }),
      "POST /api/mini/access": () => ({ json: { ok: true } }),
    });
    await screen.findByRole("textbox", { name: "کد دعوت" });
    await accept(user);
    await user.click(submit());
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(posts(api)[0].body).toEqual({ accept: true, referral_code: null });
  });

  it("shows the server's refusal as is and can be tried again", async () => {
    const user = userEvent.setup();
    const { api, onDone } = mount({ "POST /api/mini/access": () => ({ status: 400, json: { detail: "کد دعوت معتبر نیست." } }) });
    await screen.findByRole("region", { name: TERMS.title });
    await accept(user);
    await user.click(submit());
    expect((await screen.findAllByText("کد دعوت معتبر نیست.")).length).toBeGreaterThan(0);
    expect(onDone).not.toHaveBeenCalled();
    await user.click(submit());
    await waitFor(() => expect(posts(api)).toHaveLength(2));
  });

  it("a lost reply is not retried blindly: the app reads the state again", async () => {
    const user = userEvent.setup();
    const { api, onDone } = mount({ "POST /api/mini/access": () => "network-error" });
    await screen.findByRole("region", { name: TERMS.title });
    await accept(user);
    await user.click(submit());
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(posts(api)).toHaveLength(1);
  });

  it("offers a retry when the terms cannot be read", async () => {
    const user = userEvent.setup();
    let fail = true;
    mount({ "GET /api/mini/access": () => (fail ? { status: 500, json: { detail: "خطا" } } : info()) });
    await screen.findByRole("alert");
    fail = false;
    await user.click(screen.getByRole("button", { name: /تلاش دوباره/ }));
    expect(await screen.findByRole("region", { name: TERMS.title })).toBeTruthy();
  });

  it("just continues when nothing is required any more", async () => {
    const user = userEvent.setup();
    const { onDone } = mount({ "GET /api/mini/access": () => ({ json: { required: false, terms: null, referral: { asked: false, required: false } } }) });
    await user.click(await screen.findByRole("button", { name: "ادامه" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
