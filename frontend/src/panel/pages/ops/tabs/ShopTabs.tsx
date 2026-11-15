"use client";

/** «مینی‌اپ», «منوی بات» and «رنگبندی دکمه‌ها»: tabs with their own forms. */

import { Button } from "@heroui/react";
import { useMemo, useState } from "react";

import { Icon } from "@/icons/Icon";

import { run, usePending } from "../../../core/actions";
import { Ltr } from "../../../ui/Data";
import { SelectInput, SubmitButton, SwitchInput, TextAreaInput } from "../../../ui/Fields";
import { GlassSection } from "../../../ui/Page";
import { Notice } from "../../../ui/States";
import { MenuOrderEditor, type MenuLists } from "../../../settings-ui/MenuOrderEditor";
import { menuLabelsPreview } from "../../../settings-ui/previewLogic";
import { ChatPreviewCard, PREVIEW_LAYOUT } from "../../../settings-ui/TelegramPreview";
import type { ColorsExtra, MenuExtra, MiniappExtra, StyleOption } from "../types";
import type { TabProps } from "./ConnectTabs";

const NOTICE_MAX = 200;
const DEFAULT_ACCENT_LABEL = "پیش‌فرض";
const LAYOUTS = [
  { id: "classic", label: "کلاسیک (تکی — هر دکمه یک ردیف)" },
  { id: "compact", label: "فشرده (جفتی — پیشنهادی)" },
];

