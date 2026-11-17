import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { panelAction } from "../../core/api";
import { CategoriesDialog, type CategoriesRequest } from "./CategoriesDialog";
import { PlanCategoryField, mergeCategories } from "./PlanCategoryField";
import { FixedPlanForm } from "./PlanForms";
import { CATEGORY_NAME_MAX, cleanCategoryName, createQuickCategory, readQuickResult } from "./quickCategory";
import type { CategoryRow, PlanFormCategory, PlansOverview, StyleOption } from "./types";

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return { ...actual, panelAction: vi.fn(async () => ({ ok: true, message: "ذخیره شد" })) };
});

afterEach(() => {
  cleanup();
  vi.mocked(panelAction).mockClear();
  vi.unstubAllGlobals();
  document.cookie = "csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
});

const HOSTILE = "<img src=x onerror=alert(1)>";
const STYLES: StyleOption[] = [
  { value: "inherit", label: "ارث", tone: "default" },
  { value: "success", label: "سبز", tone: "success" },
];
const CATEGORIES: PlanFormCategory[] = [
  { id: 1, name: "ویژه", is_active: true, tone: "success" },
  { id: 2, name: HOSTILE, is_active: false, tone: "default" },
];

function answer(body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function Harness({ initial = "", onCategoryAdded, onSubmit }: { initial?: string; onCategoryAdded?: () => void; onSubmit?: () => void }) {
  const [value, setValue] = useState(initial);
  return (
    <form onSubmit={(event) => { event.preventDefault(); onSubmit?.(); }}>
      <PlanCategoryField value={value} onChange={setValue} categories={CATEGORIES} styleOptions={STYLES} onCategoryAdded={onCategoryAdded} />
      <output data-testid="picked">{value}</output>
    </form>
  );
}

describe("quick category helpers", () => {
  it("trims a name and refuses one longer than the column", () => {
    expect(cleanCategoryName("  ویژه ")).toBe("ویژه");
    expect(cleanCategoryName("x".repeat(CATEGORY_NAME_MAX + 1))).toBe("");
    expect(cleanCategoryName("   ")).toBe("");
    expect(cleanCategoryName("x".repeat(CATEGORY_NAME_MAX))).toBe("x".repeat(CATEGORY_NAME_MAX));
  });

  it("reads the handler's answer and never shows raw internal text", () => {
    expect(readQuickResult({ ok: true, id: 7, name: "ویژه", created: true, tone: "danger" })).toEqual({ ok: true, category: { id: 7, name: "ویژه", tone: "danger" } });
    expect(readQuickResult({ ok: true, id: 7, name: "ویژه", tone: "purple" })).toEqual({ ok: true, category: { id: 7, name: "ویژه", tone: "default" } });
    expect(readQuickResult({ ok: false, error: "نام دسته‌بندی الزامی است" })).toEqual({ ok: false, error: "نام دسته‌بندی الزامی است" });
    for (const body of [null, "x", { ok: true, id: 0, name: "a" }, { ok: true, id: 1.5, name: "a" }, { ok: true, id: "7", name: "a" }, { ok: true, id: 3 }, { ok: false, error: "  " }, { ok: false, error: "IntegrityError: duplicate key" }]) {
      const result = readQuickResult(body);
      expect(result.ok).toBe(false);
      expect(result.ok ? "" : result.error).not.toMatch(/IntegrityError/);
    }
  });

  it("posts the name and colour with the CSRF token the panel sets, and survives a lost connection", async () => {
    document.cookie = "csrf=tok123";
    const fetchMock = answer({ ok: true, id: 9, name: "جدید", tone: "success" });
    const result = await createQuickCategory("جدید", "success");
    expect(result).toEqual({ ok: true, category: { id: 9, name: "جدید", tone: "success" } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/plans/categories/quick");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-CSRF-Token"]).toBe("tok123");
    const form = init.body as FormData;
    expect([form.get("name"), form.get("button_style"), form.get("csrf_token")]).toEqual(["جدید", "success", "tok123"]);

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
    expect((await createQuickCategory("جدید", "inherit")).ok).toBe(false);
  });
});

describe("plan category field", () => {
  it("offers the shop's categories with their bot colour, a switched-off one marked, and «بدون دسته»", () => {
    render(<Harness initial="2" />);
    const group = screen.getByRole("radiogroup", { name: "برچسب دسته" });
    const chips = within(group).getAllByRole("radio");
    expect(chips.map((chip) => chip.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect(within(group).getByText(HOSTILE)).toBeTruthy();
    expect(within(group).getByText("خاموش")).toBeTruthy();
    expect(within(group).getByRole("radio", { name: "بدون دسته" })).toBeTruthy();
    expect(document.querySelector("img[onerror]")).toBeNull();
    expect(group.querySelector(".bg-success")).not.toBeNull();
  });

  it("picks a category and clears it again", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("radio", { name: /ویژه/ }));
    expect(screen.getByTestId("picked").textContent).toBe("1");
    await user.click(screen.getByRole("radio", { name: "بدون دسته" }));
    expect(screen.getByTestId("picked").textContent).toBe("");
  });

  it("adds a category in place with the chosen bot colour, picks it and tells the page to reload", async () => {
    const user = userEvent.setup();
    const fetchMock = answer({ ok: true, id: 5, name: "اقتصادی", created: true, tone: "success" });
    const onCategoryAdded = vi.fn();
    render(<Harness onCategoryAdded={onCategoryAdded} />);
    await user.click(screen.getByRole("button", { name: "+ جدید" }));
    await user.type(screen.getByRole("textbox", { name: "نام دستهٔ جدید" }), "اقتصادی");
    await user.click(screen.getByRole("button", { name: "افزودن دسته" }));
    await waitFor(() => expect(screen.getByTestId("picked").textContent).toBe("5"));
    const body = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    expect([body.get("name"), body.get("button_style")]).toEqual(["اقتصادی", "inherit"]);
    expect(screen.getByRole("radio", { name: /اقتصادی/ }).getAttribute("aria-checked")).toBe("true");
    expect(onCategoryAdded).toHaveBeenCalledTimes(1);
    // The add panel closes once the category exists.
    expect(screen.queryByRole("textbox", { name: "نام دستهٔ جدید" })).toBeNull();
  });

  it("adds on Enter without submitting the plan form", async () => {
    const user = userEvent.setup();
    answer({ ok: true, id: 6, name: "ویژه‌تر", tone: "default" });
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "+ جدید" }));
    await user.type(screen.getByRole("textbox", { name: "نام دستهٔ جدید" }), "ویژه‌تر{Enter}");
    await waitFor(() => expect(screen.getByTestId("picked").textContent).toBe("6"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("asks for a name before it sends anything", async () => {
    const user = userEvent.setup();
    const fetchMock = answer({ ok: true, id: 1, name: "x" });
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "+ جدید" }));
    await user.click(screen.getByRole("button", { name: "افزودن دسته" }));
    expect((await screen.findByRole("alert")).textContent).toContain("نام دسته را بنویسید");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the handler's refusal and keeps the choice as it was", async () => {
    const user = userEvent.setup();
    answer({ ok: false, error: "دسته‌ای با همین نام هست ولی خاموش است؛ از فهرست دسته‌ها روشنش کنید" });
    render(<Harness initial="1" />);
    await user.click(screen.getByRole("button", { name: "+ جدید" }));
    await user.type(screen.getByRole("textbox", { name: "نام دستهٔ جدید" }), "قدیمی");
    await user.click(screen.getByRole("button", { name: "افزودن دسته" }));
    expect((await screen.findByRole("alert")).textContent).toContain("خاموش است");
    expect(screen.getByTestId("picked").textContent).toBe("1");
  });

  it("does not list a category twice once the page has reloaded it", () => {
    const merged = mergeCategories(CATEGORIES, [{ id: 1, name: "ویژه", is_active: true, tone: "success" }, { id: 3, name: "تازه", is_active: true, tone: "default" }]);
    expect(merged.map((c) => c.id)).toEqual([1, 2, 3]);
  });
});

