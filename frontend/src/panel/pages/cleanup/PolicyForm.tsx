"use client";

import { useState, type FormEvent } from "react";

import { run } from "../../core/actions";
import { FormGrid, SwitchInput, TextInput } from "../../ui/Fields";
import { GlassSection } from "../../ui/Page";
import { FormActions } from "../catalog/PlanParts";
import type { CleanupPolicy } from "./types";

export const SAVE_PATH = "/service-cleanup";
export const SAVED_TEXT = "تنظیمات پاکسازی سرویس‌ها ذخیره شد";

type Props = { policy: CleanupPolicy; minDays: number; maxDays: number; onSaved: () => void };

/** The rule of this shop (or the platform): two independent switches, each with its own days. */
export function PolicyForm({ policy, minDays, maxDays, onSaved }: Props) {
  const [timeOn, setTimeOn] = useState(policy.time_on);
  const [timeDays, setTimeDays] = useState(String(policy.time_days));
  const [warnFirst, setWarnFirst] = useState(String(policy.warn_first));
  const [warnLast, setWarnLast] = useState(String(policy.warn_last));
  const [volumeOn, setVolumeOn] = useState(policy.volume_on);
  const [volumeDays, setVolumeDays] = useState(String(policy.volume_days));
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      // A hidden group keeps its values: the handler validates both rules whether or not they are on.
      const fields = { time_on: timeOn, time_days: timeDays, warn_first: warnFirst, warn_last: warnLast, volume_on: volumeOn, volume_days: volumeDays };
      const result = await run(SAVE_PATH, fields, { success: SAVED_TEXT });
      if (result?.ok) onSaved();
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="flex flex-col gap-6" onSubmit={(event) => void submit(event)}>
      <GlassSection>
        <SwitchInput label="حذف سرویس منقضی" help="بعد از مهلت، سرویس و کاربر پنل آن حذف می‌شود." checked={timeOn} onChange={setTimeOn} />
        {timeOn ? (
          <div className="flex flex-col gap-4">
            <TextInput
              label="مهلت بعد از انقضا (روز)"
              type="number"
              min={minDays}
              max={maxDays}
              value={timeDays}
              onChange={setTimeDays}
              required
              help="اگر تا این مهلت تمدید نشود حذف می‌شود. روزها از زمان انقضا یا از لحظهٔ روشن‌کردن این قانون، هرکدام دیرتر بود، شمرده می‌شود."
            />
            <FormGrid>
              <TextInput label="هشدار اول (روز مانده به حذف)" type="number" min={0} max={maxDays} value={warnFirst} onChange={setWarnFirst} help="۰ یعنی خاموش." />
              <TextInput label="هشدار آخر (روز مانده به حذف)" type="number" min={0} max={maxDays} value={warnLast} onChange={setWarnLast} help="۰ یعنی خاموش." />
            </FormGrid>
          </div>
        ) : null}
      </GlassSection>
      <GlassSection>
        <SwitchInput label="حذف سرویس بی‌حجم" help="جدا از انقضا؛ سرویسی که حجمش تمام شده و بسته حجم نگرفته است." checked={volumeOn} onChange={setVolumeOn} />
        {volumeOn ? (
          <TextInput
            label="مهلت بعد از اتمام حجم (روز)"
            type="number"
            min={minDays}
            max={maxDays}
            value={volumeDays}
            onChange={setVolumeDays}
            required
            help="حجم تمام‌شده معمولاً با خرید بسته حجم برمی‌گردد؛ مهلت را بلندتر از مهلت انقضا بگذارید."
          />
        ) : null}
      </GlassSection>
      <FormActions submitLabel="ذخیره تنظیمات" pending={pending} />
    </form>
  );
}
