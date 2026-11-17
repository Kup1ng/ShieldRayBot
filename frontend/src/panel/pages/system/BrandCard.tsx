"use client";

import { Button, Label, Radio, RadioGroup, toast } from "@heroui/react";
import { useEffect, useMemo, useState } from "react";

import { run, usePending } from "../../core/actions";
import { fa } from "../../core/format";
import { usePanelSession } from "../../core/session";
import { FormGrid, SubmitButton, TextInput } from "../../ui/Fields";
import { GlassSection } from "../../ui/Page";
import { FilePicker } from "./FilePicker";
import type { PwaPayload } from "./types";

const SAVE_URL = "/panel-brand";
const LOGO_ACCEPT = "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";
const DEFAULT_COLOR_KEY = "__default__";
const LOGO_TOO_LARGE = "حجم لوگو حداکثر ۲ مگابایت باشد.";

type Brand = PwaPayload["brand"];

/** The header as it will look with the draft name, logo and colour. */
function BrandPreview({ name, logoUrl, swatch }: { name: string; logoUrl: string; swatch: string }) {
  return (
    <div className="inset-tile flex items-center gap-3 rounded-lg p-3" aria-hidden="true">
      <img src={logoUrl} alt="" width={40} height={40} className="size-10 rounded-lg object-contain" />
      <span className="flex min-w-0 flex-1 flex-col">
        <strong dir="auto" className="truncate text-sm">
          {name}
        </strong>
        <small className="text-xs text-muted">پیش‌نمایش هدر</small>
      </span>
      <span className="rounded-full px-3 py-1 text-xs font-medium text-white" style={{ backgroundColor: swatch }}>
        تب فعال
      </span>
    </div>
  );
}

function useObjectUrl(file: File | null): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);
  return url;
}

/** Name, logo and accent of the Owner's own web-panel brand; posts the existing `/panel-brand` form. */
export function BrandCard({ brand, onSaved }: { brand: Brand; onSaved: () => void }) {
  const { refresh } = usePanelSession();
  const [name, setName] = useState(brand.name);
  const [color, setColor] = useState(brand.color || DEFAULT_COLOR_KEY);
  const [logo, setLogo] = useState<File | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const { pending, track } = usePending();
  const draftLogo = useObjectUrl(logo);

  const swatch = brand.presets.find((preset) => preset.key === color)?.swatch ?? brand.default_color.swatch;
  const after = () => {
    onSaved();
    void refresh();
  };
  const fields = (extra: Record<string, string | boolean>) => ({
    panel_brand_name: name,
    panel_brand_color: color === DEFAULT_COLOR_KEY ? "" : color,
    ...(logo ? { panel_brand_logo: logo } : {}),
    ...extra,
  });

  const save = () =>
    track(async () => {
      if (logo && logo.size > brand.logo_max_bytes) {
        toast.danger(LOGO_TOO_LARGE);
        return;
      }
      const result = await run(SAVE_URL, fields({}), { success: "برند پنل ذخیره شد", refresh: after });
      if (result?.ok) {
        setLogo(null);
        setPickerKey((n) => n + 1);
      }
    });

  const clearLogo = () =>
    track(async () => {
      await run(SAVE_URL, fields({ panel_brand_logo_clear: true }), {
        ask: { title: "لوگوی سفارشی حذف شود؟", text: "لوگوی پیش‌فرض دوباره نمایش داده می‌شود.", confirmLabel: "حذف", tone: "danger" },
        success: "لوگو حذف شد",
        refresh: after,
      });
    });

  const colors = [{ key: DEFAULT_COLOR_KEY, label: brand.default_color.label, swatch: brand.default_color.swatch }, ...brand.presets];
  return (
    <GlassSection
      title="برند وب‌پنل"
      description="نام و لوگو بالای وب‌پنل و رنگ برند در تب‌ها و هایلایت‌ها نمایش داده می‌شود. فروشگاه‌هایی که برند خودشان را نگذاشته‌اند هم همین را می‌بینند."
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <BrandPreview name={name || brand.fallback_name} logoUrl={draftLogo ?? brand.effective_logo_url} swatch={swatch} />
        <FormGrid>
          <TextInput label="نام برند" value={name} onChange={setName} maxLength={brand.name_max} placeholder={brand.fallback_name} help={`حداکثر ${fa(brand.name_max)} کاراکتر — خالی = ${brand.fallback_name}`} />
          <div className="flex flex-col gap-2">
            <FilePicker
              key={pickerKey}
              label="لوگو"
              accept={LOGO_ACCEPT}
              file={logo}
              onFile={setLogo}
              help="PNG، JPG یا WebP — حداکثر ۲ مگابایت. لوگو در قاب مربع ۴۰ پیکسلی هدر، بدون برش نمایش داده می‌شود؛ پس‌زمینهٔ شفاف توصیه می‌شود."
            />
            {brand.has_own_logo ? (
              <div>
                <Button variant="danger-soft" size="sm" onPress={() => void clearLogo()} isDisabled={pending}>
                  حذف لوگو
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted">{brand.has_custom_logo ? "لوگوی پلتفرم نمایش داده می‌شود" : "لوگوی پیش‌فرض نمایش داده می‌شود"}</p>
            )}
          </div>
        </FormGrid>
        <RadioGroup value={color} onChange={setColor} orientation="horizontal" name="panel_brand_color" className="flex flex-wrap gap-x-5 gap-y-3">
          <Label className="w-full">رنگ برند</Label>
          {colors.map((option) => (
            <Radio key={option.key} value={option.key}>
              <Radio.Content>
                <Radio.Control>
                  <Radio.Indicator />
                </Radio.Control>
                <span className="flex items-center gap-2 text-sm">
                  <span aria-hidden="true" className="size-4 rounded-full" style={{ backgroundColor: option.swatch }} />
                  {option.label}
                </span>
              </Radio.Content>
            </Radio>
          ))}
        </RadioGroup>
        <p className="text-xs text-muted">فقط رنگ برند عوض می‌شود؛ رنگ‌های موفق، خطا و هشدار ثابت می‌مانند.</p>
        <div className="flex justify-end">
          <SubmitButton pending={pending}>ذخیره برند</SubmitButton>
        </div>
      </form>
    </GlassSection>
  );
}
