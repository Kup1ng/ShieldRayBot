"use client";

import { toast } from "@heroui/react";
import { useState } from "react";

import { run, usePending } from "../../core/actions";
import { fa } from "../../core/format";
import { FormGrid, SubmitButton, SwitchInput, TextInput } from "../../ui/Fields";
import { Notice } from "../../ui/States";
import { Ltr } from "../../ui/Data";
import { GlassSection } from "../../ui/Page";
import { FilePicker } from "./FilePicker";
import type { BackupPayload } from "./types";
import { MetaItem } from "./ui";

const UPLOAD_MAX_BYTES = 500 * 1024 * 1024;
const ENV_CONFIRM_NEEDED = "برای بکاپ با .env باید تأیید امنیتی دوم را روشن کنید.";

type CreateProps = { data: BackupPayload; busy: boolean; onDone: () => void };

/** Make a full backup now; the `.env` (secrets) goes in only with two explicit confirmations. */
export function CreateBackupCard({ data, busy, onDone }: CreateProps) {
  const [note, setNote] = useState("");
  const [includeEnv, setIncludeEnv] = useState(false);
  const [confirmEnv, setConfirmEnv] = useState(false);
  const { pending, track } = usePending();

  const toggleEnv = (on: boolean) => {
    setIncludeEnv(on);
    if (!on) setConfirmEnv(false);
  };

  const submit = () =>
    track(async () => {
      if (includeEnv && !confirmEnv) {
        toast.danger(ENV_CONFIRM_NEEDED);
        return;
      }
      const result = await run("/backup/create", { note, include_env: includeEnv, confirm_include_env: includeEnv && confirmEnv }, { success: "بکاپ ساخته شد.", refresh: onDone });
      if (result?.ok) {
        setNote("");
        setIncludeEnv(false);
        setConfirmEnv(false);
      }
    });

  return (
    <GlassSection
      title="بکاپ کامل اطلاعات"
      description={
        <>
          آرشیو ZIP همیشه شامل دیتابیس کامل پلتفرم (همه فروشگاه‌ها)، آپلودها و فایل ورود وب‌پنل (<Ltr>web_admin.json</Ltr>) است. فایل <Ltr>.env</Ltr> (توکن ربات و اسرار) پیش‌فرض خارج است — مثل بکاپ زمان‌بندی‌شده؛ فقط با سوییچ و تأیید امنیتی اضافه می‌شود. قبل از هر ریستور، یک بکاپ ایمنی خودکار (با .env) ساخته می‌شود.
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetaItem label="نسخهٔ فعلی">
          <Ltr>{data.local_version}</Ltr>
        </MetaItem>
        <MetaItem label="دیتابیس">
          <Ltr>{data.db_path}</Ltr>
        </MetaItem>
        <MetaItem label="تعداد بکاپ‌ها">{fa(data.backups.length)}</MetaItem>
        {data.last_auto_backup_at ? (
          <MetaItem label="آخرین بکاپ خودکار">
            <Ltr>{data.last_auto_backup_at}</Ltr>
          </MetaItem>
        ) : null}
      </div>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FormGrid>
          <TextInput className="sm:col-span-2" label="یادداشت (اختیاری)" value={note} onChange={setNote} maxLength={200} placeholder="مثلاً قبل از تغییر بزرگ" disabled={busy} />
          <div className="sm:col-span-2">
            <SwitchInput label="شامل .env (توکن‌ها و اسرار)" checked={includeEnv} onChange={toggleEnv} disabled={busy} />
          </div>
        </FormGrid>
        {includeEnv ? (
          <div className="flex flex-col gap-3">
            <Notice tone="danger" title="هشدار امنیتی">
              با روشن کردن این گزینه، توکن ربات تلگرام، رمزها و اسرار سرور داخل ZIP می‌روند. حتی بدون .env، فایل web_admin.json (ورود وب‌پنل) همچنان در بکاپ هست — فایل را جای امن نگه دارید.
            </Notice>
            <SwitchInput label="تأیید می‌کنم که .env (اسرار) داخل بکاپ برود" checked={confirmEnv} onChange={setConfirmEnv} disabled={busy} />
          </div>
        ) : null}
        <div className="flex justify-end">
          <SubmitButton pending={pending} isDisabled={busy}>
            ساخت بکاپ جدید
          </SubmitButton>
        </div>
        {pending ? <p className="text-sm text-muted" role="status">در حال ساخت بکاپ…</p> : null}
      </form>
    </GlassSection>
  );
}

/** Upload a ZIP of an earlier backup for restoring or keeping. */
export function UploadBackupCard({ busy, onDone }: { busy: boolean; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const { pending, track } = usePending();

  const submit = () =>
    track(async () => {
      if (!file) return;
      if (file.size > UPLOAD_MAX_BYTES) {
        toast.danger("حجم بکاپ بیش از ۵۰۰ مگابایت است");
        return;
      }
      const result = await run("/backup/upload", { file }, { success: "بکاپ آپلود شد.", refresh: onDone });
      if (result?.ok) {
        setFile(null);
        setPickerKey((n) => n + 1);
      }
    });

  return (
    <GlassSection title="آپلود بکاپ" description="فایل ZIP بکاپ قبلی را برای بازیابی یا نگه‌داری آپلود کنید.">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FilePicker key={pickerKey} label="فایل بکاپ" accept=".zip,application/zip" file={file} onFile={setFile} help="فایل ZIP را انتخاب کنید (حداکثر ۵۰۰ مگابایت)." disabled={busy} />
        <div className="flex justify-end">
          <SubmitButton pending={pending} isDisabled={busy || !file}>
            آپلود
          </SubmitButton>
        </div>
      </form>
    </GlassSection>
  );
}
