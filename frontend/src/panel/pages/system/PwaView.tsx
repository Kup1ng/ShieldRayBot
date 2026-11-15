"use client";

import { Button, toast } from "@heroui/react";
import { useState } from "react";

import { run, usePending } from "../../core/actions";
import { useJson } from "../../core/data";
import { FormGrid, SubmitButton, TextInput } from "../../ui/Fields";
import { Ltr } from "../../ui/Data";
import { GlassSection } from "../../ui/Page";
import { Loadable } from "../../ui/States";
import { BrandCard } from "./BrandCard";
import { FilePicker } from "./FilePicker";
import type { PwaPayload } from "./types";

const SAVE_URL = "/settings?tab=pwa";
const ICON_ACCEPT = "image/png,image/jpeg,.png,.jpg,.jpeg";
const ICON_MAX_BYTES = 2_500_000;
const ICON_TOO_LARGE = "حجم آیکن حداکثر ۲٫۵ مگابایت باشد.";
const INSTALL_STEPS = [
  "با آدرس HTTPS دامنه وارد پنل شوید (روی HTTP معمولی مرورگرها نصب را پیشنهاد نمی‌کنند).",
  "در کروم/اج: منوی ⋮ ← «Install app» / «نصب برنامه».",
  "در سافاری آیفون: Share ← Add to Home Screen.",
];

function PwaForm({ pwa, onSaved }: { pwa: PwaPayload["pwa"]; onSaved: () => void }) {
  const [name, setName] = useState(pwa.name_raw);
  const [shortName, setShortName] = useState(pwa.short_name_raw);
  const [description, setDescription] = useState(pwa.description_raw);
  const [icon, setIcon] = useState<File | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const { pending, track } = usePending();

  const fields = () => ({ pwa_name: name, pwa_short_name: shortName, pwa_description: description });

  const save = () =>
    track(async () => {
      if (icon && icon.size > ICON_MAX_BYTES) {
        toast.danger(ICON_TOO_LARGE);
        return;
      }
      const result = await run(SAVE_URL, { ...fields(), ...(icon ? { pwa_icon: icon } : {}) }, { success: "تنظیمات وب‌اپ ذخیره شد", refresh: onSaved });
      if (result?.ok) {
        setIcon(null);
        setPickerKey((n) => n + 1);
      }
    });

  const clearIcon = () =>
    track(async () => {
      await run(
        SAVE_URL,
        { ...fields(), pwa_icon_clear: true },
        { ask: { title: "آیکن سفارشی حذف شود و لوگوی پنل برگردد؟", confirmLabel: "تأیید", tone: "danger" }, success: "آیکن سفارشی حذف شد", refresh: onSaved },
      );
    });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <FormGrid>
        <TextInput className="sm:col-span-2" label="نام وب‌اپ" value={name} onChange={setName} maxLength={80} placeholder="مثلاً فروشگاه من" help="روی صفحه نصب و زیر آیکن دیده می‌شود — خالی = برند پنل" />
        <TextInput label="نام کوتاه" value={shortName} onChange={setShortName} maxLength={40} placeholder="مثلاً فروشگاه" help="حداکثر ۴۰ کاراکتر — خالی = همان نام بالا" />
        <TextInput label="توضیح کوتاه" value={description} onChange={setDescription} maxLength={160} placeholder="مثلاً پنل مدیریت فروشگاه" help="اختیاری" />
      </FormGrid>
      <div className="flex flex-wrap items-start gap-4">
        <img src={pwa.icon_preview} alt="آیکن فعلی وب‌اپ" width={64} height={64} className="size-16 shrink-0 rounded-[18px] bg-surface object-cover" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <FilePicker key={pickerKey} label="آیکن وب‌اپ" accept={ICON_ACCEPT} file={icon} onFile={setIcon} help="PNG یا JPG مربعی، حداکثر ۲٫۵ مگابایت. خالی = لوگوی پنل" />
          {pwa.has_custom_icon ? (
            <div>
              <Button variant="danger-soft" size="sm" onPress={() => void clearIcon()} isDisabled={pending}>
                حذف فایل آپلودشده
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted">در حال استفاده از لوگوی پیش‌فرض پنل</p>
          )}
        </div>
      </div>
      <div className="flex justify-end">
        <SubmitButton pending={pending}>ذخیره وب‌اپ</SubmitButton>
      </div>
    </form>
  );
}

/** «وب‌اپ»: the panel's own brand, the installable web app's identity and how to install it. */
export function PwaView() {
  const state = useJson<PwaPayload>("/api/panel/system/pwa");
  return (
    <Loadable state={state} rows={4}>
      {(data) => (
        <div className="flex flex-col gap-5">
          <BrandCard key={`${data.brand.name}|${data.brand.color}|${data.brand.has_own_logo}`} brand={data.brand} onSaved={state.reload} />
          <GlassSection
            title="وب‌اپ (PWA)"
            description={
              <>
                پنل را مثل اپ روی موبایل/دسکتاپ نصب کنید. اگر نام یا آیکن خالی بماند، برند و لوگوی خود پنل (<Ltr>ShieldRay</Ltr>) استفاده می‌شود.
              </>
            }
          >
            <PwaForm key={`${data.pwa.name_raw}|${data.pwa.short_name_raw}|${data.pwa.description_raw}|${data.pwa.icon_preview}`} pwa={data.pwa} onSaved={state.reload} />
          </GlassSection>
          <GlassSection title="نصب روی دستگاه">
            <ol className="flex list-decimal flex-col gap-2 ps-5 text-sm text-foreground/80">
              {INSTALL_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="text-sm text-muted">
              پیش‌نمایش فعلی: <strong className="text-foreground">{data.pwa.name}</strong> · <Ltr>{data.pwa.short_name}</Ltr>
            </p>
          </GlassSection>
        </div>
      )}
    </Loadable>
  );
}
