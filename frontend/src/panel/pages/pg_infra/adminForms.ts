/** The fields the admin forms post to the existing handlers, and the checks made before posting. */

export const USERNAME_PATTERN = /^[a-zA-Z0-9\-_@.]+$/;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 128;
export const PASSWORD_MIN = 12;
/** The least a delete reason may have; the handler refuses a shorter one. */
export const REASON_MIN = 3;

type Fields = Record<string, string | boolean>;

export type CreateDraft = {
  username: string;
  password: string;
  role_id: string;
  data_limit_gb: string;
  max_users: string;
  max_hwid_per_user: string;
  note: string;
  as_reseller: boolean;
  plan_id: string;
  /** Feature permission keys switched on (all of them by default). */
  perms: string[];
  share_pg_panel_url: boolean;
  allow_volume_oversell: boolean;
  grant_web: boolean;
  is_sudo: boolean;
};

export function emptyCreateDraft(permKeys: string[]): CreateDraft {
  return {
    username: "",
    password: "",
    role_id: "",
    data_limit_gb: "",
    max_users: "",
    max_hwid_per_user: "",
    note: "",
    as_reseller: false,
    plan_id: "",
    perms: permKeys,
    share_pg_panel_url: false,
    allow_volume_oversell: false,
    grant_web: true,
    is_sudo: false,
  };
}

/** The reason the create form cannot be posted yet, or null. The server checks everything again. */
export function createProblem(draft: CreateDraft): string | null {
  const name = draft.username.trim();
  if (name.length < USERNAME_MIN || name.length > USERNAME_MAX || !USERNAME_PATTERN.test(name)) {
    return "نام کاربری باید ۳ تا ۱۲۸ کاراکتر از a-z، 0-9 و - _ @ . باشد.";
  }
  if (draft.password.length < PASSWORD_MIN) return "رمز عبور حداقل ۱۲ کاراکتر باشد.";
  if (draft.as_reseller && !/^\d+$/.test(draft.plan_id)) return "برای ساخت به‌عنوان نماینده، انتخاب پلن نمایندگی الزامی است.";
  return null;
}

/**
 * The create form's fields. Reseller fields travel only when the admin becomes a reseller, the
 * secondary-admin switch only when not (the old form disabled the other group's fields).
 */
export function createFields(draft: CreateDraft, { canToggleOversell }: { canToggleOversell: boolean }): Fields {
  const fields: Fields = {
    username: draft.username.trim(),
    password: draft.password,
    role_id: draft.role_id,
    data_limit_gb: draft.data_limit_gb,
    max_users: draft.max_users,
    max_hwid_per_user: draft.max_hwid_per_user,
    note: draft.note,
  };
  if (draft.is_sudo) fields.is_sudo = true;
  if (!draft.as_reseller) {
    if (draft.grant_web) fields.grant_web = true;
    return fields;
  }
  fields.as_reseller = true;
  fields.plan_id = draft.plan_id;
  for (const key of draft.perms) fields[`perm_${key}`] = true;
  if (draft.share_pg_panel_url) fields.share_pg_panel_url = true;
  if (canToggleOversell && draft.allow_volume_oversell) fields.allow_volume_oversell = true;
  return fields;
}

export type StaffDraft = { web_password: string; pg_api_key: string; clear_pg_api_key: boolean; note: string; plan_id: string; confirm_align: boolean };

/** The secondary-admin grant/edit form; the web username always equals the PasarGuard one. */
export function staffFields(username: string, draft: StaffDraft): Fields {
  const fields: Fields = {
    web_username: username.toLowerCase(),
    web_password: draft.web_password,
    pg_api_key: draft.pg_api_key,
    note: draft.note,
    plan_id: draft.plan_id,
  };
  if (draft.clear_pg_api_key) fields.clear_pg_api_key = true;
  if (draft.confirm_align) fields.confirm_align = true;
  return fields;
}

export type GrantDraft = { plan_id: string; web_password: string; note: string; allow_volume_oversell: boolean; confirm_billing_mode_change: boolean };

export function resellerFields(username: string, draft: GrantDraft, { canToggleOversell }: { canToggleOversell: boolean }): Fields {
  const fields: Fields = { plan_id: draft.plan_id, web_username: username.toLowerCase(), web_password: draft.web_password, note: draft.note };
  if (canToggleOversell && draft.allow_volume_oversell) fields.allow_volume_oversell = true;
  return fields;
}

export function convertFields(draft: GrantDraft, { canToggleOversell }: { canToggleOversell: boolean }): Fields {
  const fields: Fields = { plan_id: draft.plan_id, web_password: draft.web_password, note: draft.note };
  if (draft.confirm_billing_mode_change) fields.confirm_billing_mode_change = true;
  if (canToggleOversell && draft.allow_volume_oversell) fields.allow_volume_oversell = true;
  return fields;
}

/** The path of one of an admin's actions; the name is encoded so a «@» or «.» never changes the route. */
export function adminPath(username: string, action: string): string {
  return `/pg/admins/${encodeURIComponent(username)}/${action}`;
}

export type DeleteCopy = { title: string; text: string; confirmLabel: string };

/** What deleting an admin will take with it, by how the admin reaches the web panel. */
export function deleteCopy(username: string, source: string): DeleteCopy {
  if (source === "reseller") {
    return {
      title: "حذف ادمین + نماینده",
      text: `ادمین پاسارگارد «${username}» و نمایندگی/ربات فروشگاه متصل هم حذف شوند؟ این عمل برگشت‌ناپذیر است. علت برای شخص حذف‌شده ارسال می‌شود.`,
      confirmLabel: "حذف",
    };
  }
  if (source === "pg_staff") {
    return { title: "حذف ادمین پاسارگارد", text: `ادمین پاسارگارد «${username}» و دسترسی وب ادمین فرعی حذف شوند؟`, confirmLabel: "حذف" };
  }
  return { title: "تأیید حذف", text: `ادمین پاسارگارد «${username}» حذف شود؟`, confirmLabel: "حذف" };
}
