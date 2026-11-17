"use client";

/** A group-based settings form (one tab): its fields, the save bar, «back to defaults» and the optional Telegram chat preview. */

import { useState, type FormEvent, type ReactNode } from "react";

import { run, usePending } from "../core/actions";
import { type FieldEnv } from "./FieldView";
import { GroupSections, ResetButton, SaveBar } from "./GroupSections";
import { fieldsOf, formFields } from "./logic";
import { buildChatPreview } from "./previewLogic";
import { ChatPreviewCard, PREVIEW_LAYOUT } from "./TelegramPreview";
import type { GuidesExtra, SettingGroup, StyleOption } from "./types";
import { useFilePreview } from "./useFilePreview";
import { useSettingsForm, type FormModel } from "./useSettingsForm";

const DEFAULT_SUBMIT = "ذخیره تنظیمات";
const SAVED_MESSAGE = "ذخیره شد.";
const QR_BACKGROUND_KEY = "qr_background";

export type SettingsFormProps = {
  /** The tab, which decides what the chat preview shows. */
  tab: string;
  groups: SettingGroup[];
  /** The existing handler this form posts (e.g. `/settings?tab=welcome`). */
  action: string;
  reload: () => void;
  /** Saved values of settings that are not fields of this tab; the preview reads them. */
  saved?: Record<string, string>;
  guides?: GuidesExtra;
  styleOptions?: StyleOption[];
  submitLabel?: string;
  /** «Back to defaults» for the tabs that have it. */
  reset?: { enabled: boolean; confirm: string };
  /** The live Telegram chat preview beside the form. */
  chatPreview?: boolean;
  /** False when the page does not know the bot's menu order (see `buildChatPreview`). */
  menuKnown?: boolean;
  /** Extra content above the groups, inside the same form. */
  before?: ReactNode | ((form: FormModel) => ReactNode);
};

/** The picture the QR card shows: the one being chosen, none after a removal, else the saved one. */
function useQrBackground(groups: SettingGroup[], saved: Record<string, string>, form: FormModel): string {
  const picked = useFilePreview(form.images.files[QR_BACKGROUND_KEY]);
  if (form.images.cleared[QR_BACKGROUND_KEY]) return "";
  const field = fieldsOf(groups).find((item) => item.key === QR_BACKGROUND_KEY);
  const stored = saved[QR_BACKGROUND_KEY] ?? "";
  return picked || field?.image_url || (stored ? `/media/${stored.replace(/^\/+/, "")}` : "");
}

export function SettingsForm({ tab, groups, action, reload, saved, guides, styleOptions, submitLabel = DEFAULT_SUBMIT, reset, chatPreview = false, menuKnown = true, before }: SettingsFormProps) {
  const savedValues = saved ?? {};
  const form = useSettingsForm(groups, savedValues);
  const [focus, setFocus] = useState("");
  const { pending, track } = usePending();
  const env: FieldEnv = { form, guides, styleOptions, onFocus: setFocus };
  const qrBackground = useQrBackground(groups, savedValues, form);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    void track(async () => {
      const result = await run(action, formFields(groups, form.state, form.images), { success: SAVED_MESSAGE });
      // A refused save keeps the edits on screen; an accepted or lost reply shows what the server holds.
      if (!result || result.ok) reload();
    });
  };

  const model = chatPreview ? buildChatPreview({ tab, read: form.read, menuKnown, focus, menuOrder: "", offMetrics: [] }) : null;
  return (
    <div className={model ? PREVIEW_LAYOUT : ""}>
      <form onSubmit={submit} className="flex min-w-0 flex-col gap-6">
        {typeof before === "function" ? before(form) : before}
        <GroupSections groups={groups} env={env} />
        <SaveBar label={submitLabel} pending={pending}>
          {form.dirty ? <span className="text-xs text-muted">تغییر ذخیره‌نشده</span> : null}
        </SaveBar>
        {reset?.enabled ? (
          <div>
            <ResetButton path={action} confirmText={reset.confirm} refresh={reload} />
          </div>
        ) : null}
      </form>
      {model ? <ChatPreviewCard model={model} compact={form.read("menu_layout", "compact") === "compact"} qrBackground={qrBackground} /> : null}
    </div>
  );
}
