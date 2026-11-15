"use client";

import { useState, type FormEvent } from "react";

import { FormModal, TextAreaInput } from "../../ui/Fields";
import { FormActions } from "./Actions";

export const REASON_MIN = 3;
const REASON_MAX = 200;

export type ReasonRequest = {
  title: string;
  /** What will happen, shown above the reason box (the old confirmation text). */
  text: string;
  reasonLabel: string;
  confirmLabel: string;
  /** Runs with the typed reason; the dialog closes after it settles. */
  onConfirm: (reason: string) => Promise<unknown>;
};

function ReasonForm({ request, onClose }: { request: ReasonRequest; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const clean = reason.trim();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (clean.length < REASON_MIN || pending) return;
    setPending(true);
    try {
      await request.onConfirm(clean);
    } finally {
      setPending(false);
      onClose();
    }
  };

  return (
    <FormModal isOpen onOpenChange={(open) => !open && onClose()} title={request.title} description={request.text} size="md">
      <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <TextAreaInput label={request.reasonLabel} value={reason.slice(0, REASON_MAX)} onChange={setReason} rows={3} help={`حداقل ${REASON_MIN.toLocaleString("fa-IR")} کاراکتر؛ برای کاربر ارسال می‌شود.`} />
        <FormActions submitLabel={request.confirmLabel} pending={pending} disabled={clean.length < REASON_MIN} onCancel={onClose} />
      </form>
    </FormModal>
  );
}

/** A destructive confirmation that also needs a typed reason (delete reseller, delete user). */
export function ReasonDialog({ request, onClose }: { request: ReasonRequest | null; onClose: () => void }) {
  return request ? <ReasonForm key={request.title + request.text} request={request} onClose={onClose} /> : null;
}
