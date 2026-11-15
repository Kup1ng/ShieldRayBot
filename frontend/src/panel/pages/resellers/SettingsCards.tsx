"use client";

import { Button } from "@heroui/react";
import { useState, type FormEvent } from "react";

import { run, usePending } from "../../core/actions";
import { useJson } from "../../core/data";
import { Ltr, StatusChip } from "../../ui/Data";
import { SwitchInput, TextInput } from "../../ui/Fields";
import { GlassSection } from "../../ui/Page";
import { Loadable } from "../../ui/States";
import { FormActions } from "./Actions";
import type { PanelSettings } from "./types";

const SETTINGS_PATH = "/api/panel/resellers/settings";

function UrlHint({ inUse, custom, fallback }: { inUse: string; custom: boolean; fallback: string }) {
  return (
    <span className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-2">
        در حال استفاده: <Ltr>{inUse || "—"}</Ltr>
        <StatusChip color={custom ? "success" : "warning"}>{custom ? "اختصاصی" : "پیش‌فرض"}</StatusChip>
      </span>
      <span>
        پیش‌فرض: <Ltr>{fallback || "— تنظیم نشده —"}</Ltr>
      </span>
    </span>
  );
}

function UrlsForm({ data, onSaved }: { data: PanelSettings; onSaved: () => void }) {
  const [botUrl, setBotUrl] = useState(data.custom_panel_url);
  const [pgUrl, setPgUrl] = useState(data.custom_pg_panel_url);
  const [showApply, setShowApply] = useState(data.show_reseller_apply);
  const { pending, track } = usePending();

  const save = (fields: { bot: string; pg: string }) =>
    track(async () => {
      const result = await run("/resellers/panel-url", { reseller_panel_base_url: fields.bot, reseller_pg_panel_base_url: fields.pg, show_reseller_apply: showApply }, { success: "تنظیمات نمایندگی ذخیره شد" });
      if (result?.ok) onSaved();
    });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save({ bot: botUrl.trim(), pg: pgUrl.trim() });
  };

  const resetToDefaults = () => {
    setBotUrl("");
    setPgUrl("");
    void save({ bot: "", pg: "" });
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <SwitchInput label="نمایش درخواست نمایندگی" help="دکمه درخواست نمایندگی در منوی کاربران عادی ربات اصلی" checked={showApply} onChange={setShowApply} />
      <TextInput
        label="آدرس وب‌پنل ربات (نماینده)"
        value={botUrl}
        onChange={setBotUrl}
        ltr
        placeholder={data.default_panel_url}
        help={<UrlHint inUse={data.panel_url} custom={Boolean(data.custom_panel_url)} fallback={data.default_panel_url} />}
      />
      <TextInput
        label="آدرس پنل پاسارگارد"
        value={pgUrl}
        onChange={setPgUrl}
        ltr
        placeholder={data.default_pg_panel_url}
        help={<UrlHint inUse={data.pg_panel_url} custom={Boolean(data.custom_pg_panel_url)} fallback={data.default_pg_panel_url} />}
      />
      <div className="flex flex-wrap items-center gap-3">
        <FormActions submitLabel="ذخیره تنظیمات" pending={pending} />
        {data.custom_panel_url || data.custom_pg_panel_url ? (
          <Button type="button" variant="ghost" className="!h-12 !rounded-lg" isDisabled={pending} onPress={resetToDefaults}>
            بازگشت آدرس‌ها به پیش‌فرض
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** The owner's address settings of the approval message and the capacity re-read, as on the old list page. */
export function OwnerCards({ onChanged }: { onChanged: () => void }) {
  const settings = useJson<PanelSettings>(SETTINGS_PATH);
  const { pending, track } = usePending();
  const repair = () =>
    track(async () => {
      await run(
        "/resellers/repair-capacity",
        {},
        {
          ask: {
            title: "همگام‌سازی ظرفیت",
            text: "ظرفیت نمایندگانی که صفر ثبت شده دوباره از پاسارگارد خوانده شود؟ چیزی در پاسارگارد تغییر نمی‌کند.",
            confirmLabel: "همگام‌سازی",
          },
          refresh: onChanged,
        },
      );
    });
  return (
    <div className="mb-6 grid gap-6 lg:grid-cols-2">
      <GlassSection title="تنظیمات نمایندگی" description="آدرس پنل‌ها در پیام تأیید نمایندگی ارسال می‌شوند. اگر خالی بگذارید، پیش‌فرض سیستم استفاده می‌شود. نمایش درخواست نمایندگی فقط در ربات اصلی اثر دارد.">
        <Loadable state={settings} rows={3}>
          {(data) => <UrlsForm key={`${data.custom_panel_url}|${data.custom_pg_panel_url}|${data.show_reseller_apply}`} data={data} onSaved={settings.reload} />}
        </Loadable>
      </GlassSection>
      <GlassSection
        title="همگام‌سازی ظرفیت از پاسارگارد"
        description="نمایندگانی که با پلن «ظرفیت فعلی» اعطا شده‌اند و ظرفیتشان صفر (نامحدود) ثبت شده، دوباره از سقف حجم و کاربر ادمین‌شان در پاسارگارد خوانده می‌شوند. ظرفیتی که قبلاً درست ثبت شده تغییر نمی‌کند و چیزی در پاسارگارد نوشته نمی‌شود."
      >
        <div>
          <Button variant="outline" className="!h-12 !rounded-lg" isPending={pending} onPress={() => void repair()}>
            همگام‌سازی ظرفیت
          </Button>
        </div>
      </GlassSection>
    </div>
  );
}
