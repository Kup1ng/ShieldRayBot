"use client";

/** One setting field drawn by its kind: the same renderers for the Owner and the shop settings pages. */

import { Chip } from "@heroui/react";

import { SelectInput, SwitchInput, TextAreaInput, TextInput } from "../ui/Fields";
import { ChannelsField } from "./ChannelsField";
import { GuidesField } from "./GuidesField";
import { ImageField } from "./ImageField";
import { ListField } from "./ListField";
import { fieldVisible, isWideField, type FormState } from "./logic";
import { TokenHints } from "./TokenHints";
import type { GuidesExtra, SettingField, SettingGroup, StyleOption } from "./types";
import type { FormModel } from "./useSettingsForm";

export type FieldEnv = {
  form: FormModel;
  guides?: GuidesExtra;
  /** Button colors for the guide editor, when the page's payload carries its own list. */
  styleOptions?: StyleOption[];
  /** Tells the preview which field the staff member is editing. */
  onFocus?: (key: string) => void;
};

function FieldBody({ field, env }: { field: SettingField; env: FieldEnv }) {
  const { form } = env;
  const value = form.state[field.key];
  const text = String(value ?? "");
  const help = field.help || undefined;
  const set = (next: string | boolean) => form.set(field.key, next);
  switch (field.kind) {
    case "toggle":
      return <SwitchInput label={field.label} help={help} checked={value === true} onChange={set} />;
    case "select":
    case "btn_color":
      return <SelectInput label={field.label} help={help} value={text} onChange={set} options={field.options.map((o) => ({ id: o.value, label: o.label }))} />;
    case "list":
      return <ListField label={field.label} help={help} value={text} onChange={set} kind={field.list_kind === "money" ? "money" : "text"} placeholder={field.placeholder} />;
    case "force_channels":
      return <ChannelsField label={field.label} help={help} value={text} onChange={set} />;
    case "connection_guides":
      return <GuidesField label={field.label} help={help} value={text} onChange={set} guides={env.guides} styleOptions={env.styleOptions} />;
    case "image":
      return <ImageField field={field} images={form.images} onPick={(file) => form.pickImage(field.key, file)} onClear={(cleared) => form.clearImage(field.key, cleared)} />;
    case "textarea":
      return (
        <div className="flex flex-col gap-1.5">
          <TextAreaInput label={field.label} help={help} rows={5} value={text} onChange={set} />
          {field.variables ? <TokenHints text={text} allowed={field.variables} /> : null}
        </div>
      );
    case "number":
      return <TextInput label={field.label} help={help} type="number" value={text} onChange={set} min={field.min} max={field.max} step={field.min !== undefined ? 1 : undefined} />;
    case "password":
      return (
        <TextInput
          label={
            <span className="flex items-center gap-2">
              {field.label}
              {field.has_value ? (
                <Chip size="sm" color="success" variant="soft">
                  <Chip.Label>ذخیره شده</Chip.Label>
                </Chip>
              ) : null}
            </span>
          }
          help={help}
          type="password"
          ltr
          value={text}
          onChange={set}
          placeholder={field.has_value ? "•••••••• (ذخیره شده؛ برای تغییر مقدار جدید را بنویسید)" : "وارد کنید"}
        />
      );
    default:
      return (
        <div className="flex flex-col gap-1.5">
          <TextInput label={field.label} help={help} value={text} onChange={set} />
          {field.variables ? <TokenHints text={text} allowed={field.variables} /> : null}
        </div>
      );
  }
}

/** One field of a settings form by kind; a field tied to another is hidden (never dropped) while it does not apply. */
export function SettingFieldView({ field, env }: { field: SettingField; env: FieldEnv }) {
  const state: FormState = env.form.state;
  const visible = fieldVisible(field, state);
  return (
    <div hidden={!visible} className={`min-w-0 ${isWideField(field) ? "sm:col-span-2" : ""}`} onFocusCapture={() => env.onFocus?.(field.key)}>
      <FieldBody field={field} env={env} />
    </div>
  );
}

export function GroupFields({ group, env }: { group: SettingGroup; env: FieldEnv }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {group.fields.map((field) => (
        <SettingFieldView key={field.key} field={field} env={env} />
      ))}
    </div>
  );
}