describe("plan form with a category", () => {
  const data = {
    categories: [{ id: 11, name: "ویژه", description: "", audience: "users", sort_order: 0, is_active: true, button_style: "inherit", tone: "success", linked_plans: [], linked_packs: [] }],
    category_style_options: STYLES,
    groups: [{ id: 2, name: "گروه" }],
    templates: [],
    can_create_template: false,
    limits: { cards: [], per_user_data_max_text: null, per_user_expire_max_days: null, account_data_limit_text: null, max_users: null },
    is_platform_admin: false,
    naming_defaults: { prefix: "", suffix: "", pattern: "{prefix}_{random}{suffix}" },
    plan_style_options: STYLES,
    pack_style_options: STYLES,
    pack_config: { user: { max_per_kind: 20, batch: { max_rows: 3, max_volume_gb: 10000, max_days: 3650 }, volume: { defaults: [1], max: 10000 }, duration: { defaults: [1], max: 120 } } },
  } as unknown as PlansOverview;

  it("starts inside the category chosen from its group and posts it with the plan", async () => {
    const user = userEvent.setup();
    render(<FixedPlanForm data={data} initialCategory="11" onDone={() => undefined} onCancel={() => undefined} />);
    expect(screen.getByRole("radio", { name: /ویژه/ }).getAttribute("aria-checked")).toBe("true");
    await user.type(screen.getByRole("textbox", { name: /^نام پلن/ }), "پلن");
    await user.type(screen.getByRole("textbox", { name: /^قیمت \(تومان\)/ }), "1000");
    await user.click(screen.getByRole("checkbox", { name: "گروه" }));
    await user.click(screen.getByRole("button", { name: "ذخیره پلن" }));
    await waitFor(() => expect(panelAction).toHaveBeenCalledTimes(1));
    const [path, fields] = vi.mocked(panelAction).mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/plans");
    expect(fields).toMatchObject({ category_id: "11", name: "پلن" });
  });

  it("puts the category right under the plan name and before the price, once", () => {
    render(<FixedPlanForm data={data} onDone={() => undefined} onCancel={() => undefined} />);
    const name = screen.getByRole("textbox", { name: /^نام پلن/ });
    const category = screen.getByRole("radiogroup", { name: "برچسب دسته" });
    const price = screen.getByRole("textbox", { name: /^قیمت \(تومان\)/ });
    expect(name.compareDocumentPosition(category) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(category.compareDocumentPosition(price) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole("radiogroup", { name: "برچسب دسته" })).toHaveLength(1);
  });

  it("shows the sample username the generator builds when the global prefix is empty", async () => {
    const user = userEvent.setup();
    render(<FixedPlanForm data={data} onDone={() => undefined} onCancel={() => undefined} />);
    expect(screen.getByText("نمونه نام:").textContent).toMatch(/^نمونه نام: [a-z0-9]+$/);
    expect(screen.getByText("نمونه نام:").textContent).not.toMatch(/clk|_/);
    await user.type(screen.getByRole("textbox", { name: "پیشوند" }), "vip");
    expect(screen.getByText(/^نمونه نام:/).textContent).toMatch(/vip_[a-z0-9]+$/);
  });
});

describe("categories dialog", () => {
  const row = (id: number, name: string): CategoryRow => ({ id, name, description: "توضیح", audience: "users", sort_order: id, is_active: true, button_style: "success", tone: "success", linked_plans: [], linked_packs: [] });
  const request = (over: Partial<CategoriesRequest> = {}): CategoriesRequest => ({ key: 1, back: "list", editId: null, ...over });

  function renderDialog(req: CategoriesRequest, onSaved = vi.fn()) {
    render(<CategoriesDialog isOpen onOpenChange={() => undefined} request={req} categories={[row(3, "ویژه")]} isAdmin={false} styleOptions={STYLES} reload={() => undefined} onSaved={onSaved} />);
    return onSaved;
  }

  it("has no order field: a category keeps its place in the bot until it is moved from the list", async () => {
    const user = userEvent.setup();
    const onSaved = renderDialog(request({ back: "" }));
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "ترتیب" })).toBeNull();
    await user.type(screen.getByRole("textbox", { name: /^نام برچسب/ }), "تازه");
    await user.click(screen.getByRole("button", { name: "افزودن برچسب" }));
    await waitFor(() => expect(panelAction).toHaveBeenCalledTimes(1));
    const [path, fields] = vi.mocked(panelAction).mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/plans/categories");
    expect(fields).toMatchObject({ name: "تازه", audience: "users", button_style: "inherit", back: "" });
    expect(fields).not.toHaveProperty("sort_order");
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(null));
  });

  it("opens on the category chosen in the list and reports which one was saved", async () => {
    const user = userEvent.setup();
    const onSaved = renderDialog(request({ editId: 3 }));
    const name = screen.getByRole("textbox", { name: /^نام برچسب/ }) as HTMLInputElement;
    expect(name.value).toBe("ویژه");
    await user.click(screen.getByRole("button", { name: "ذخیره تغییرات" }));
    await waitFor(() => expect(panelAction).toHaveBeenCalledTimes(1));
    const [path, fields] = vi.mocked(panelAction).mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/plans/categories/3/edit");
    expect(fields).toMatchObject({ name: "ویژه", button_style: "success", back: "list" });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(3));
  });
});
