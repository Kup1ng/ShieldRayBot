"use client";

import { toast } from "@heroui/react";

import { panelJson } from "../../core/api";
import { run } from "../../core/actions";
import { useJson } from "../../core/data";
import { Ltr } from "../../ui/Data";
import { GlassSection } from "../../ui/Page";
import { Loadable } from "../../ui/States";
import { BackupList } from "./BackupList";
import { CreateBackupCard, UploadBackupCard } from "./BackupCreate";
import { ScheduleForm, TelegramCard } from "./BackupSchedule";
import { BundleCard } from "./BundleCard";
import { RestorePanel } from "./RestorePanel";
import type { BackupPayload, BackupRow, JobStatus } from "./types";
import { isBusy, useJob, type JobPhase } from "./useJob";

const STATUS_URL = "/backup/status";
const NOTES = [
  "بکاپ روی دیسک سرور در data/backups/ ذخیره می‌شود.",
  "پیش‌فرض بدون .env است؛ بکاپ با اسرار فقط با تأیید دو مرحله‌ای.",
  "حتی بدون .env، رمز ورود وب‌پنل (web_admin.json) داخل آرشیو است — دانلود را جای امن نگه دارید.",
  "ریستور سرویس را ری‌استارت می‌کند تا دیتابیس جدید لود شود.",
  "بکاپ کامل پلتفرم فقط برای مالک است؛ نماینده مسیر بکاپ سرور ندارد.",
];

/** Reset the finished-status file so the next visit starts from a clean slate. */
async function clearFinishedStatus(): Promise<void> {
  try {
    await panelJson("/backup/clear", {});
  } catch (err) {
    console.debug("backup status not cleared", err);
  }
}

function BackupContent({ data, reload }: { data: BackupPayload; reload: () => void }) {
  const job = useJob({
    statusUrl: STATUS_URL,
    initial: data.restore,
    onRestarted: () => {
      toast.success("ریستور با موفقیت انجام شد");
      void clearFinishedStatus().then(reload);
    },
    onSettled: (phase: JobPhase, status: JobStatus) => {
      if (phase === "error") toast.danger(status.message || status.error || "ریستور ناموفق");
      else if (phase === "done") {
        toast.success(status.message || "ریستور انجام شد");
        void clearFinishedStatus();
      }
      reload();
    },
  });
  const busy = isBusy(job.phase);

  const restore = async (row: BackupRow, restoreEnv: boolean) => {
    const result = await run(`/backup/restore/${encodeURIComponent(row.id)}`, { confirm: true, restore_env: restoreEnv }, { success: "ریستور شروع شد." });
    // A lost reply means the restore may be running: read the state, never post again.
    if (result?.ok) job.follow();
    else reload();
  };

  return (
    <div className="flex flex-col gap-5">
      <BundleCard onDone={reload} />
      <ScheduleForm key={JSON.stringify(data.groups)} groups={data.groups} onSaved={reload} />
      <TelegramCard telegram={data.telegram} onSent={reload} />
      <CreateBackupCard data={data} busy={busy} onDone={reload} />
      <UploadBackupCard busy={busy} onDone={reload} />
      <RestorePanel data={data} job={job} />
      <BackupList data={data} busy={busy} onChanged={reload} onRestore={restore} />
      <GlassSection title="نکات مهم">
        <ul className="flex list-disc flex-col gap-2 ps-5 text-sm text-foreground/80">
          {NOTES.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <p className="text-xs text-muted">
          مسیر پوشه: <Ltr>data/backups/</Ltr>
        </p>
      </GlassSection>
    </div>
  );
}

/** «بکاپ»: backups, restore, schedule, retention and Telegram delivery. */
export function BackupView() {
  const state = useJson<BackupPayload>("/api/panel/system/backup");
  return <Loadable state={state}>{(data) => <BackupContent data={data} reload={state.reload} />}</Loadable>;
}
