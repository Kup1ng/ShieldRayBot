import { toast } from "@heroui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const action = vi.fn();
const ask = vi.fn();

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, panelAction: (path: string, fields: unknown) => action(path, fields) };
});
vi.mock("./confirm", () => ({ confirm: (title: string, options: unknown) => ask(title, options) }));

import { followLocation, run, stashFlash, takeFlash } from "./actions";
import { PanelError } from "./api";

beforeEach(() => {
  action.mockReset();
  ask.mockReset();
  vi.spyOn(toast, "success").mockReturnValue("t");
  vi.spyOn(toast, "danger").mockReturnValue("t");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("run", () => {
  it("posts once, toasts the server's answer and refreshes", async () => {
    action.mockResolvedValue({ ok: true, message: "ذخیره شد" });
    const refresh = vi.fn();
    const result = await run("/x/save", { a: "1" }, { refresh });
    expect(result).toEqual({ ok: true, message: "ذخیره شد" });
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith("/x/save", { a: "1" });
    expect(toast.success).toHaveBeenCalledWith("ذخیره شد");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("uses the fallback text when a successful handler says nothing", async () => {
    action.mockResolvedValue({ ok: true, message: "" });
    await run("/x", {}, { success: "تمدید شد" });
    expect(toast.success).toHaveBeenCalledWith("تمدید شد");
  });

  it("shows a refusal as an error and still returns it", async () => {
    action.mockResolvedValue({ ok: false, message: "موجودی کافی نیست" });
    const result = await run("/x");
    expect(result?.ok).toBe(false);
    expect(toast.danger).toHaveBeenCalledWith("موجودی کافی نیست");
  });

  it("posts nothing when the confirmation is declined", async () => {
    ask.mockResolvedValue(false);
    const refresh = vi.fn();
    const result = await run("/x/delete", {}, { ask: { title: "حذف شود؟", confirmLabel: "حذف", tone: "danger" }, refresh });
    expect(result).toBeNull();
    expect(action).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(ask).toHaveBeenCalledWith("حذف شود؟", { description: undefined, confirmLabel: "حذف", tone: "danger" });
  });

  it("posts after the confirmation is accepted", async () => {
    ask.mockResolvedValue(true);
    action.mockResolvedValue({ ok: true, message: "" });
    await run("/x/delete", {}, { ask: { title: "حذف شود؟" } });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("reloads instead of posting again when the reply is lost", async () => {
    action.mockRejectedValue(new PanelError("ارتباط با سرور برقرار نشد", 0));
    const refresh = vi.fn();
    const result = await run("/x/pay", {}, { refresh });
    expect(result).toBeNull();
    expect(action).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(toast.danger).toHaveBeenCalledWith("ارتباط با سرور برقرار نشد");
  });

  it("does nothing more once the session has ended", async () => {
    action.mockRejectedValue(new PanelError("نشست شما تمام شده", 401));
    const refresh = vi.fn();
    expect(await run("/x", {}, { refresh })).toBeNull();
    expect(toast.danger).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("followLocation", () => {
  it("moves to same-site panel pages only", () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    followLocation("/plans");
    followLocation("//evil.test/x");
    followLocation("https://evil.test");
    followLocation(undefined);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/plans");
  });
});

describe("flash across a page change", () => {
  it("is shown once", () => {
    stashFlash("کپی پلن ساخته شد");
    expect(takeFlash()).toBe("کپی پلن ساخته شد");
    expect(takeFlash()).toBe("");
  });
});
