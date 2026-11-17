import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { panelAction } from "../../core/api";
import { buildBoardRows, groupRowId } from "./planBoard";
import type { BoardGroup, PlanBoard, PlanRow, PlansOverview } from "./types";
import { UserPlansSection } from "./UserPlansSection";

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return { ...actual, panelAction: vi.fn(async () => ({ ok: true, message: "انجام شد" })) };
});

afterEach(() => {
  cleanup();
  vi.mocked(panelAction).mockClear();
  vi.restoreAllMocks();
});

const HOSTILE = "<img src=x onerror=alert(1)>";

const plan = (id: number, name: string): PlanRow => ({
  id, name, price: 1000 * id, duration_days: 30, data_limit_gb: 10, pg_template_id: null, pg_group_ids: "1", category_id: null, category_name: null,
  is_active: true, template_missing: false, source_empty: false, limit_issue: null,
});

const group = (over: Partial<BoardGroup> & Pick<BoardGroup, "category_id" | "name">): BoardGroup => ({
  tone: "default", is_active: true, in_bot: true, bot_note: null, plan_ids: [], can_move_up: true, can_move_down: true, ...over,
});

const BOARD: PlanBoard = {
  has_categories: true,
  groups: [
    group({ category_id: 11, name: "ویژه", tone: "success", plan_ids: [4], can_move_up: false }),
    group({ category_id: 12, name: HOSTILE, is_active: false, in_bot: false, bot_note: "خاموش است؛ در ربات دیده نمی‌شود", can_move_down: false }),
  ],
  other: { title: "سایر", note: "بدون دسته؛ در ربات زیر دکمهٔ «سایر» می‌آید", plan_ids: [5] },
};

function overview(board: PlanBoard, plans: PlanRow[]): PlansOverview {
  return {
    plans,
    plan_board: board,
    trial: { exists: false, enabled: false, name: "تست", duration_days: 1, data_limit_gb: null, pg_template_id: null, pg_group_ids: [], naming: { prefix: "", suffix: "", pattern: "" }, button_style: "inherit", limit_issue: null },
    custom: { enabled: false, price_per_gb: "1", price_per_day: "1", min_gb: "1", max_gb: "5", min_days: "1", max_days: "9", template_id: null, group_ids: [], naming: { prefix: "", suffix: "", pattern: "" }, button_style: "inherit", limit_issue: null },
    wholesale: { enabled: false, min_qty: "5", max_qty: "20", button_text: "x", tiers: [] },
    addon_packs: [],
  } as unknown as PlansOverview;
}

const GROUPED = overview(BOARD, [plan(4, "چهار"), plan(5, "پنج")]);

function renderSection(data: PlansOverview, handlers: { onAddPlan?: (id: number) => void; onEditCategory?: (id: number | null) => void } = {}) {
  const reload = vi.fn();
  render(<UserPlansSection data={data} reload={reload} onSetting={() => undefined} onEditPack={() => undefined} onAddPlan={handlers.onAddPlan ?? (() => undefined)} onEditCategory={handlers.onEditCategory ?? (() => undefined)} />);
  return { reload };
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole("button", { name: label }));
}

