"use client";

import { Label, Radio, RadioGroup } from "@heroui/react";
import { useState, type CSSProperties, type FormEvent } from "react";

import { run, usePending } from "../../core/actions";
import { SwitchInput, TextAreaInput } from "../../ui/Fields";
import { Ltr } from "../../ui/Data";
import { GlassSection } from "../../ui/Page";
import { SaveBar } from "../../settings-ui/GroupSections";
import { MainAppGuideCard } from "../../settings-ui/MainAppGuideCard";
import type { TabProps } from "./GenericTab";
import { DEFAULT_ACCENT, inkFor } from "./logic";
import type { MiniappExtra } from "./types";

const PATH = "/settings/miniapp-brand";

function AccentPreview({ colour }: { colour: string }) {
  // The colour is one of the server's presets: it is data, so it can only be applied inline.
  const style = { backgroundColor: colour, color: inkFor(colour) } as CSSProperties;
  return (
    <div aria-hidden="true" className="inset-tile flex flex-wrap items-center gap-3 rounded-lg p-3">
      <span className="flex flex-col rounded-lg px-4 py-2" style={style}>
        <small className="text-xs opacity-80">موجودی کیف پول</small>
        <strong>۲۴۵٬۰۰۰ تومان</strong>
      </span>
      <span className="rounded-lg px-4 py-2 text-sm font-medium" style={style}>
        خرید سرویس
      </span>
      <span className="size-10 rounded-lg opacity-30" style={{ backgroundColor: colour }} />
    </div>
  );
}

/** The Mini App's brand colour and home notice, and the switch that opens it to shops. */
export function MiniappTab({ data, reload }: TabProps<MiniappExtra>) {
  const extra = data.extra as MiniappExtra;
  const [accent, setAccent] = useState(extra.accent);
  const [notice, setNotice] = useState(extra.notice);
  const [shops, setShops] = useState(extra.shops_enabled);
  const { pending, track } = usePending();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    void track(async () => {
      const fields: Record<string, string> = { miniapp_accent_color: accent, miniapp_notice: notice };
      if (shops) fields.miniapp_shops_enabled = "1";
      const result = await run(PATH, fields, { success: "تنظیمات مینی‌اپ ذخیره شد" });
      if (!result || result.ok) reload();
    });
  };

  return (
    <form onSubmit={submit} className="flex min-w-0 flex-col gap-6">
      <MainAppGuideCard guide={extra.main_app} />
      <GlassSection
        title="ظاهر مینی‌اپ"
        description={
          <>
            نام، کپشن و عکس پروفایل ربات (تب <a className="text-accent underline-offset-2 hover:underline" href="/settings?tab=appearance">هویت ربات</a>) نام، شعار و لوگوی فروشگاه در مینی‌اپ هستند. اینجا رنگ اصلی و اطلاعیهٔ صفحهٔ خانه را تعیین می‌کنید.
          </>
        }
      >
        <RadioGroup value={accent} onChange={setAccent} orientation="horizontal" aria-label="رنگ برند مینی‌اپ" className="flex-wrap">
          <Label>رنگ برند</Label>
          <Radio value="">
            <Radio.Content>
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="size-3 rounded-full" style={{ backgroundColor: DEFAULT_ACCENT }} />
                پیش‌فرض (نارنجی)
              </span>
            </Radio.Content>
          </Radio>
          {extra.presets.map((preset) => (
            <Radio key={preset.value} value={preset.value}>
              <Radio.Content>
                <Radio.Control>
                  <Radio.Indicator />
                </Radio.Control>
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className="size-3 rounded-full" style={{ backgroundColor: preset.value }} />
                  {preset.label}
                </span>
              </Radio.Content>
            </Radio>
          ))}
        </RadioGroup>
        <AccentPreview colour={accent || DEFAULT_ACCENT} />
        <p className="text-xs text-muted">پیش‌نمایش: کارت کیف پول، دکمه‌ها و میانبر اصلی با این رنگ نمایش داده می‌شوند.</p>
        <TextAreaInput
          label="اطلاعیهٔ صفحهٔ خانه"
          rows={2}
          value={notice}
          onChange={(value) => setNotice(value.slice(0, extra.notice_max))}
          help={`حداکثر ${extra.notice_max.toLocaleString("fa-IR")} کاراکتر، یک خط — مثلاً تخفیف یا خبر فروشگاه. خالی = بدون اطلاعیه.`}
        />
      </GlassSection>
      <GlassSection title="مینی‌اپ فروشگاه نمایندگان">
        <SwitchInput
          label="مینی‌اپ برای فروشگاه نمایندگان"
          help="روشن = نماینده‌هایی که دسترسی «مینی‌اپ فروشگاه برای مشتریان» در بسته‌شان هست، می‌توانند از تنظیمات ربات خودشان مینی‌اپ فروشگاهشان را روشن کنند. مشتری هر فروشگاه فقط اطلاعات همان فروشگاه را می‌بیند. خاموش کردن، مینی‌اپ همهٔ فروشگاه‌ها را فوراً می‌بندد."
          checked={shops}
          onChange={setShops}
        />
        <p className="text-sm text-muted">
          آدرس مینی‌اپ: {extra.miniapp_url ? <Ltr>{extra.miniapp_url}</Ltr> : "هنوز HTTPS فعال نیست"} — دامنهٔ مینی‌اپ را در{" "}
          <a className="text-accent underline-offset-2 hover:underline" href="/settings?tab=ssl#miniapp-domain">
            تنظیمات وب پنل › دامنه‌ها
          </a>{" "}
          تعیین کنید.
        </p>
      </GlassSection>
      <SaveBar label="ذخیرهٔ تنظیمات مینی‌اپ" pending={pending} />
    </form>
  );
}
