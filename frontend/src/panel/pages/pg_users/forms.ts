import type { PgGroupRow, PgHostRow, PgTemplateRow, PgUserRow } from "./types";

/** Form values and the exact field names the existing PasarGuard form handlers read. */

export type FormFields = Record<string, string>;

export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,32}$/;
export const USERNAME_ERROR = "نام کاربری باید ۳ تا ۳۲ کاراکتر انگلیسی، عدد یا _ باشد (بدون فاصله و فارسی)";
export const NO_GROUP_ERROR = "حداقل یک گروه انتخاب کنید";
export const NO_TEMPLATE_ERROR = "تمپلیت را انتخاب کنید";
export const DEFAULT_TEMPLATE_DAYS = "30";

export type CreateMode = "custom" | "template";

export type CreateUserForm = {
  username: string;
  mode: CreateMode;
  gb: string;
  days: string;
  hwid: string;
  groupIds: string[];
  templateId: string;
};

export type EditUserForm = { gb: string; days: string; hwid: string; groupIds: string[] };

const text = (value: number | null | undefined): string => (value === null || value === undefined ? "" : String(value));

/** The first problem the old page's script caught before posting; null when the form may be sent. */
export function createUserError(form: CreateUserForm): string | null {
  if (!USERNAME_PATTERN.test(form.username.trim())) return USERNAME_ERROR;
  if (form.mode === "template") return form.templateId ? null : NO_TEMPLATE_ERROR;
  return form.groupIds.length ? null : NO_GROUP_ERROR;
}

/** `<prefix><id>` carries the id as its value, like the old switch chips. */
function idFields(prefix: string, ids: string[]): FormFields {
  return Object.fromEntries(ids.map((id) => [`${prefix}${id}`, id]));
}

export function createUserFields(form: CreateUserForm): FormFields {
  const base = { username: form.username.trim(), mode: form.mode };
  if (form.mode === "template") return { ...base, template_id: form.templateId };
  return { ...base, data_limit_gb: form.gb.trim(), duration_days: form.days.trim(), hwid_limit: form.hwid.trim(), ...idFields("group_", form.groupIds) };
}

/** Which create mode the dialog opens in (the old page's `default_mode`). */
export function defaultCreateMode({ requireTemplate, canCustom, canTemplate }: { requireTemplate: boolean; canCustom: boolean; canTemplate: boolean }): CreateMode {
  return requireTemplate || (canTemplate && !canCustom) ? "template" : "custom";
}

export function editUserForm(row: PgUserRow): EditUserForm {
  return { gb: text(row.data_gb), days: text(row.days_left), hwid: text(row.hwid_limit), groupIds: row.group_ids.map(String) };
}

export function editUserError(form: EditUserForm): string | null {
  return form.groupIds.length ? null : NO_GROUP_ERROR;
}

/** The edit form always sends the device limit: empty means unlimited, exactly like the old form. */
export function editUserFields(form: EditUserForm): FormFields {
  return { data_limit_gb: form.gb.trim(), duration_days: form.days.trim(), hwid_limit: form.hwid.trim(), ...idFields("edit_group_", form.groupIds) };
}

export type TemplateForm = { name: string; gb: string; days: string; groupIds: string[] };

export function templateForm(row: PgTemplateRow | null): TemplateForm {
  if (!row) return { name: "", gb: "", days: DEFAULT_TEMPLATE_DAYS, groupIds: [] };
  return { name: row.name, gb: text(row.data_gb), days: text(row.expire_days) || DEFAULT_TEMPLATE_DAYS, groupIds: row.group_ids.map(String) };
}

export function templateError(form: TemplateForm): string | null {
  if (!form.name.trim()) return "نام تمپلیت را وارد کنید";
  return form.groupIds.length ? null : NO_GROUP_ERROR;
}

export function templateFields(form: TemplateForm): FormFields {
  return { name: form.name.trim(), data_limit_gb: form.gb.trim(), expire_days: form.days.trim(), ...idFields("g_", form.groupIds) };
}

export type GroupForm = { name: string; tags: string[]; disabled: boolean };

export function groupForm(row: PgGroupRow | null): GroupForm {
  return row ? { name: row.name, tags: [...row.inbound_tags], disabled: row.is_disabled } : { name: "", tags: [], disabled: false };
}

export function groupError(form: GroupForm): string | null {
  if (!form.name.trim()) return "نام گروه را وارد کنید";
  return form.tags.length ? null : "حداقل یک اینباند انتخاب کنید";
}

/**
 * The handler reads every `tag_*` field; the index only makes the names unique. «is_disabled» is
 * sent only when on (a missing checkbox means off), and only by the edit form.
 */
export function groupBodyFields(form: GroupForm, { editing }: { editing: boolean }): FormFields {
  const tags = Object.fromEntries(form.tags.map((tag, index) => [`tag_${index + 1}`, tag]));
  return { name: form.name.trim(), ...tags, ...(editing && form.disabled ? { is_disabled: "1" } : {}) };
}

export type HostForm = { remark: string; addresses: string[]; port: string; priority: string; inboundTag: string };

export function hostForm(row: PgHostRow | null): HostForm {
  if (!row) return { remark: "", addresses: [], port: "", priority: "0", inboundTag: "" };
  return { remark: row.remark, addresses: [...row.address], port: text(row.port), priority: String(row.priority), inboundTag: row.inbound_tag };
}

export function hostError(form: HostForm): string | null {
  if (!form.remark.trim()) return "عنوان هاست را وارد کنید";
  if (!form.addresses.length) return "آدرس هاست الزامی است";
  return form.inboundTag ? null : "اینباند را انتخاب کنید";
}

/** Addresses travel as one comma-separated field; the handler splits it. */
export function hostFields(form: HostForm): FormFields {
  return { remark: form.remark.trim(), address: form.addresses.join(","), port: form.port.trim(), priority: form.priority.trim() || "0", inbound_tag: form.inboundTag };
}

/** Typed or pasted addresses (comma, Persian comma or newline separated) added to the list once each. */
export function addAddresses(current: string[], raw: string): string[] {
  const added = raw
    .split(/[,،؛\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return Array.from(new Set([...current, ...added]));
}
