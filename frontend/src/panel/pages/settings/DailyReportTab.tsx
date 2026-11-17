"use client";

import { DailyReportForm } from "../../settings-ui/DailyReportForm";
import type { TabProps } from "./GenericTab";
import type { DailyReportExtra } from "./types";

const OWNER_METRICS_NOTE = "نمایندگان آمار سطح مالک سیستم را نمی‌بینند.";

/** Owner adapter: the daily admin report, saved by the settings handler with its statistics switches. */
export function DailyReportTab({ data, reload }: TabProps<DailyReportExtra>) {
  return (
    <DailyReportForm
      groups={data.groups ?? []}
      extra={data.extra as DailyReportExtra}
      action="/settings?tab=daily_report"
      reload={reload}
      saved={data.preview_values}
      metricsNote={OWNER_METRICS_NOTE}
    />
  );
}
