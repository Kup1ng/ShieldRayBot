"use client";

import { Button, toast } from "@heroui/react";
import { useState } from "react";

import { run, usePending } from "../../core/actions";
import { Ltr, StatusChip } from "../../ui/Data";
import { GlassSection } from "../../ui/Page";
import { SubmitButton } from "../../ui/Fields";
import type { BackupPayload, ScheduleGroup } from "./types";
import { draftFields, initialDraft, isDraftDirty, ScheduleFieldView, TELEGRAM_KIND, type FieldValue } from "./ui";

const SAVE_URL = "/settings?tab=backup";
const HOUR_KEY = "backup_schedule_hour";
const LAST_HOUR = 23;
const BAD_HOUR = "ساعت بکاپ باید عددی بین ۰ تا ۲۳ باشد.";

/** An hour of the day, or null when the text is not one. */
export function validHour(raw: string): number | null {
  if (!/^\d{1,2}$/.test(raw.trim())) return null;
  const hour = Number(raw.trim());
  return hour <= LAST_HOUR ? hour : null;
}

/** The nightly schedule, retention and Telegram delivery settings (the old «بکاپ» settings form). */
export function ScheduleForm({ groups, onSaved }: { groups: ScheduleGroup[]; onSaved: () => void }) {
  const fields = groups.flatMap((group) => group.fields);
  const [draft, setDraft] = useState<Record<string, FieldValue>>(() => initialDraft(fields));
  const { pending, track } = usePending();
  const dirty = isDraftDirty(fields, draft);

  const save = () =>
    track(async () => {
      if (HOUR_KEY in draft && validHour(String(draft[HOUR_KEY])) === null) {
        toast.danger(BAD_HOUR);
        return;
      }
      await run(SAVE_URL, draftFields(fields, draft), { success: "تنظیمات بکاپ ذخیره شد.", refresh: onSaved });
    });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {groups.map((group) => (
        <GlassSection key={group.title} title={group.title}>
          <div className="grid gap-4 sm:grid-cols-2">
            {group.fields.map((field) => (
              <div key={field.key} className={field.kind === "toggle" ? "sm:col-span-2" : undefined}>
                <ScheduleFieldView field={field} value={draft[field.key]} onChange={(value) => setDraft((prev) => ({ ...prev, [field.key]: value }))} />
              </div>
            ))}
          </div>
        </GlassSection>
      ))}
      <div className="flex justify-end">
        <SubmitButton pending={pending} isDisabled={!dirty}>
          ذخیره تنظیمات بکاپ
        </SubmitButton>
      </div>
    </form>
  );
}

/** The last Telegram delivery and a button that sends a test message. */
export function TelegramCard({ telegram, onSent }: { telegram: BackupPayload["telegram"]; onSent: () => void }) {
  const { pending, track } = usePending();
  const kind = TELEGRAM_KIND[telegram.kind];
  const sendTest = () => track(() => run("/backup/telegram-test", {}, { success: "پیام آزمایشی ارسال شد.", refresh: onSent }));
  return (
    <GlassSection title="وضعیت ارسال به تلگرام">
      {kind ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <StatusChip color={kind.color}>{kind.label}</StatusChip>
          <span>{telegram.message}</span>
          {telegram.at ? (
            <span>
              · <Ltr>{telegram.at.replace("T", " ")}</Ltr>
            </span>
          ) : null}
        </p>
      ) : (
        <p className="text-sm text-muted">هنوز بکاپی به تلگرام ارسال نشده است. بعد از ذخیرهٔ تنظیمات، با دکمهٔ زیر اتصال را بسنجید.</p>
      )}
      <div>
        <Button variant="outline" onPress={() => void sendTest()} isPending={pending}>
          ارسال پیام آزمایشی
        </Button>
      </div>
    </GlassSection>
  );
}
