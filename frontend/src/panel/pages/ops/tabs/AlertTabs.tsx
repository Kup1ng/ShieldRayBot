"use client";

/** «هویت ربات», «هشدارها» and «گزارش روزانه»: settings forms with more than plain fields. */

import { Button } from "@heroui/react";
import { useMemo, useRef, useState } from "react";

import { Icon } from "@/icons/Icon";

import { run, usePending } from "../../../core/actions";
import { confirm } from "../../../core/confirm";
import { Ltr, StatusChip } from "../../../ui/Data";
import { SubmitButton, SwitchInput, TextAreaInput, TextInput } from "../../../ui/Fields";
import { GlassSection } from "../../../ui/Page";
import { Notice } from "../../../ui/States";
import { DailyReportForm } from "../../../settings-ui/DailyReportForm";
import { ProfilePreviewCard, PREVIEW_LAYOUT } from "../../../settings-ui/TelegramPreview";
import { useFilePreview } from "../../../settings-ui/useFilePreview";
import { sectionsToGroups } from "../settings/adapter";
import { ShopSettingsForm } from "../settings/ShopSettingsForm";
import type { AppearanceExtra, DailyReportExtra, NotificationsExtra } from "../types";
import type { TabProps } from "./ConnectTabs";

const NAME_MAX = 64;
const SHORT_MAX = 120;
const DESCRIPTION_MAX = 512;

