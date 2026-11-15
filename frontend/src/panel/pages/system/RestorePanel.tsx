"use client";

import { Ltr } from "../../ui/Data";
import { GlassSection } from "../../ui/Page";
import { Notice } from "../../ui/States";
import { JobProgress } from "./JobProgress";
import type { Job } from "./useJob";
import type { BackupPayload } from "./types";

const RESTART_PERCENT = 98;
const RESTART_STEP = "راه‌اندازی مجدد سرویس";

/** Warnings of the last restore and the live progress of a restore in flight (or its failure). */
export function RestorePanel({ data, job }: { data: BackupPayload; job: Job }) {
  const status = job.status;
  const restarting = job.phase === "restarting";
  const failed = job.phase === "error";
  const active = job.phase === "running" || restarting;
  const safety = status?.safety_id ? (
    <small className="text-xs text-muted">
      بکاپ ایمنی: <Ltr>{status.safety_id}</Ltr>
    </small>
  ) : null;

  return (
    <GlassSection title="ریستور بکاپ" description="بعد از تأیید، مراحل بازیابی اینجا نمایش داده می‌شود — مشابه آپدیت پنل.">
      {data.restore_warnings.map((warning) => (
        <Notice key={warning} tone="warning">
          {warning}
        </Notice>
      ))}
      {active && status ? (
        <JobProgress
          label="پیشرفت ریستور"
          percent={restarting ? RESTART_PERCENT : Number(status.percent ?? 0)}
          stepLabel={restarting ? RESTART_STEP : status.step || status.message || "در حال ریستور…"}
          message={restarting ? job.note : status.message || ""}
          steps={data.restore_steps}
          currentKey={restarting ? "restart" : status.step_key}
          footer={safety}
        />
      ) : null}
      {failed && status ? (
        <Notice tone="danger" title={status.restart_required ? "ری‌استارت دستی لازم است" : "ریستور ناموفق"}>
          {status.message || status.error || "خطای ناشناخته"}
          {safety}
        </Notice>
      ) : null}
      {!active && !failed && status && status.state !== "idle" ? (
        <Notice tone={status.state === "done" ? "success" : "warning"}>
          وضعیت ریستور: {status.message || status.state}
          {safety}
        </Notice>
      ) : null}
      {!active && !failed && (!status || status.state === "idle") && !data.restore_warnings.length ? <p className="text-sm text-muted">ریستوری در حال اجرا نیست. از فهرست بکاپ‌ها «ریستور» را بزنید.</p> : null}
    </GlassSection>
  );
}
