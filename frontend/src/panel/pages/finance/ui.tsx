"use client";

import { StatusChip, Ltr } from "../../ui/Data";
import type { UserRef } from "./types";

/** A customer in a table row: link to the user, the order number and the demo marker. */
export function UserCell({ user, orderId }: { user: UserRef; orderId?: number }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {user.id ? (
        <a href={`/users?uid=${user.id}`} dir="auto" className="truncate font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus">
          {user.name}
        </a>
      ) : (
        <span dir="auto" className="truncate font-medium text-foreground">
          {user.name}
        </span>
      )}
      {orderId ? <Ltr className="text-xs text-muted">(#{orderId})</Ltr> : null}
      {user.is_demo ? (
        <span title="در گزارش‌های مالی محاسبه نمی‌شود">
          <StatusChip color="default">دمو</StatusChip>
        </span>
      ) : null}
    </div>
  );
}
