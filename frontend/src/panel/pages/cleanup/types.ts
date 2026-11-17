/** Answer of /api/panel/service-cleanup (app/api/service_cleanup_pages.py). */

export type CleanupPolicy = {
  time_on: boolean;
  time_days: number;
  warn_first: number;
  warn_last: number;
  volume_on: boolean;
  volume_days: number;
};

export type CleanupPreviewRow = {
  service_id: number;
  user_id: number;
  username: string;
  customer: string;
  /** Why the service is in the queue: «انقضا» or «اتمام حجم». */
  kind: string;
  /** Local date (YYYY-MM-DD) the expiry or volume end counts from. */
  since: string;
  /** Local date (YYYY-MM-DD) the service is deleted on. */
  deadline: string;
  days_left: number;
  /** A delete was tried and failed; the next try waits. */
  retrying: boolean;
};

export type CleanupPreview = {
  cache_note: string;
  expired_total: number;
  volume_total: number;
  time_due_now: number;
  time_due_soon: number;
  volume_due_now: number;
  volume_due_soon: number;
  rows: CleanupPreviewRow[];
};

export type CleanupExemptRow = {
  service_id: number;
  user_id: number;
  username: string;
  customer: string;
};

export type ServiceCleanupData = {
  policy: CleanupPolicy;
  min_days: number;
  max_days: number;
  preview: CleanupPreview;
  exempt: CleanupExemptRow[];
};
