"use client";

import { toast } from "@heroui/react";
import { useState, type ReactNode } from "react";

import { Icon } from "@/icons/Icon";

export type Person = { id: number; name: string; username: string; telegram_id: number };

const PHOTO_SIZE = 56;
const FALLBACK_NAME = "—";

/** The Telegram photo shows once it loads; its initial stays until then, and when there is none. */
function Photo({ id, name }: { id: number; name: string }) {
  const [shown, setShown] = useState(false);
  return (
    <span aria-hidden className="relative inline-flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-secondary text-xl font-semibold text-foreground">
      <span>{name.slice(0, 1)}</span>
      <img
        src={`/users/${id}/photo`}
        alt=""
        width={PHOTO_SIZE}
        height={PHOTO_SIZE}
        decoding="async"
        onLoad={() => setShown(true)}
        className={`absolute inset-0 size-full object-cover ${shown ? "" : "hidden"}`}
      />
    </span>
  );
}

async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("کپی شد");
  } catch {
    toast.danger("کپی انجام نشد؛ دسترسی به کلیپ‌بورد ممکن نیست");
  }
}

function IdChip({ label, copyLabel, value }: { label: string; copyLabel: string; value: string }) {
  return (
    <button
      type="button"
      aria-label={copyLabel}
      onClick={() => void copyText(value)}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface/70 px-3 text-sm outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-focus"
    >
      <span className="text-xs text-muted">{label}</span>
      <bdi dir="ltr" className="num text-foreground">
        {value}
      </bdi>
      <Icon name="solar:copy-linear" size={16} className="text-muted" />
    </button>
  );
}

/**
 * Who the person is, at the top of the user card and of both edit screens: the photo, the name with the
 * caller's badges, then the @username and the Telegram id as chips that copy on tap. ``children`` sit under it.
 */
export function UserIdentity({ person, badges, children }: { person: Person; badges?: ReactNode; children?: ReactNode }) {
  const name = person.name || FALLBACK_NAME;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Photo id={person.id} name={name} />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 className="truncate text-lg font-bold text-foreground">
            <bdi>{name}</bdi>
          </h3>
          {badges ? <p className="flex flex-wrap items-center gap-2">{badges}</p> : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {person.username ? <IdChip label="یوزرنیم" copyLabel="کپی یوزرنیم" value={`@${person.username}`} /> : null}
        <IdChip label="آیدی" copyLabel="کپی آیدی عددی" value={String(person.telegram_id)} />
      </div>
      {children}
    </div>
  );
}
