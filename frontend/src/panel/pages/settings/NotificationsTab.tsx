"use client";

import { useState, type FormEvent } from "react";

import { run, usePending } from "../../core/actions";
import { SwitchInput } from "../../ui/Fields";
import { GlassSection } from "../../ui/Page";
import { SaveBar } from "../../settings-ui/GroupSections";
import { GenericTab, type TabProps } from "./GenericTab";
import type { NotificationsExtra } from "./types";

const PATH = "/notifications";

/** Which events the main admin hears about in Telegram; saved by its own handler, apart from the alert settings below. */
function AdminNotifyForm({ items, reload }: { items: NotificationsExtra["items"]; reload: () => void }) {
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(items.map((item) => [item.key, item.on])));
  const { pending, track } = usePending();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    void track(async () => {
      const fields: Record<string, string> = {};
      for (const [key, value] of Object.entries(on)) if (value) fields[`s_${key}`] = "1";
      const result = await run(PATH, fields, { success: "ذخیره شد." });
      if (!result || result.ok) reload();
    });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <GlassSection title="نوتیفیکیشن ادمین اصلی" description="برای کدام رویدادها در تلگرام پیام بگیرید. این تنظیمات فقط برای ادمین اصلی است و روی نمایندگان اثر ندارد.">
        <div className="flex flex-col gap-4">
          {items.map((item) => (
            <SwitchInput key={item.key} label={item.title} help={item.help} checked={Boolean(on[item.key])} onChange={(value) => setOn((prev) => ({ ...prev, [item.key]: value }))} />
          ))}
        </div>
      </GlassSection>
      <SaveBar label="ذخیره نوتیفیکیشن‌های ادمین" pending={pending} />
    </form>
  );
}

/** Admin notification switches, then the customer low-usage alert settings (a plain settings form). */
export function NotificationsTab({ data, reload }: TabProps<NotificationsExtra>) {
  const extra = data.extra as NotificationsExtra;
  return (
    <div className="flex flex-col gap-10">
      <AdminNotifyForm items={extra.items} reload={reload} />
      <GenericTab data={data} reload={reload} />
    </div>
  );
}