describe("plan board rows", () => {
  it("lists the groups in the bot's order, each with its plans, then the plans without a category and the other plan types", () => {
    const rows = buildBoardRows(GROUPED);
    expect(rows.map((row) => `${row.kind}:${row.id}`)).toEqual([
      `group:${groupRowId(11)}`, "plan:4", `group:${groupRowId(12)}`, "add:-902", "other:-900", "plan:5", "types:-901", "special:-1", "special:-2", "special:-3",
    ]);
  });

  it("drops a plan id the list does not hold and never repeats a plan", () => {
    const data = overview({ ...BOARD, groups: [group({ category_id: 11, name: "ویژه", plan_ids: [4, 99] })], other: { title: "", note: "", plan_ids: [] } }, [plan(4, "چهار")]);
    const planRows = buildBoardRows(data).filter((row) => row.kind === "plan");
    expect(planRows.map((row) => row.id)).toEqual([4]);
  });

  it("is a flat list with an invitation while the shop has no category, and none when it has no plan", () => {
    const flat = overview({ has_categories: false, groups: [], other: { title: "", note: "", plan_ids: [] } }, [plan(4, "چهار"), plan(5, "پنج")]);
    expect(buildBoardRows(flat).map((row) => row.kind)).toEqual(["intro", "plan", "plan", "special", "special", "special"]);
    expect(buildBoardRows({ ...flat, plans: [] }).map((row) => row.kind)).toEqual(["special", "special", "special"]);
  });

  it("still shows a category without plans, so it can be switched on, moved or removed", () => {
    const data = overview({ has_categories: true, groups: [group({ category_id: 7, name: "خالی", bot_note: "پلنی ندارد؛ در ربات دیده نمی‌شود" })], other: { title: "", note: "", plan_ids: [] } }, []);
    expect(buildBoardRows(data).map((row) => row.kind)).toEqual(["group", "add", "types", "special", "special", "special"]);
  });
});