export function AppearanceTab({ data, reload }: TabProps) {
  const extra = data.extra as AppearanceExtra;
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(extra.name);
  const [shortText, setShortText] = useState(extra.short_description);
  const [description, setDescription] = useState(extra.description);
  const [file, setFile] = useState<File | null>(null);
  const [clear, setClear] = useState(false);
  const [error, setError] = useState("");
  const { pending, track } = usePending();
  const pickedPhoto = useFilePreview(file ?? undefined);
  const save = () =>
    track(async () => {
      if (!name.trim()) {
        setError("نام نمایشی ربات الزامی است.");
        return;
      }
      setError("");
      const result = await run(
        "/shop-settings?tab=appearance",
        { bot_tg_name: name.trim(), bot_tg_short_description: shortText, bot_tg_description: description, bot_tg_photo: file, bot_tg_photo_clear: clear },
        { success: "ذخیره و در تلگرام اعمال شد." },
      );
      if (!result || result.ok) {
        setFile(null);
        setClear(false);
        reload();
      }
    });
  const removePhoto = async () => {
    if (await confirm("حذف عکس پروفایل", { description: "عکس پروفایل ربات از تلگرام حذف شود؟", confirmLabel: "تأیید", tone: "danger" })) setClear(true);
  };
  return (
    <div className={PREVIEW_LAYOUT}>
      <form
        className="flex min-w-0 flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <GlassSection
          title="هویت در تلگرام"
          description={
            <>
              این مقادیر مستقیم با Bot API روی پروفایل ربات اعمال می‌شوند (<Ltr>setMyName</Ltr>، <Ltr>setMyShortDescription</Ltr>، <Ltr>setMyDescription</Ltr>، <Ltr>setMyProfilePhoto</Ltr>).{" "}
              {extra.bot_username ? <>ربات فعلی: <Ltr>@{extra.bot_username}</Ltr></> : null}
            </>
          }
        >
          {!extra.sync_ok && extra.sync_error ? <Notice title="خواندن از تلگرام ناموفق بود">{extra.sync_error}</Notice> : <Notice tone="success">مقادیر فعلی از تلگرام خوانده شد.</Notice>}
          <TextInput label="نام نمایشی ربات" value={name} onChange={setName} required maxLength={NAME_MAX} help="حداکثر ۶۴ کاراکتر — در هدر چت و پروفایل دیده می‌شود" />
          <TextAreaInput label="کپشن / درباره ربات" value={shortText} onChange={(next) => setShortText(next.slice(0, SHORT_MAX))} rows={3} help="حداکثر ۱۲۰ کاراکتر — متن About در صفحه پروفایل و هنگام اشتراک‌گذاری ربات" />
          <TextAreaInput label="متن وسط صفحه (اولین نمایش)" value={description} onChange={(next) => setDescription(next.slice(0, DESCRIPTION_MAX))} rows={4} help="حداکثر ۵۱۲ کاراکتر — همان متنی که وسط چت خالی قبل از /start دیده می‌شود" />
          <div className="flex flex-col gap-2">
            <strong className="text-sm font-medium text-foreground">عکس پروفایل</strong>
            <input
              ref={input}
              type="file"
              accept=".jpg,.jpeg,image/jpeg"
              className="sr-only"
              aria-label="انتخاب عکس پروفایل"
              onChange={(event) => {
                const picked = event.target.files?.[0];
                event.target.value = "";
                if (picked) {
                  setFile(picked);
                  setClear(false);
                }
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              {extra.photo_url && !clear ? <img src={extra.photo_url} alt="عکس فعلی" className="size-14 rounded-full object-cover" /> : null}
              <Button size="sm" variant="outline" onPress={() => input.current?.click()}>
                <Icon name="solar:upload-linear" size={18} />
                انتخاب عکس پروفایل
              </Button>
              <span className="text-xs text-muted">{file ? file.name : "فایلی انتخاب نشده"}</span>
              {extra.photo_url && !clear && !file ? (
                <Button size="sm" variant="ghost" className="text-danger" onPress={() => void removePhoto()}>
                  حذف فایل آپلودشده
                </Button>
              ) : null}
              {clear ? <span className="text-xs text-muted">عکس با ذخیره حذف می‌شود.</span> : null}
            </div>
            <p className="text-xs text-muted">فقط JPG — از API تلگرام روی پروفایل ربات ست می‌شود</p>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </GlassSection>
        <div className="flex justify-end">
          <SubmitButton pending={pending}>ذخیره و اعمال در تلگرام</SubmitButton>
        </div>
      </form>
      <ProfilePreviewCard model={{ name, username: extra.bot_username, about: shortText, middle: description, photo: file ? pickedPhoto : clear ? "" : extra.photo_url }} />
    </div>
  );
}

export function NotificationsTab({ data, reload }: TabProps) {
  const extra = data.extra as NotificationsExtra;
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() => Object.fromEntries(extra.items.map((item) => [item.key, item.on])));
  const { pending, track } = usePending();
  const save = () =>
    track(async () => {
      const result = await run("/shop-notifications", Object.fromEntries(extra.items.map((item) => [`s_${item.key}`, prefs[item.key]])), { success: "هشدارهای فروشگاه ذخیره شد." });
      if (!result || result.ok) reload();
    });
  return (
    <div className="flex flex-col gap-6">
      {extra.items.length ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <GlassSection title="هشدارهای تلگرام فروشگاه" description="هشدارهای مربوط به فروشگاه شما — مستقل از ادمین اصلی. فقط رویدادهایی که با دسترسی‌های شما هم‌خوان است نمایش داده می‌شود.">
            <div className="flex flex-col gap-4">
              {extra.items.map((item) => (
                <SwitchInput key={item.key} label={item.system ? <>{item.title} <StatusChip color="default">سیستم</StatusChip></> : item.title} help={item.help} checked={prefs[item.key] === true} onChange={(on) => setPrefs((current) => ({ ...current, [item.key]: on }))} />
              ))}
            </div>
          </GlassSection>
          <div className="flex justify-end">
            <SubmitButton pending={pending}>ذخیره هشدارهای فروشگاه</SubmitButton>
          </div>
        </form>
      ) : (
        <GlassSection title="هشدارهای تلگرام فروشگاه">
          <p className="text-sm text-muted">با دسترسی‌های فعلی، اعلان قابل شخصی‌سازی ندارید (سفارش/پرداخت/تیکت).</p>
        </GlassSection>
      )}
      {data.sections.length ? (
        <ShopSettingsForm tab="notifications" sections={data.sections} action="/shop-settings?tab=notifications" reload={reload} submitLabel="ذخیره هشدار کمبود" />
      ) : (
        <GlassSection title="هشدار سرویس کاربر">
          <p className="text-sm text-muted">گروه تنظیمات یافت نشد.</p>
        </GlassSection>
      )}
    </div>
  );
}

/** The report's settings, the stats that go into it, and its text: one form, one save. */
export function DailyReportTab({ data, reload }: TabProps) {
  const groups = useMemo(() => sectionsToGroups(data.sections), [data.sections]);
  const saved = useMemo(() => ({ shop_title: data.shop_title }), [data.shop_title]);
  return <DailyReportForm groups={groups} extra={data.extra as DailyReportExtra} action="/shop-settings?tab=daily_report" reload={reload} saved={saved} />;
}
