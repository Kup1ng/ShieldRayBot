"use client";

import { useState, type FormEvent } from "react";

import { run, usePending } from "../../core/actions";
import { GlassSection } from "../../ui/Page";
import { SelectInput, SwitchInput } from "../../ui/Fields";
import { ResetButton, SaveBar } from "../../settings-ui/GroupSections";
import { MenuOrderEditor, type MenuLists } from "../../settings-ui/MenuOrderEditor";
import { buildChatPreview } from "../../settings-ui/previewLogic";
import { ChatPreviewCard, PREVIEW_LAYOUT } from "../../settings-ui/TelegramPreview";
import type { TabProps } from "./GenericTab";
import type { MenuExtra } from "./types";

const PATH = "/settings?tab=menu";
const SWITCH_TEXT: Record<string, { title: string; help: string }> = {
  chat_cleanup_enabled: {
    title: "پاک‌سازی خودکار صفحهٔ ربات",
    help: "با باز شدن هر منوی تازه، منوهای قبلی و دکمه‌هایی که کاربر از کیبورد زده پاک می‌شوند تا صفحه شلوغ نشود. پیام‌های تحویل سرویس، لینک و کانفیگ، رسید پرداخت، پاسخ تیکت و اطلاعیه‌ها هیچ‌وقت پاک نمی‌شوند. تلگرام فقط پیام‌های کمتر از ۴۸ ساعت را پاک می‌کند.",
  },
  menu_keyboard_persistent: {
    title: "کیبورد همیشه باز",
    help: "بعد از تایپ و بستن کیبورد گوشی، منوی ربات خودش دوباره ظاهر می‌شود و لازم نیست آیکون چهارمربع را بزنید. روی چند نسخهٔ اندروید ممکن است دکمهٔ برگشت گوشی از گفتگو خارج نشود؛ بعد از روشن کردن روی یک گوشی اندروید امتحان کنید. تغییر با «شروع مجدد» یا بازگشت به منوی اصلی اعمال می‌شود.",
  },
  show_restart_button: {
    title: "نمایش دکمه شروع مجدد",
    help: "روشن = زیر کیبورد اصلی ربات برای همه یک ردیف «شروع مجدد» نمایش داده می‌شود که منو را از نو می‌سازد. متن دکمه در تب «متن دکمه‌ها» تنظیم می‌شود. تغییر با «شروع مجدد» یا /start اعمال می‌شود.",
  },
};

/** The bottom keyboard of the bot: which shortcuts, in what order and layout, plus its three switches. */
export function MenuTab({ data, reload }: TabProps<MenuExtra>) {
  const extra = data.extra as MenuExtra;
  const [lists, setLists] = useState<MenuLists>({ active: extra.items, pool: extra.pool });
  const [layout, setLayout] = useState<string>(extra.layout);
  const [switches, setSwitches] = useState<Record<string, boolean>>(() => Object.fromEntries(extra.switches.map((item) => [item.key, item.on])));
  const { pending, track } = usePending();
  const order = lists.active.map((item) => item.key).join(",");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    void track(async () => {
      const fields: Record<string, string> = { menu_order: order, menu_layout: layout, menu_layout_save: "1" };
      for (const [key, on] of Object.entries(switches)) if (on) fields[key] = "1";
      const result = await run(PATH, fields, { success: "ذخیره شد." });
      if (!result || result.ok) reload();
    });
  };

  const saved = data.preview_values ?? {};
  const read = (name: string, fallback = "") => saved[name] || fallback;
  const model = buildChatPreview({ tab: "menu", read, focus: "", menuOrder: order, offMetrics: [] });

  return (
    <div className={PREVIEW_LAYOUT}>
      <form onSubmit={submit} className="flex min-w-0 flex-col gap-6">
        <GlassSection
          title="چیدمان دکمه‌های کیبورد"
          description="کیبورد پایین فقط میانبرهای اصلی است (فروشگاه، کیف، پشتیبانی، …؛ برای ادمین + «پنل ادمین»). همهٔ زیرمنوها روی یک پیام پنل اینلاین با ویرایش همان پیام‌اند — با دکمهٔ بازگشت در هر مرحله. «درخواست نمایندگی» در پشتیبانی/خوش‌آمد است. مینی‌اپ فقط از دکمهٔ Open کنار کادر پیام (وقتی HTTPS فعال باشد) — نه کیبورد پایین و نه اینلاین خوش‌آمد. «آموزش‌ها» روی کارت سرویس کاربر است (نه کیبورد اصلی) — متن/رنگ در تنظیمات آموزش اتصال. آیتم‌های «منوی فعال» فقط ترتیب کیبورد پایین‌اند؛ متن واقعی دکمه‌ها در بخش «متن دکمه‌های منو» تنظیم می‌شود."
        >
          <SelectInput label="حالت چیدمان کیبورد" value={layout} onChange={setLayout} options={extra.layouts.map((item) => ({ id: item.value, label: item.label }))} />
          <div className="flex flex-col gap-4">
            {extra.switches.map((item) => (
              <SwitchInput key={item.key} label={SWITCH_TEXT[item.key]?.title ?? item.key} help={SWITCH_TEXT[item.key]?.help} checked={Boolean(switches[item.key])} onChange={(on) => setSwitches((prev) => ({ ...prev, [item.key]: on }))} />
            ))}
          </div>
        </GlassSection>
        <MenuOrderEditor value={lists} onChange={setLists} />
        <SaveBar label="ذخیره منو" pending={pending} />
        <div>
          <ResetButton path={PATH} confirmText={data.reset_confirm ?? ""} refresh={reload} />
        </div>
      </form>
      <ChatPreviewCard model={model} compact={layout === "compact"} />
    </div>
  );
}
