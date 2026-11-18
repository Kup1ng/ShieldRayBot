"use client";

import { Button } from "@heroui/react";

import { Icon } from "@/icons/Icon";

import { run } from "../../core/actions";
import { fa } from "../../core/format";
import { StatusChip } from "../../ui/Data";
import { groupAnchor } from "./planBoard";
import { TONE_DOT } from "./quickCategory";
import { RowActions, type RowAction } from "./Tables";
import type { BoardGroup } from "./types";

const BACK_TO_LIST = { back: "list" };

type GroupHeadProps = {
  group: BoardGroup;
  onAddPlan: (categoryId: number) => void;
  onEdit: (categoryId: number) => void;
  /** An action changed the categories: reload the list. */
  onChanged: () => void;
};

function groupActions({ group, onAddPlan, onEdit, onChanged }: GroupHeadProps): RowAction[] {
  const post = async (path: string, fields: Record<string, string>, success?: string) => {
    await run(path, fields, { success });
    onChanged();
  };
  const id = group.category_id;
  const move = (direction: "up" | "down") => post(`/plans/categories/${id}/move`, { direction }, "ترتیب دسته‌ها در ربات عوض شد");
  const actions: Array<RowAction | null> = [
    group.is_active ? { id: "add", label: "پلن در این دسته", icon: "solar:add-circle-linear", run: () => onAddPlan(id) } : null,
    { id: "edit", label: "ویرایش نام و رنگ", icon: "solar:pen-linear", run: () => onEdit(id) },
    group.can_move_up ? { id: "up", label: "بالاتر در ربات", icon: "solar:arrow-up-linear", run: () => move("up") } : null,
    group.can_move_down ? { id: "down", label: "پایین‌تر در ربات", icon: "solar:arrow-down-linear", run: () => move("down") } : null,
    { id: "toggle", label: group.is_active ? "خاموش‌کردن" : "روشن‌کردن", icon: "solar:power-linear", run: () => post(`/plans/categories/${id}/toggle`, BACK_TO_LIST) },
    {
      id: "delete",
      label: "حذف دسته",
      icon: "solar:trash-bin-trash-linear",
      tone: "danger",
      confirmText: { message: `دستهٔ «${group.name}» حذف شود؟ پلن‌هایش بدون دسته می‌مانند و در ربات زیر «سایر» می‌آیند.`, description: "حذف دسته", confirmLabel: "حذف دسته" },
      run: () => post(`/plans/categories/${id}/delete`, BACK_TO_LIST, "برچسب دسته حذف شد"),
    },
  ];
  return actions.filter((action): action is RowAction => action !== null);
}

/** The heading of one category group: its bot button's colour and name, how many plans it holds and why it is missing from the bot. */
export function GroupHead(props: GroupHeadProps) {
  const { group } = props;
  return (
    <div id={groupAnchor(group.category_id)} className="flex scroll-mt-24 flex-col gap-1 py-1">
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden className={`size-3 shrink-0 rounded-full ${TONE_DOT[group.tone]}`} />
        <bdi className="text-base font-semibold text-foreground">{group.name}</bdi>
        <span className="text-xs text-muted">
          <bdi className="num">{fa(group.plan_ids.length)}</bdi> پلن
        </span>
        {group.is_active ? null : <StatusChip color="warning">خاموش</StatusChip>}
        <span className="ms-auto">
          <RowActions label={`عملیات دسته ${group.name}`} actions={groupActions(props)} />
        </span>
      </div>
      {group.bot_note ? <p className="text-xs text-muted">{group.bot_note}</p> : null}
    </div>
  );
}

/** A heading without actions: the plans that have no category, or the plan types that never take one. */
export function PlainHead({ title, note, count }: { title: string; note?: string; count?: number }) {
  return (
    <div className="flex flex-col gap-1 py-1">
      <div className="flex flex-wrap items-center gap-2">
        <bdi className="text-base font-semibold text-foreground">{title}</bdi>
        {count === undefined ? null : (
          <span className="text-xs text-muted">
            <bdi className="num">{fa(count)}</bdi> پلن
          </span>
        )}
      </div>
      {note ? <p className="text-xs text-muted">{note}</p> : null}
    </div>
  );
}

/** «دستهٔ جدید» at the end of the groups. */
export function AddCategoryRow({ onNew }: { onNew: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="w-fit" onPress={onNew}>
      <Icon name="solar:add-circle-linear" size={18} />
      دستهٔ جدید
    </Button>
  );
}

/** Shown while a shop has no category: what categories do in the bot, and the way to make the first. */
export function CategoryIntro({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-1">
      <p className="flex flex-col gap-0.5 text-sm">
        <strong className="text-foreground">دسته‌بندی پلن‌ها</strong>
        <span className="text-muted">با دسته، مشتری در ربات اول دسته را انتخاب می‌کند (مثلاً «ویژه» یا «اقتصادی») و بعد پلن را.</span>
      </p>
      <Button variant="secondary" size="sm" onPress={onNew}>
        ساخت دسته
      </Button>
    </div>
  );
}
