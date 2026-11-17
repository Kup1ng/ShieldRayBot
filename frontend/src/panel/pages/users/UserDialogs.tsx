"use client";

import { Input, Label, TextArea, TextField } from "@heroui/react";
import { useState } from "react";

import { confirm } from "../../core/confirm";
import { run } from "../../core/actions";
import { FormModal } from "./FormModal";
import { fa } from "../../core/format";
import { editIdFrom, FILTER_LABELS } from "./format";
import { RiskTagPicker } from "./RiskTagChip";
import type { RiskTag, UsersFilter } from "./types";

/** The list's filter and search, posted back so the handlers redirect to the same view. */
export type ListReturn = { filter: UsersFilter; q: string };

function returnFields({ filter, q }: ListReturn): Record<string, string> {
  return { return_filter: filter, ...(q ? { return_q: q } : {}) };
}

const MESSAGE_MAX = 2000;

function MessageForm({ target, listReturn, onClose, onDone }: { target: { id: number; name: string }; listReturn: ListReturn; onClose: () => void; onDone: () => void }) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <FormModal
      open
      onClose={onClose}
      title="پیام به کاربر"
      description="ارسال پیام مستقیم از پنل"
      icon="solar:chat-round-dots-bold"
      submitLabel="ارسال"
      pending={pending}
      canSubmit={body.trim().length > 0}
      onSubmit={async () => {
        setPending(true);
        const result = await run(`/users/${target.id}/message`, { body, ...returnFields(listReturn) }, { success: "پیام ارسال شد" });
        setPending(false);
        if (result?.ok) onClose();
        onDone();
      }}
    >
      <p className="text-sm text-muted">
        گیرنده: <bdi className="font-medium text-foreground">{target.name}</bdi>
      </p>
      <TextField value={body} onChange={setBody} isRequired fullWidth>
        <Label>متن پیام</Label>
        <TextArea rows={5} maxLength={MESSAGE_MAX} placeholder="پیام کوتاه پشتیبانی…" autoFocus />
      </TextField>
    </FormModal>
  );
}

/** One customer's direct message (the row action and the card button). */
export function MessageDialog({ target, listReturn, onClose, onDone }: { target: { id: number; name: string } | null; listReturn: ListReturn; onClose: () => void; onDone: () => void }) {
  return target ? <MessageForm key={target.id} target={target} listReturn={listReturn} onClose={onClose} onDone={onDone} /> : null;
}

export const BULK_MESSAGE_LIMIT = 40;

function BulkMessageForm({ count, listReturn, onClose, onDone }: { count: number; listReturn: ListReturn; onClose: () => void; onDone: () => void }) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <FormModal
      open
      onClose={onClose}
      title="پیام گروهی فیلتر"
      description="مدیریت کاربران فیلتر فعال"
      icon="solar:letter-bold"
      tone="blue"
      submitLabel="ارسال گروهی"
      pending={pending}
      canSubmit={body.trim().length > 0}
      onSubmit={async () => {
        const ok = await confirm("پیام به کاربران همین فیلتر ارسال شود؟", {
          description: `حداکثر ${fa(BULK_MESSAGE_LIMIT)} نفر`,
          confirmLabel: "ارسال گروهی",
          tone: "warning",
        });
        if (!ok) return;
        setPending(true);
        const result = await run("/users/bulk-message", { body, ...returnFields(listReturn) }, { success: "پیام گروهی ارسال شد" });
        setPending(false);
        if (result?.ok) onClose();
        onDone();
      }}
    >
      <p className="text-sm text-muted">
        فیلتر فعال: <strong className="text-foreground">{FILTER_LABELS[listReturn.filter]}</strong> · تا {fa(count)} گیرنده (سقف {fa(BULK_MESSAGE_LIMIT)})
      </p>
      <TextField value={body} onChange={setBody} isRequired fullWidth>
        <Label>متن پیام</Label>
        <TextArea rows={5} maxLength={MESSAGE_MAX} placeholder="مثلاً سرویس شما به‌زودی منقضی می‌شود…" autoFocus />
      </TextField>
    </FormModal>
  );
}

export function BulkMessageDialog({ open, count, listReturn, onClose, onDone }: { open: boolean; count: number; listReturn: ListReturn; onClose: () => void; onDone: () => void }) {
  return open ? <BulkMessageForm count={count} listReturn={listReturn} onClose={onClose} onDone={onDone} /> : null;
}

function CreateForm({ tags, listReturn, onClose, onDone }: { tags: RiskTag[]; listReturn: ListReturn; onClose: () => void; onDone: (editId: number | null) => void }) {
  const [telegramId, setTelegramId] = useState("");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [tag, setTag] = useState("green");
  const [pending, setPending] = useState(false);
  return (
    <FormModal
      open
      onClose={onClose}
      title="ساخت کاربر بات"
      description="مدیریت کاربر"
      icon="solar:user-plus-bold"
      submitLabel="ساخت کاربر"
      pending={pending}
      canSubmit={/^\d+$/.test(telegramId.trim())}
      onSubmit={async () => {
        const ok = await confirm("کاربر جدید با این شناسه تلگرام ساخته شود؟", { confirmLabel: "ساخت کاربر" });
        if (!ok) return;
        setPending(true);
        const result = await run("/users/create", { telegram_id: telegramId.trim(), username, full_name: fullName, ...(tags.length ? { color_tag: tag } : {}), ...returnFields(listReturn) }, { success: "کاربر جدید ساخته شد" });
        setPending(false);
        if (result?.ok) onClose();
        onDone(result?.ok ? editIdFrom(result.location) : null);
      }}
    >
      <p className="text-sm text-muted">کاربر با نقش «کاربر» ساخته می‌شود. اگر بعداً در ربات /start بزند، پروفایل تلگرام به‌روز می‌شود.</p>
      <TextField value={telegramId} onChange={setTelegramId} isRequired fullWidth>
        <Label>شناسه تلگرام (عددی)</Label>
        <Input dir="ltr" className="text-start" inputMode="numeric" placeholder="مثلاً 123456789" autoComplete="off" autoFocus />
        <p className="text-xs text-muted">همان عددی که در @userinfobot یا پروفایل تلگرام می‌بینید — نه @username</p>
      </TextField>
      <TextField value={username} onChange={setUsername} fullWidth>
        <Label>نام کاربری تلگرام</Label>
        <Input dir="ltr" className="text-start" maxLength={64} placeholder="@username (اختیاری)" autoComplete="off" />
      </TextField>
      <TextField value={fullName} onChange={setFullName} fullWidth>
        <Label>نام نمایشی</Label>
        <Input maxLength={255} placeholder="نام کامل (اختیاری)" autoComplete="off" />
      </TextField>
      {tags.length ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">تگ ریسک</span>
          <RiskTagPicker tags={tags} value={tag} onChange={setTag} />
        </div>
      ) : null}
    </FormModal>
  );
}

/** «کاربر جدید»: creates the identity, then the page opens its edit screen like the old modal did. */
export function CreateUserDialog({ open, tags, listReturn, onClose, onDone }: { open: boolean; tags: RiskTag[]; listReturn: ListReturn; onClose: () => void; onDone: (editId: number | null) => void }) {
  return open ? <CreateForm tags={tags} listReturn={listReturn} onClose={onClose} onDone={onDone} /> : null;
}
