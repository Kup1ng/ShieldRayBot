"use client";

import { useState } from "react";

import { GlassSection } from "../../ui/Page";
import { EntryApprovalRequests } from "../../settings-ui/EntryApprovalRequests";
import { SettingsForm } from "../../settings-ui/SettingsForm";
import type { FormModel } from "../../settings-ui/useSettingsForm";
import { namingSample } from "./logic";
import { ServiceImportPanel } from "./ServiceImportPanel";
import type { GuidesExtra, TabData } from "./types";

export type TabProps<Extra = unknown> = { data: TabData<Extra>; reload: () => void };

const SUBMIT_LABELS: Record<string, string> = {
  limits: "ذخیره محدودیت‌ها",
  guides: "ذخیره آموزش‌ها",
  naming: "ذخیره نام‌گذاری",
  notifications: "ذخیره هشدار کمبود",
};
const CHAT_PREVIEW_TABS = new Set(["welcome", "messages", "buttons", "qr"]);

function randomPart(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function NamingSample({ form }: { form: FormModel }) {
  const [random] = useState(randomPart);
  const sample = namingSample(form.read("pg_username_prefix"), form.read("pg_username_suffix"), form.read("pg_username_pattern"), random);
  return (
    <GlassSection
      title="نام‌گذاری سرویس در پاسارگارد"
      description="پیش‌فرض سراسری وقتی کاربر سرویس می‌خرد — اگر برای یک پلن (ثابت / تست / دلخواه) نام‌گذاری جدا تعریف شده باشد، همان اولویت دارد. بخش {random} یک کد تصادفی ۸ حرفی است تا نام تکراری نشود. {plan_volume} حجم بدون واحد، {plan_unit} واحد GB و {username} یوزرنیم تلگرام بدون @ است."
    >
      <p className="text-sm">
        نمونه نام:{" "}
        <strong dir="ltr" className="num font-mono">
          {sample}
        </strong>
      </p>
    </GlassSection>
  );
}

/** Owner adapter: the tabs that are plain groups of fields (welcome, messages, buttons, screens, qr, naming, limits with the entry requests, guides, service import). */
export function GenericTab({ data, reload }: TabProps) {
  const tab = data.tab;
  return (
    <SettingsForm
      tab={tab}
      groups={data.groups ?? []}
      action={`/settings?tab=${tab}`}
      reload={reload}
      saved={data.preview_values}
      guides={tab === "guides" ? (data.extra as GuidesExtra) : undefined}
      submitLabel={SUBMIT_LABELS[tab]}
      reset={data.can_reset ? { enabled: true, confirm: data.reset_confirm ?? "" } : undefined}
      chatPreview={CHAT_PREVIEW_TABS.has(tab)}
      before={(form) => (
        <>
          {tab === "service_import" ? <ServiceImportPanel /> : null}
          {tab === "naming" ? <NamingSample form={form} /> : null}
          {tab === "limits" ? <EntryApprovalRequests /> : null}
        </>
      )}
    />
  );
}
