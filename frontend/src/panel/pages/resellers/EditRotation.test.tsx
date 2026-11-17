import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const action = vi.fn();
const ask = vi.fn();

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return { ...actual, panelAction: (path: string, fields: unknown) => action(path, fields) };
});
vi.mock("../../core/confirm", () => ({ confirm: (message: string, options: unknown) => ask(message, options) }));

import { RotationRetry } from "./EditRotation";

const settled = vi.fn();

beforeEach(() => {
  action.mockReset();
  ask.mockReset();
  settled.mockReset();
  ask.mockResolvedValue(true);
  action.mockResolvedValue({ ok: true, message: "" });
});

afterEach(cleanup);

describe("panel password rotation retry", () => {
  it("is not shown when no rotation is pending", () => {
    const { container } = render(<RotationRetry shopId={5} pending={false} onSettled={settled} />);
    expect(container.innerHTML).toBe("");
  });

  it("asks first and then posts the retry handler of that shop", async () => {
    const user = userEvent.setup();
    render(<RotationRetry shopId={5} pending onSettled={settled} />);
    expect(screen.getByText(/هنوز تأیید نشده/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "تکرار تغییر رمز پاسارگارد" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/resellers/5/pg-password-rotation", {}));
    const [title, options] = ask.mock.calls[0] as [string, { description: string }];
    expect(title).toBe("تکرار تغییر رمز پاسارگارد");
    expect(options.description).toContain("برای نماینده ارسال نمی‌شود");
    await waitFor(() => expect(settled).toHaveBeenCalled());
  });

  it("posts nothing when the question is declined", async () => {
    const user = userEvent.setup();
    ask.mockResolvedValue(false);
    render(<RotationRetry shopId={5} pending onSettled={settled} />);
    await user.click(screen.getByRole("button", { name: "تکرار تغییر رمز پاسارگارد" }));
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(action).not.toHaveBeenCalled();
  });
});
