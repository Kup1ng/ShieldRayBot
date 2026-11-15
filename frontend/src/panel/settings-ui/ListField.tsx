"use client";

import { Button, Input, Label, TextField } from "@heroui/react";
import { useState } from "react";

import { Icon } from "@/icons/Icon";

import { digitsOnly, fa } from "../core/format";
import { checkListItem, parseListItems, serializeListItems, type ListKind } from "./logic";

function shown(value: string, kind: ListKind): string {
  return kind === "money" && /^\d+$/.test(value) ? fa(Number(value)) : value;
}

/**
 * An ordered list kept in the form as one comma-separated value: add, edit and remove single
 * entries, each checked on its own (money range, Telegram id range, no duplicates).
 */
export function ListField({
  label,
  help,
  value,
  onChange,
  kind,
  placeholder,
}: {
  label: string;
  help?: string;
  value: string;
  onChange: (value: string) => void;
  kind: ListKind;
  placeholder?: string;
}) {
  const items = parseListItems(value, kind);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(-1);
  const [removing, setRemoving] = useState(-1);
  const [error, setError] = useState("");

  const cancel = () => {
    setEditing(-1);
    setDraft("");
    setError("");
  };
  const commit = () => {
    const checked = checkListItem(draft, kind, items, editing);
    if (checked.error) {
      setError(checked.error);
      return;
    }
    const next = items.slice();
    if (editing >= 0) next[editing] = checked.value;
    else next.push(checked.value);
    onChange(serializeListItems(next));
    cancel();
  };
  const edit = (index: number) => {
    setEditing(index);
    setRemoving(-1);
    setDraft(items[index]);
    setError("");
  };
  const remove = (index: number) => {
    onChange(serializeListItems(items.filter((_, i) => i !== index)));
    setRemoving(-1);
    cancel();
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      {help ? <p className="text-xs text-muted">{help}</p> : null}
      {items.length ? (
        <ul className="flex flex-col gap-1.5" aria-label={label}>
          {items.map((item, index) => (
            <li key={`${item}-${index}`} className="inset-tile flex items-center justify-between gap-2 rounded-lg px-3 py-2">
              <bdi dir="ltr" className="num min-w-0 truncate text-sm">
                {shown(item, kind)}
              </bdi>
              {removing === index ? (
                <span className="flex items-center gap-1">
                  <span className="text-xs text-muted">این مورد حذف شود؟</span>
                  <Button size="sm" variant="danger-soft" onPress={() => remove(index)} aria-label={`تأیید حذف ${item}`}>
                    حذف
                  </Button>
                  <Button size="sm" variant="ghost" onPress={() => setRemoving(-1)}>
                    انصراف
                  </Button>
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Button isIconOnly size="sm" variant="ghost" aria-label={`ویرایش ${item}`} onPress={() => edit(index)}>
                    <Icon name="solar:pen-linear" size={18} />
                  </Button>
                  <Button isIconOnly size="sm" variant="ghost" aria-label={`حذف ${item}`} onPress={() => setRemoving(index)}>
                    <Icon name="solar:trash-bin-minimalistic-linear" size={18} />
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">هنوز موردی اضافه نشده است.</p>
      )}
      <div className="flex items-end gap-2">
        <TextField
          className="min-w-0 flex-1"
          value={draft}
          onChange={(raw) => setDraft(kind === "money" ? digitsOnly(raw) : raw)}
          isInvalid={Boolean(error)}
        >
          <Label>{editing >= 0 ? "ویرایش مقدار" : "مقدار جدید"}</Label>
          <Input
            dir="ltr"
            className="text-start"
            placeholder={placeholder || "مقدار جدید"}
            inputMode={kind === "text" ? undefined : "numeric"}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              }
            }}
          />
        </TextField>
        <Button variant="outline" onPress={commit} className="!h-10">
          {editing >= 0 ? "ثبت ویرایش" : "افزودن"}
        </Button>
        {editing >= 0 ? (
          <Button variant="ghost" onPress={cancel} className="!h-10">
            انصراف
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-muted">تغییرات با ذخیرهٔ فرم اعمال می‌شوند.</p>
    </fieldset>
  );
}
