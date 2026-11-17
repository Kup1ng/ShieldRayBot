"use client";

import { useState } from "react";

import { run, usePending } from "../../core/actions";
import { SubmitButton, SwitchInput } from "../../ui/Fields";
import { GlassSection } from "../../ui/Page";
import { FilePicker } from "./FilePicker";
import { DownloadLink } from "./ui";

const IMPORT_URL = "/settings/shop-import";
const EXPORT_URL = "/settings/shop-export";
const REPLACE_ASK = {
  title: "پلن‌های فعلی جایگزین شوند؟",
  text: "پلن‌های فعلی حذف می‌شوند (پلن‌هایی که سابقهٔ فروش دارند فقط غیرفعال می‌شوند) و پلن‌های فایل جایگزین‌شان می‌شود.",
  confirmLabel: "جایگزین کن",
  tone: "warning",
} as const;

/** Export and import the shop's plans and settings as JSON (separate from the full ZIP backup). */
export function BundleCard({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [replacePlans, setReplacePlans] = useState(false);
  const [pickerKey, setPickerKey] = useState(0);
  const { pending, track } = usePending();

  const submit = () =>
    track(async () => {
      if (!file) return;
      const result = await run(IMPORT_URL, { file, replace_plans: replacePlans }, { ask: replacePlans ? REPLACE_ASK : undefined, success: "تنظیمات وارد شد.", refresh: onDone });
      if (result?.ok) {
        setFile(null);
        setReplacePlans(false);
        setPickerKey((n) => n + 1);
      }
    });

  return (
    <GlassSection
      title="خروجی / ورودی تنظیمات فروشگاه"
      description="پلن‌ها و متن‌ها/سوییچ‌ها را به‌صورت JSON جابه‌جا کنید (جدا از بکاپ کامل ZIP)."
      actions={<DownloadLink href={EXPORT_URL}>دانلود خروجی JSON</DownloadLink>}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FilePicker key={pickerKey} label="فایل JSON" accept=".json,application/json" file={file} onFile={setFile} help="خروجی قبلی را اینجا انتخاب کنید." />
        <SwitchInput label="جایگزینی پلن‌های فعلی" help="اگر خاموش باشد فقط اضافه می‌شود" checked={replacePlans} onChange={setReplacePlans} />
        <div className="flex justify-end">
          <SubmitButton pending={pending} isDisabled={!file}>
            وارد کردن
          </SubmitButton>
        </div>
      </form>
    </GlassSection>
  );
}
