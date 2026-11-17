/** What the edit form posts to /resellers/{id}/edit, with the exact field names of the old form. */

import { formatIdList } from "./idList";

export type EditFormState = {
  billingMode: string;
  confirmBillingChange: boolean;
  pgAdminUsername: string;
  pgRoleId: string;
  perms: string[];
  webPassword: string;
  pgApiKey: string;
  clearPgApiKey: boolean;
  botAdminIds: string[];
  isActive: boolean;
  sharePgPanelUrl: boolean;
  allowVolumeOversell: boolean;
};

/** Which optional parts of the form the screen showed (a hidden field is never posted). */
export type EditFormShown = { oversellSwitch: boolean };

export type EditFields = Record<string, string | boolean>;

export function buildEditFields(form: EditFormState, shown: EditFormShown): EditFields {
  const fields: EditFields = {
    billing_mode: form.billingMode,
    confirm_billing_mode_change: form.confirmBillingChange,
    pg_admin_username: form.pgAdminUsername.trim(),
    pg_role_id: form.pgRoleId,
    bot_admin_ids: formatIdList(form.botAdminIds),
    is_active: form.isActive,
    share_pg_panel_url: form.sharePgPanelUrl,
  };
  for (const key of form.perms) fields[`perm_${key}`] = true;
  // An empty password keeps the current one; an empty key is not posted at all.
  if (form.webPassword.trim()) fields.web_password = form.webPassword.trim();
  if (form.pgApiKey.trim()) fields.pg_api_key = form.pgApiKey.trim();
  if (form.clearPgApiKey) fields.clear_pg_api_key = true;
  // An unchecked switch is not posted; the marker tells the server the switch was on the form.
  if (shown.oversellSwitch) {
    fields.volume_oversell_shown = true;
    fields.allow_volume_oversell = form.allowVolumeOversell;
  }
  return fields;
}

/** After a handler answered: stay on this edit page, or follow its redirect to the list. */
export function nextStep(location: string | undefined, shopId: number): "stay" | "leave" {
  if (!location || !location.startsWith("/resellers") || location.startsWith("//")) return "stay";
  const query = new URLSearchParams(location.split("?")[1] ?? "");
  return query.get("edit") === String(shopId) ? "stay" : "leave";
}
