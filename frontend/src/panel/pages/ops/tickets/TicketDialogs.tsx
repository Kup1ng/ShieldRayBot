"use client";

/** The ticket dialogs: new ticket, a panel ticket's thread, and a customer's Telegram ticket. */

import { Button } from "@heroui/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Icon } from "@/icons/Icon";

import { run, usePending } from "../../../core/actions";
import { formatDateTime } from "../../../core/format";
import { useJson } from "../../../core/data";
import { usePanelSession } from "../../../core/session";
import { StatusChip } from "../../../ui/Data";
import { FormModal, SelectInput, SubmitButton, TextAreaInput, TextInput } from "../../../ui/Fields";
import { ErrorBlock, LoadingBlock } from "../../../ui/States";
import type { BotTicketDetail, Choice, PanelTicketDetail } from "../types";

const ATTACHMENT_MAX_BYTES = 12 * 1024 * 1024;
const ATTACHMENT_ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.csv,.log,image/*";
const SUBJECT_MIN = 3;
const SUBJECT_MAX = 255;
const NORMAL_PRIORITY = "normal";

/** The ticket id a handler's redirect points at (`/tickets?view=12`), if any. */
export function ticketFromLocation(location: string | undefined, key: "view" | "tg"): number | null {
  if (!location) return null;
  const value = Number(new URLSearchParams(location.split("?")[1] ?? "").get(key));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function AttachmentPicker({ file, onChange, error }: { file: File | null; onChange: (file: File | null) => void; error: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-1.5">
      <strong className="text-sm font-medium text-foreground">پیوست (اختیاری)</strong>
      <input
        ref={input}
        type="file"
        accept={ATTACHMENT_ACCEPT}
        className="sr-only"
        aria-label="انتخاب پیوست"
        onChange={(event) => {
          onChange(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onPress={() => input.current?.click()}>
          <Icon name="solar:paperclip-linear" size={18} />
          انتخاب فایل
        </Button>
        <span className="text-xs text-muted">{file ? file.name : "فایلی انتخاب نشده"}</span>
        {file ? (
          <Button size="sm" variant="ghost" onPress={() => onChange(null)}>
            حذف
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted">تصویر، PDF، ZIP، متن یا آفیس — تا ۱۲ مگابایت</p>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function checkAttachment(file: File | null): string {
  return file && file.size > ATTACHMENT_MAX_BYTES ? "حجم فایل حداکثر ۱۲ مگابایت است." : "";
}

export function NewTicketDialog({ open, priorities, onClose, onCreated }: { open: boolean; priorities: Choice[]; onClose: () => void; onCreated: (ticketId: number | null) => void }) {
  const [subject, setSubject] = useState("");
  const [priority, setPriority] = useState(NORMAL_PRIORITY);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const { pending, track } = usePending();
  const submit = () =>
    track(async () => {
      const problem = subject.trim().length < SUBJECT_MIN ? "موضوع حداقل ۳ کاراکتر باشد." : !body.trim() && !file ? "متن پیام یا فایل پیوست لازم است." : checkAttachment(file);
      setError(problem);
      if (problem) return;
      const result = await run("/tickets/panel/create", { subject: subject.trim(), priority, body, attachment: file }, { success: "تیکت ثبت شد." });
      if (result?.ok) {
        setSubject("");
        setBody("");
        setFile(null);
        onCreated(ticketFromLocation(result.location, "view"));
      } else if (result) {
        setError(result.message);
      }
    });
  return (
    <FormModal isOpen={open} onOpenChange={(next) => !next && onClose()} title="تیکت جدید" description="گفتگو و وضعیت تیکت">
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <TextInput label="موضوع" value={subject} onChange={setSubject} required maxLength={SUBJECT_MAX} placeholder="مثلاً مشکل اتصال به نود" />
        <SelectInput label="اولویت" value={priority} onChange={setPriority} options={priorities.map((p) => ({ id: p.value, label: p.label }))} />
        <TextAreaInput label="متن پیام" value={body} onChange={setBody} rows={5} help="متن یا فایل پیوست — حداقل یکی لازم است" />
        <AttachmentPicker file={file} onChange={setFile} error={error && error.includes("حجم") ? error : ""} />
        {error && !error.includes("حجم") ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" className="!h-12 !rounded-lg" onPress={onClose}>
            انصراف
          </Button>
          <SubmitButton pending={pending}>ثبت تیکت</SubmitButton>
        </div>
      </form>
    </FormModal>
  );
}

function MessageCard({ mine, label, time, body, children }: { mine: boolean; label: string; time: string | null; body: string; children?: ReactNode }) {
  return (
    <article className={`flex max-w-[92%] flex-col gap-1 rounded-xl px-3 py-2 ${mine ? "self-start bg-accent-soft" : "self-end bg-surface-secondary"}`}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <strong className="text-sm text-foreground">{label}</strong>
        <span className="num text-xs text-muted" dir="ltr">
          {formatDateTime(time)}
        </span>
      </header>
      {/* Customer text: shown as plain text only, line breaks kept. */}
      {body ? <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{body}</p> : null}
      {children}
    </article>
  );
}

function Thread({ children, hidden }: { children: ReactNode; hidden: number }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  });
  return (
    <div className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto rounded-lg border border-border p-3" role="log" aria-label="گفتگو">
      {hidden ? <p className="text-center text-xs text-muted">{hidden.toLocaleString("fa-IR")} پیام قدیمی‌تر نمایش داده نمی‌شود.</p> : null}
      {children}
      <div ref={end} />
    </div>
  );
}

function ReplyForm({ label, path, canAttach, onSent, required }: { label: string; path: string; canAttach: boolean; onSent: () => void; required?: boolean }) {
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const { pending, track } = usePending();
  const send = () =>
    track(async () => {
      const problem = !body.trim() && !file ? (required ? "متن پاسخ خالی است." : "متن پیام یا فایل پیوست لازم است.") : checkAttachment(file);
      setError(problem);
      if (problem) return;
      const result = await run(path, { body, attachment: file }, { success: "پاسخ ثبت شد." });
      if (result?.ok) {
        setBody("");
        setFile(null);
      }
      if (result) onSent();
    });
  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <TextAreaInput label={label} value={body} onChange={setBody} rows={3} />
      {canAttach ? <AttachmentPicker file={file} onChange={setFile} error="" /> : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <SubmitButton pending={pending}>ارسال پاسخ</SubmitButton>
      </div>
    </form>
  );
}

export function PanelTicketDialog({ ticketId, onClose, onChanged }: { ticketId: number | null; onClose: () => void; onChanged: () => void }) {
  const state = useJson<PanelTicketDetail>(ticketId ? `/api/panel/tickets/${ticketId}` : null);
  const { refresh } = usePanelSession();
  const data = state.data;
  const [status, setStatus] = useState("");
  const wasUnread = data?.was_unread;
  useEffect(() => {
    // Opening a ticket clears its unread mark; the list and the sidebar dot follow.
    if (wasUnread) {
      onChanged();
      void refresh();
    }
    // Only a freshly opened ticket matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wasUnread, data?.id]);
  const changed = () => {
    state.reload();
    onChanged();
    void refresh();
  };
  const saveStatus = async () => {
    const result = await run(`/tickets/panel/${ticketId}/status`, { status: status || data?.status }, { success: "وضعیت تیکت به‌روز شد." });
    if (result) changed();
  };
  const close = async () => {
    const result = await run(`/tickets/panel/${ticketId}/status`, { status: "closed" }, { ask: { title: "بستن تیکت", text: "تیکت بسته شود؟", confirmLabel: "بستن تیکت", tone: "warning" }, success: "تیکت بسته شد." });
    if (result) changed();
  };
  return (
    <FormModal isOpen={ticketId !== null} onOpenChange={(next) => !next && onClose()} title={data ? `تیکت #${data.id.toLocaleString("fa-IR")}` : "تیکت"} description={data ? <span dir="auto">{data.subject}</span> : undefined} size="lg">
      {!data ? (
        state.status === "error" ? <ErrorBlock message={state.message} onRetry={state.reload} /> : <LoadingBlock rows={4} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip color={data.priority_color}>اولویت: {data.priority_label}</StatusChip>
            <StatusChip color={data.status_color}>{data.status_label}</StatusChip>
            {data.can_set_status ? <span className="text-sm text-muted">از <span dir="auto">{data.opener_label || "—"}</span></span> : null}
          </div>
          <Thread hidden={data.hidden_earlier}>
            {data.messages.map((message) => (
              <MessageCard key={message.id} mine={message.from_owner} label={message.sender_label} time={message.created_at} body={message.body}>
                {message.attachment ? (
                  <a href={message.attachment.url} rel="noopener" className="inline-flex items-center gap-1.5 text-sm text-accent">
                    <Icon name="solar:paperclip-linear" size={16} />
                    {message.attachment.name || "دانلود پیوست"}
                  </a>
                ) : null}
              </MessageCard>
            ))}
          </Thread>
          {data.can_reply ? <ReplyForm label="پاسخ" path={`/tickets/panel/${data.id}/reply`} canAttach onSent={changed} /> : <p className="text-sm text-muted">این تیکت بسته شده است.</p>}
          {data.can_set_status ? (
            <div className="flex flex-wrap items-end gap-3">
              <SelectInput label="وضعیت" value={status || data.status} onChange={setStatus} options={data.statuses.map((s) => ({ id: s.value, label: s.label }))} className="min-w-48" />
              <Button variant="outline" className="!h-10" onPress={() => void saveStatus()}>
                ذخیره وضعیت
              </Button>
            </div>
          ) : data.can_close ? (
            <div>
              <Button variant="ghost" onPress={() => void close()}>
                بستن تیکت
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </FormModal>
  );
}

export function BotTicketDialog({ ticketId, onClose, onChanged }: { ticketId: number | null; onClose: () => void; onChanged: () => void }) {
  const state = useJson<BotTicketDetail>(ticketId ? `/api/panel/tickets/bot/${ticketId}` : null);
  const data = state.data;
  const changed = () => {
    state.reload();
    onChanged();
  };
  const close = async () => {
    const result = await run(`/tickets/bot/${ticketId}/close`, {}, { ask: { title: "بستن تیکت", text: "تیکت بسته شود؟", confirmLabel: "بستن تیکت", tone: "warning" }, success: "تیکت کاربر بسته شد." });
    if (result) changed();
  };
  return (
    <FormModal isOpen={ticketId !== null} onOpenChange={(next) => !next && onClose()} title={data ? `تیکت ربات #${data.id.toLocaleString("fa-IR")}` : "تیکت ربات"} description={data ? <span dir="auto">{data.subject}</span> : undefined} size="lg">
      {!data ? (
        state.status === "error" ? <ErrorBlock message={state.message} onRetry={state.reload} /> : <LoadingBlock rows={4} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip color={data.status_color}>{data.status_label}</StatusChip>
            <span className="text-sm text-muted">
              کاربر:{" "}
              {data.user_known ? (
                <a href={`/users?uid=${data.user_id}`} dir="auto" className="text-accent">
                  {data.user_label}
                </a>
              ) : (
                <span dir="auto">{data.user_label}</span>
              )}
            </span>
          </div>
          <Thread hidden={data.hidden_earlier}>
            {data.messages.length ? data.messages.map((message) => <MessageCard key={message.id} mine={message.from_staff} label={message.from_staff ? "پشتیبانی" : "کاربر"} time={message.created_at} body={message.body} />) : <p className="text-sm text-muted">پیامی ثبت نشده.</p>}
          </Thread>
          {data.can_reply ? (
            <>
              <ReplyForm label="پاسخ (ارسال به تلگرام کاربر)" path={`/tickets/bot/${data.id}/reply`} canAttach={false} onSent={changed} required />
              <div>
                <Button variant="ghost" onPress={() => void close()}>
                  بستن تیکت
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">این تیکت بسته شده است.</p>
          )}
        </div>
      )}
    </FormModal>
  );
}