describe("grouped plans list", () => {
  it("draws the groups with their counts and bot notes, the plans without a category and the types that take none", () => {
    renderSection(GROUPED);
    const table = screen.getByRole("grid", { name: "پلن‌های کاربران" });
    expect(within(table).getByText("ویژه")).toBeTruthy();
    expect(within(table).getByText("خاموش است؛ در ربات دیده نمی‌شود")).toBeTruthy();
    expect(within(table).getByText("سایر")).toBeTruthy();
    expect(within(table).getByText("بدون دسته؛ در ربات زیر دکمهٔ «سایر» می‌آید")).toBeTruthy();
    expect(within(table).getByText("انواع دیگر")).toBeTruthy();
    expect(within(table).getByText("تست، دلخواه و عمده دسته نمی‌گیرند")).toBeTruthy();
    expect(within(table).getAllByText("چهار")).toHaveLength(1);
    const order = within(table).getAllByRole("row").map((row) => row.textContent ?? "");
    const at = (text: string) => order.findIndex((line) => line.includes(text));
    expect(at("ویژه")).toBeLessThan(at("چهار"));
    expect(at("چهار")).toBeLessThan(at("خاموش است؛ در ربات"));
    expect(at("سایر")).toBeLessThan(at("پنج"));
    expect(at("پنج")).toBeLessThan(at("انواع دیگر"));
  });

  it("shows a category name as text, never as markup", () => {
    renderSection(GROUPED);
    expect(screen.getByText(HOSTILE)).toBeTruthy();
    expect(document.querySelector("img[onerror]")).toBeNull();
  });

  it("gives a group heading no checkbox, so a select-all picks plans only", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderSection(GROUPED);
    const table = screen.getByRole("grid", { name: "پلن‌های کاربران" });
    // A heading row is one cell across the table: it has no box and cannot be picked.
    const heading = within(table).getAllByRole("row").find((row) => row.textContent?.includes("ویژه"));
    expect(within(heading as HTMLElement).queryAllByRole("checkbox")).toHaveLength(0);
    const pickable = within(table).getAllByRole("checkbox").filter((box) => !(box as HTMLInputElement).disabled && box.getAttribute("aria-disabled") !== "true");
    // The header's select-all and the two plans; the trial, custom and wholesale rows stay unpickable as before.
    expect(pickable).toHaveLength(3);
    await user.click(within(table).getByRole("checkbox", { name: "انتخاب همه" }));
    await user.click(await screen.findByRole("button", { name: "روشن/خاموش" }));
    await waitFor(() => expect(panelAction).toHaveBeenCalled());
    const [path, fields] = vi.mocked(panelAction).mock.calls[0] as [string, { ids: string[] }];
    expect(path).toBe("/plans/bulk-action");
    expect([...fields.ids].sort()).toEqual(["4", "5"]);
  });

  it("offers only the moves a group can make and starts a plan in an active category", async () => {
    const user = userEvent.setup();
    const onAddPlan = vi.fn();
    const onEditCategory = vi.fn();
    renderSection(GROUPED, { onAddPlan, onEditCategory });
    await openMenu(user, "عملیات دسته ویژه");
    expect(screen.queryByRole("menuitem", { name: "بالاتر در ربات" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "پایین‌تر در ربات" })).toBeTruthy();
    await user.click(screen.getByRole("menuitem", { name: "پلن در این دسته" }));
    expect(onAddPlan).toHaveBeenCalledWith(11);

    await openMenu(user, "عملیات دسته ویژه");
    await user.click(screen.getByRole("menuitem", { name: "ویرایش نام و رنگ" }));
    expect(onEditCategory).toHaveBeenCalledWith(11);

    await openMenu(user, `عملیات دسته ${HOSTILE}`);
    expect(screen.getByRole("menuitem", { name: "بالاتر در ربات" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "پایین‌تر در ربات" })).toBeNull();
    // A switched-off category takes no new plan until it is on again.
    expect(screen.queryByRole("menuitem", { name: "پلن در این دسته" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "روشن‌کردن" })).toBeTruthy();
  });

  it("moves a category through the existing handler and reloads the list", async () => {
    const user = userEvent.setup();
    const { reload } = renderSection(GROUPED);
    await openMenu(user, "عملیات دسته ویژه");
    await user.click(screen.getByRole("menuitem", { name: "پایین‌تر در ربات" }));
    await waitFor(() => expect(panelAction).toHaveBeenCalled());
    expect(vi.mocked(panelAction).mock.calls[0]).toEqual(["/plans/categories/11/move", { direction: "down" }]);
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it("switches a category on or off from the list and asks before deleting it", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderSection(GROUPED);
    await openMenu(user, "عملیات دسته ویژه");
    await user.click(screen.getByRole("menuitem", { name: "خاموش‌کردن" }));
    await waitFor(() => expect(panelAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(panelAction).mock.calls[0]).toEqual(["/plans/categories/11/toggle", { back: "list" }]);

    await openMenu(user, "عملیات دسته ویژه");
    await user.click(screen.getByRole("menuitem", { name: "حذف دسته" }));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(String(confirmSpy.mock.calls[0][0])).toContain("پلن‌هایش بدون دسته می‌مانند");
    // Said no: nothing was deleted.
    expect(vi.mocked(panelAction)).toHaveBeenCalledTimes(1);

    confirmSpy.mockReturnValue(true);
    await openMenu(user, "عملیات دسته ویژه");
    await user.click(screen.getByRole("menuitem", { name: "حذف دسته" }));
    await waitFor(() => expect(panelAction).toHaveBeenCalledTimes(2));
    expect(vi.mocked(panelAction).mock.calls[1]).toEqual(["/plans/categories/11/delete", { back: "list" }]);
  });

  it("opens a new category from the end of the groups", async () => {
    const user = userEvent.setup();
    const onEditCategory = vi.fn();
    renderSection(GROUPED, { onEditCategory });
    await user.click(screen.getByRole("button", { name: "دستهٔ جدید" }));
    expect(onEditCategory).toHaveBeenCalledWith(null);
  });

  it("invites a shop without categories to make the first one", async () => {
    const user = userEvent.setup();
    const onEditCategory = vi.fn();
    const flat = overview({ has_categories: false, groups: [], other: { title: "", note: "", plan_ids: [] } }, [plan(4, "چهار")]);
    renderSection(flat, { onEditCategory });
    expect(screen.getByText("دسته‌بندی پلن‌ها")).toBeTruthy();
    expect(screen.queryByText("انواع دیگر")).toBeNull();
    await user.click(screen.getByRole("button", { name: "ساخت دسته" }));
    expect(onEditCategory).toHaveBeenCalledWith(null);
  });
});
