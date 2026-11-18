"use client";

import { StatusChip, Ltr } from "../../ui/Data";
import { UserNameLink } from "../../ui/UserNameLink";
import type { UserRef } from "./types";

/** A customer in a table row: the name that opens the user card, the order number and the demo marker. */
export function UserCell({ user, orderId }: { user: UserRef; orderId?: number }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <UserNameLink userId={user.id} name={user.name} page="finance" />
      {orderId ? <Ltr className="text-xs text-muted">(#{orderId})</Ltr> : null}
      {user.is_demo ? (
        <span title="در گزارش‌های مالی محاسبه نمی‌شود">
          <StatusChip color="default">دمو</StatusChip>
        </span>
      ) : null}
    </div>
  );
}
