"use client";

/** The daily admin report: when it is sent, which statistics it carries and its text, with the live Telegram preview. */

import { useState, type FormEvent } from "react";

import { run, usePending } from "../core/actions";
import { Ltr } from "../ui/Data";
import { SwitchInput } from "../ui/Fields";
import { GlassSection } from "../ui/Page";
import { SettingFieldView, type FieldEnv } from "./FieldView";
import { SaveBar } from "./GroupSections";
import { fieldsOf, formFields } from "./logic";
import { buildChatPreview } from "./previewLogic";
import { ChatPreviewCard, PREVIEW_LAYOUT } from "./TelegramPreview";
import type { DailyReportMetrics, SettingGroup } from "./types";
import { useSettingsForm } from "./useSettingsForm";

const TEMPLATE_KEY = "admin_daily_report_template";
const SAVED_MESSAGE = "ذخیره شد.";

type Props = {
  groups: SettingGroup[];
  extra: DailyReportMetrics;
  /** The existing handler this form posts (e.g. `/settings?tab=daily_report`). */
  action: string;
  reload: () => void;
  saved?: Record<string, string>;
  /** A sentence appended to the statistics description (the Owner's differs from a shop's). */
  metricsNote?: string;
};

export function DailyReportForm({ groups, extra, action, reload, saved, metricsNote }: Props) {
  const form = useSettingsForm(groups, saved);
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(extra.enabled_metrics));
  const [focus, setFocus] = useState("");
  const { pending, track } = usePending();
  const env: FieldEnv = { form, onFocus: setFocus };
  const offMetrics = extra.metric_groups.flatMap((group) => group.metrics).filter((metric) => !enabled.has(metric.key)).map((metric) => metric.key);

  const toggle = (key: string, on: boolean) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    void track(async () => {
      const fields: Record<string, string | File> = { ...formFields(groups, form.state, form.images) };
      for (const key of enabled) fields[`m_${key}`] = "1";
      const result = await run(action, fields, { success: SAVED_MESSAGE });
      if (!result || result.ok) reload();
    });
  };

  const model = buildChatPreview({ tab: "daily_report", read: form.read, focus, menuOrder: "", offMetrics });
  const fields = fieldsOf(groups);
  const sendFields = fields.filter((field) => field.key !== TEMPLATE_KEY);
  const template = fields.find((field) => field.key === TEMPLATE_KEY);

  return (
    <div className={PREVIEW_LAYOUT}>
      <form onSubmit={submit} className="flex min-w-0 flex-col gap-6">
        <GlassSection title="ارسال گزارش" description="گزارش روزانه فقط آمار همان فروشگاه/نقش شما را می‌فرستد. گزارش نمایندگان فقط زیرمجموعه‌های مستقیم شما را خلاصه می‌کند؛ دادهٔ فروشگاه‌های دیگر نشت نمی‌کند.">
          <div className="grid gap-4 sm:grid-cols-2">
            {sendFields.map((field) => (
              <SettingFieldView key={field.key} field={field} env={env} />
            ))}
          </div>
        </GlassSection>
        <GlassSection title="آمار داخل گزارش" description={`فقط موارد روشن در متن گزارش مقدار می‌گیرند؛ بقیه خالی می‌مانند.${metricsNote ? ` ${metricsNote}` : ""}`}>
          {extra.metric_groups.map((group) => (
            <fieldset key={group.id} className="flex flex-col gap-3">
              <legend className="mb-1 text-sm font-semibold text-foreground">{group.label}</legend>
              {group.metrics.map((metric) => (
                <SwitchInput
                  key={metric.key}
                  label={metric.title_fa}
                  help={
                    <>
                      {metric.description_fa} · <Ltr className="font-mono">{metric.token}</Ltr>
                    </>
                  }
                  checked={enabled.has(metric.key)}
                  onChange={(on) => toggle(metric.key, on)}
                />
              ))}
            </fieldset>
          ))}
        </GlassSection>
        {template ? (
          <GlassSection
            title="متن گزارش"
            description={
              <>
                از متغیرهای <Ltr className="font-mono">{"{users_new}"}</Ltr> و بقیه استفاده کنید. فهرست کامل: <a className="text-accent underline-offset-2 hover:underline" href="/message-variables">متغیرهای پیام</a>.
              </>
            }
          >
            <SettingFieldView field={template} env={env} />
          </GlassSection>
        ) : null}
        <SaveBar label="ذخیره گزارش روزانه" pending={pending} />
      </form>
      <ChatPreviewCard model={model} compact />
    </div>
  );
}
