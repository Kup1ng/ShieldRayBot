"use client";

import { Button } from "@heroui/react";
import { useState } from "react";

import { run, usePending } from "../../core/actions";
import { formatDateTime } from "../../core/format";
import { Ltr, StatusChip } from "../../ui/Data";
import { FormModal, SwitchInput } from "../../ui/Fields";
import { GlassSection } from "../../ui/Page";
import { EmptyBlock } from "../../ui/States";
import type { BackupPayload, BackupRow } from "./types";
import { DownloadLink } from "./ui";

const HEALTH = {
  ok: { label: "سالم", color: "success", hint: "آخرین بررسی سلامت موفق بود" },
  failed: { label: "ناموفق", color: "danger", hint: "آخرین بررسی سلامت ناموفق بود" },
  unknown: { label: "بررسی‌نشده", color: "default", hint: "هنوز بررسی نشده" },
} as const;

const DELETE_ASK = (row: BackupRow) => ({ title: "تأیید حذف بکاپ", text: `این بکاپ حذف شود؟ (${row.filename})`, confirmLabel: "حذف بکاپ", tone: "danger" as const });

function RestoreDialog({ row, busy, onClose, onConfirm }: { row: BackupRow | null; busy: boolean; onClose: () => void; onConfirm: (row: BackupRow, restoreEnv: boolean) => void }) {
  // The switch starts from what the archive holds; the dialog is remounted per backup (see `key`).
  const [restoreEnv, setRestoreEnv] = useState(row?.include_env ?? false);
  return (
    <FormModal isOpen={row !== null} onOpenChange={(open) => (open ? undefined : onClose())} title="تأیید ریستور بکاپ" description="این عمل را تأیید کنید" size="md">
      {row ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm(row, restoreEnv);
          }}
        >
          <p className="text-sm leading-6 text-muted">
            همه داده‌های فعلی با بکاپ <strong className="text-foreground"><Ltr>{row.filename}</Ltr></strong> جایگزین می‌شود. قبل از ریستور یک بکاپ ایمنی خودکار ساخته می‌شود.
          </p>
          <SwitchInput label="بازیابی .env هم" help="برای انتقال به سرور جدید روشن کنید؛ آدرس دیتابیس و پورت همین سرور حفظ می‌شود." checked={restoreEnv} onChange={setRestoreEnv} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onPress={onClose}>
              انصراف
            </Button>
            <Button type="submit" variant="danger" isDisabled={busy}>
              تأیید ریستور
            </Button>
          </div>
        </form>
      ) : null}
    </FormModal>
  );
}

function BackupItem({ row, health, busy, onVerify, onDelete, onRestore }: { row: BackupRow; health: keyof typeof HEALTH; busy: boolean; onVerify: () => void; onDelete: () => void; onRestore: () => void }) {
  const tag = HEALTH[health];
  return (
    <li className="inset-tile flex flex-wrap items-center justify-between gap-3 rounded-lg p-3">
      <div className="flex min-w-[220px] flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="break-all text-sm" dir="ltr">
            {row.filename}
          </strong>
          {row.is_latest ? (
            <span title={tag.hint}>
              <StatusChip color={tag.color}>{tag.label}</StatusChip>
            </span>
          ) : null}
          <span title={row.include_env ? "این بکاپ فایل .env (توکن‌ها و اسرار) را دارد" : "فایل .env داخل این بکاپ نیست"}>
            <StatusChip color={row.include_env ? "warning" : "default"}>{row.include_env ? "شامل .env" : "بدون .env"}</StatusChip>
          </span>
        </div>
        <p className="text-xs text-muted">
          {formatDateTime(row.created_at)} · <Ltr>{row.size_human}</Ltr> · <Ltr>v{row.app_version}</Ltr>
          {row.note ? ` · ${row.note}` : ""}
        </p>
        {row.sha256_prefix ? (
          <small className="text-xs text-muted">
            <Ltr>sha256: {row.sha256_prefix}…</Ltr>
          </small>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {row.is_latest ? (
          <Button size="sm" variant="ghost" onPress={onVerify} isDisabled={busy}>
            بررسی سلامت
          </Button>
        ) : null}
        <DownloadLink href={`/backup/download/${encodeURIComponent(row.id)}`}>دانلود</DownloadLink>
        <Button size="sm" variant="danger-soft" onPress={onDelete} isDisabled={busy}>
          حذف
        </Button>
        <Button size="sm" onPress={onRestore} isDisabled={busy}>
          ریستور
        </Button>
      </div>
    </li>
  );
}

type ListProps = {
  data: BackupPayload;
  /** A restore or a restart is in progress: nothing else may touch the backups. */
  busy: boolean;
  onChanged: () => void;
  /** Start a restore; resolves once the server answered (the page then follows the job). */
  onRestore: (row: BackupRow, restoreEnv: boolean) => Promise<void>;
};

/** The saved backups with verify, download, delete and restore. */
export function BackupList({ data, busy, onChanged, onRestore }: ListProps) {
  const [target, setTarget] = useState<BackupRow | null>(null);
  const { pending, track } = usePending();
  const disabled = busy || pending;

  const verify = () => track(() => run("/backup/verify-last", {}, { success: "آخرین بکاپ سالم است", refresh: onChanged }));
  const remove = (row: BackupRow) => track(() => run(`/backup/delete/${encodeURIComponent(row.id)}`, {}, { ask: DELETE_ASK(row), success: "بکاپ حذف شد", refresh: onChanged }));
  const confirmRestore = (row: BackupRow, restoreEnv: boolean) => {
    setTarget(null);
    void track(() => onRestore(row, restoreEnv));
  };

  return (
    <GlassSection title="بکاپ‌های ذخیره‌شده" description={`روی دیسک سرور در data/backups/ نگه‌داری می‌شود (حداکثر ${data.max_backups.toLocaleString("fa-IR")} مورد).`}>
      {data.backups.length ? (
        <ul className="flex flex-col gap-2" aria-label="بکاپ‌های ذخیره‌شده">
          {data.backups.map((row) => (
            <BackupItem key={row.id} row={row} health={data.last_verify} busy={disabled} onVerify={() => void verify()} onDelete={() => void remove(row)} onRestore={() => setTarget(row)} />
          ))}
        </ul>
      ) : (
        <EmptyBlock icon="solar:database-linear" title="هنوز بکاپی ساخته نشده" description="با «ساخت بکاپ جدید» اولین بکاپ را بسازید یا فایل ZIP یک بکاپ قبلی را آپلود کنید." />
      )}
      <RestoreDialog key={target?.id ?? "closed"} row={target} busy={disabled} onClose={() => setTarget(null)} onConfirm={confirmRestore} />
    </GlassSection>
  );
}
