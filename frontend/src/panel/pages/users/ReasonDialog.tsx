"use client";

import { Label, TextArea, TextField } from "@heroui/react";
import { useState } from "react";

import type { ConfirmOptions } from "@/components/feedback/ConfirmHost";

import { FormModal } from "./FormModal";

export const REASON_MIN = 3;

export type ReasonRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  reasonLabel: string;
  tone?: ConfirmOptions["tone"];
  /** Longest accepted text (a delete reason is short, a message is not). */
  maxLength?: number;
  rows?: number;
  placeholder?: string;
  /** Runs with the typed reason; the dialog closes after it settles. */
  onConfirm: (reason: string) => Promise<void>;
};

function ReasonForm({ request, onClose }: { request: ReasonRequest; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const clean = reason.trim();
  const danger = request.tone === "danger";
  return (
    <FormModal
      open
      onClose={onClose}
      title={request.title}
      description={request.message}
      icon={danger ? "solar:danger-circle-bold" : "solar:danger-triangle-bold"}
      tone={danger ? "red" : "yellow"}
      submitLabel={request.confirmLabel}
      submitTone={danger ? "danger" : "ink"}
      pending={pending}
      canSubmit={clean.length >= REASON_MIN}
      onSubmit={async () => {
        setPending(true);
        try {
          await request.onConfirm(clean);
        } finally {
          setPending(false);
          onClose();
        }
      }}
    >
      <TextField value={reason} onChange={setReason} isRequired fullWidth>
        <Label>{request.reasonLabel}</Label>
        <TextArea rows={request.rows ?? 3} maxLength={request.maxLength ?? 200} placeholder={request.placeholder ?? `حداقل ${REASON_MIN} کاراکتر`} autoFocus />
      </TextField>
    </FormModal>
  );
}

/** A confirmation that also needs a typed reason (delete, bulk message text). */
export function ReasonDialog({ request, onClose }: { request: ReasonRequest | null; onClose: () => void }) {
  return request ? <ReasonForm key={request.title + request.message} request={request} onClose={onClose} /> : null;
}