function AccentPicker({ presets, value, onChange }: { presets: MiniappExtra["presets"]; value: string; onChange: (value: string) => void }) {
  const options = [{ value: "", label: DEFAULT_ACCENT_LABEL }, ...presets];
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-foreground">رنگ برند مینی‌اپ</legend>
      <div role="radiogroup" aria-label="رنگ برند مینی‌اپ" className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value || "default"}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus ${selected ? "border-accent bg-accent-soft text-foreground" : "border-border text-foreground/80 hover:bg-surface-secondary"}`}
            >
              <span aria-hidden className="size-4 rounded-full border border-border bg-accent" style={option.value ? { backgroundColor: option.value } : undefined} />
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted">پیش‌نمایش: کارت کیف پول، دکمه‌ها و میانبر اصلی با این رنگ نمایش داده می‌شوند.</p>
    </fieldset>
  );
}

export function MiniappTab({ data, reload }: TabProps) {
  const extra = data.extra as MiniappExtra;
  const [enabled, setEnabled] = useState(extra.on);
  const [accent, setAccent] = useState(extra.accent);
  const [notice, setNotice] = useState(extra.notice);
  const switchState = usePending();
  const brandState = usePending();
  const saveSwitch = () =>
    switchState.track(async () => {
      const result = await run("/shop-settings/miniapp", { miniapp_shop_enabled: enabled }, { success: "ذخیره شد." });
      if (!result || result.ok) reload();
    });
  const saveBrand = () =>
    brandState.track(async () => {
      const result = await run("/shop-settings/miniapp-brand", { miniapp_accent_color: accent, miniapp_notice: notice }, { success: "تنظیمات مینی‌اپ ذخیره شد." });
      if (!result || result.ok) reload();
    });
  return (
    <div className="flex flex-col gap-4">
      <GlassSection title="مینی‌اپ برای مشتریان">
        {extra.available ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveSwitch();
            }}
          >
            <p className="text-sm leading-7 text-muted">
              با روشن شدن، دکمهٔ «Open» کنار کادر پیام ربات شما مینی‌اپ فروشگاه خودتان را باز می‌کند. مشتریان فقط سرویس‌ها، پلن‌ها، کیف پول و آموزش‌های همین فروشگاه را می‌بینند و با کیف پول همین فروشگاه خرید، تمدید و افزایش حجم یا زمان انجام می‌دهند. شارژ کیف پول، کد تخفیف، پشتیبانی و باشگاه فعلاً از خود ربات انجام می‌شود.
            </p>
            <SwitchInput label="مینی‌اپ فروشگاه" help={extra.on && extra.url ? <>آدرس: <Ltr>{extra.url}</Ltr></> : undefined} checked={enabled} onChange={setEnabled} />
            <div className="flex justify-end">
              <SubmitButton pending={switchState.pending}>ذخیره</SubmitButton>
            </div>
          </form>
        ) : (
          <Notice title="مینی‌اپ فعال نیست">{extra.blocker || "مینی‌اپ برای فروشگاه شما فعال نشده است. برای فعال شدن با مدیریت هماهنگ کنید."}</Notice>
        )}
      </GlassSection>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void saveBrand();
        }}
      >
        <GlassSection title="ظاهر مینی‌اپ" description="نام، کپشن و عکس پروفایل ربات (تب «هویت ربات») نام، شعار و لوگوی فروشگاه در مینی‌اپ هستند. اینجا رنگ اصلی و اطلاعیهٔ صفحهٔ خانه را تعیین می‌کنید.">
          <AccentPicker presets={extra.presets} value={accent} onChange={setAccent} />
          <TextAreaInput label="اطلاعیهٔ صفحهٔ خانه" value={notice} onChange={(next) => setNotice(next.slice(0, NOTICE_MAX))} rows={2} help="حداکثر ۲۰۰ کاراکتر، یک خط — مثلاً تخفیف یا خبر فروشگاه. خالی = بدون اطلاعیه." />
        </GlassSection>
        <div className="flex justify-end">
          <SubmitButton pending={brandState.pending}>ذخیرهٔ تنظیمات مینی‌اپ</SubmitButton>
        </div>
      </form>
    </div>
  );
}

export function MenuTab({ data, reload }: TabProps) {
  const extra = data.extra as MenuExtra;
  const [lists, setLists] = useState<MenuLists>({ active: extra.items, pool: extra.pool });
  const [layout, setLayout] = useState(extra.layout === "classic" ? "classic" : "compact");
  const [cleanup, setCleanup] = useState(extra.cleanup);
  const { pending, track } = usePending();
  const save = () =>
    track(async () => {
      const result = await run(
        "/shop-settings/menu-layout",
        {
          menu_order: lists.active.map((item) => item.key).join(","),
          menu_layout: layout,
          chat_cleanup_enabled: cleanup.chat_cleanup,
          menu_keyboard_persistent: cleanup.persistent_menu,
          show_restart_button: cleanup.restart_button,
        },
        { success: "منو ذخیره شد." },
      );
      if (!result || result.ok) reload();
    });
  const restore = async () => {
    const result = await run("/shop-settings?tab=menu", { reset_defaults: "1" }, { ask: { title: "بازگردانی به پیش‌فرض", text: data.reset.confirm, confirmLabel: "بازگردانی", tone: "danger" }, success: "چیدمان منو به پیش‌فرض برگشت." });
    if (result?.ok) reload();
  };
  return (
    <div className={PREVIEW_LAYOUT}>
      <form
        className="flex min-w-0 flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <GlassSection title="چیدمان و دکمه‌های کیبورد ربات" description="اینجا منوی ربات فروشگاه خودتان را کامل کنترل می‌کنید: حالت جفتی/تکی، افزودن/حذف دکمه‌ها و ترتیب نمایش. تغییرات فقط روی ربات شما اعمال می‌شود و روی ربات ادمین اصلی اثر ندارد.">
          <SelectInput label="حالت چیدمان کیبورد" value={layout} onChange={setLayout} options={LAYOUTS} />
          <SwitchInput
            label="پاک‌سازی خودکار صفحهٔ ربات"
            help="با باز شدن هر منوی تازه، منوهای قبلی و دکمه‌هایی که کاربر از کیبورد زده پاک می‌شوند تا صفحه شلوغ نشود. پیام‌های تحویل سرویس، لینک و کانفیگ، رسید پرداخت، پاسخ تیکت و اطلاعیه‌ها هیچ‌وقت پاک نمی‌شوند. تلگرام فقط پیام‌های کمتر از ۴۸ ساعت را پاک می‌کند."
            checked={cleanup.chat_cleanup}
            onChange={(chat_cleanup) => setCleanup({ ...cleanup, chat_cleanup })}
          />
          <SwitchInput
            label="کیبورد همیشه باز"
            help="بعد از تایپ و بستن کیبورد گوشی، منوی ربات خودش دوباره ظاهر می‌شود و لازم نیست آیکون چهارمربع را بزنید. روی چند نسخهٔ اندروید ممکن است دکمهٔ برگشت گوشی از گفتگو خارج نشود؛ بعد از روشن کردن روی یک گوشی اندروید امتحان کنید. تغییر با «شروع مجدد» یا بازگشت به منوی اصلی اعمال می‌شود."
            checked={cleanup.persistent_menu}
            onChange={(persistent_menu) => setCleanup({ ...cleanup, persistent_menu })}
          />
          <SwitchInput
            label="نمایش دکمه شروع مجدد"
            help="روشن = زیر کیبورد اصلی ربات برای همه یک ردیف «شروع مجدد» نمایش داده می‌شود که منو را از نو می‌سازد. متن دکمه در تب «متن دکمه‌ها» تنظیم می‌شود. تغییر با «شروع مجدد» یا /start اعمال می‌شود."
            checked={cleanup.restart_button}
            onChange={(restart_button) => setCleanup({ ...cleanup, restart_button })}
          />
        </GlassSection>
        <MenuOrderEditor value={lists} onChange={setLists} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onPress={() => void restore()}>
            <Icon name="solar:restart-linear" size={18} />
            بازگردانی همه به پیش‌فرض
          </Button>
          <SubmitButton pending={pending}>ذخیره منو</SubmitButton>
        </div>
      </form>
      <ChatPreviewCard model={menuLabelsPreview(data.shop_title, lists.active)} compact={layout !== "classic"} />
    </div>
  );
}

function ColorSelect({ label, value, options, onChange }: { label: string; value: string; options: StyleOption[]; onChange: (value: string) => void }) {
  return <SelectInput label={label} value={value} onChange={onChange} options={options.map((o) => ({ id: o.value, label: o.label }))} />;
}

export function ColorsTab({ data, reload }: TabProps) {
  const extra = data.extra as ColorsExtra;
  const initial = useMemo(() => Object.fromEntries(extra.groups.flatMap((group) => group.items.map((item) => [item.key, item.value]))), [extra.groups]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const { pending, track } = usePending();
  const save = () =>
    track(async () => {
      const result = await run("/shop-settings?tab=colors", Object.fromEntries(Object.entries(values).map(([key, value]) => [`s_${key}`, value])), { success: "رنگبندی ذخیره شد." });
      if (!result || result.ok) reload();
    });
  const restore = async () => {
    const result = await run("/shop-settings?tab=colors", { reset_defaults: "1" }, { ask: { title: "بازگردانی به پیش‌فرض", text: data.reset.confirm, confirmLabel: "بازگردانی", tone: "danger" }, success: "به پیش‌فرض برگشت." });
    if (result?.ok) reload();
  };
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <GlassSection title="رنگبندی دکمه‌ها" description="تلگرام فقط سفید، آبی، سبز و قرمز را پشتیبانی می‌کند. رنگ دکمه‌های ثابت را اینجا تنظیم کنید؛ رنگ پلن‌ها، پشتیبان‌ها و مقاصد پرداخت در همان بخش مربوطه (ساخت/ویرایش) تعیین می‌شود.">
        <p className="text-xs text-muted">
          {extra.label}: {extra.caption}
        </p>
      </GlassSection>
      {extra.groups.map((group, index) => (
        <details key={group.name} open={index === 0} className="glass group rounded-xl p-5 md:p-6">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-base font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus">
            {group.name}
            <Icon name="solar:alt-arrow-down-linear" size={20} className="text-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((item) => (
              <ColorSelect key={item.key} label={item.label} value={values[item.key] ?? ""} options={data.style_options} onChange={(value) => setValues((current) => ({ ...current, [item.key]: value }))} />
            ))}
          </div>
        </details>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onPress={() => void restore()}>
          <Icon name="solar:restart-linear" size={18} />
          بازگردانی همه به پیش‌فرض
        </Button>
        <SubmitButton pending={pending}>ذخیره رنگبندی</SubmitButton>
      </div>
    </form>
  );
}
