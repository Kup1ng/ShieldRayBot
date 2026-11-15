"use client";

import { Input, Label, TextArea, TextField } from "@heroui/react";
import { useState } from "react";

import { api, isUnknownOutcome } from "../../core/api";
import { invalidateResource } from "../../state/resources";
import { failureText, useMini, useSheetClose } from "../../state/store";
import { ActionButton } from "../../ui/ActionButton";
import { TICKET_NEW_UNKNOWN } from "./supportKit";

const SUBJECT_MAX = 120;
const BODY_MAX = 2000;
const BUSY_KEY = "ticket-new";

/** Sheet body: subject and message of a new ticket; on success the thread opens. */
export function NewTicketForm() {
  const { run, busy, notify, go } = useMini();
  const closeSheet = useSheetClose();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const submit = () =>
    run(BUSY_KEY, async () => {
      const cleanSubject = subject.trim();
      const cleanBody = body.trim();
      if (!cleanSubject || !cleanBody) {
        notify("موضوع و متن پیام را بنویسید", "err");
        return;
      }
      try {
        const res = await api<{ ticket_id: number; message?: string }>("/api/mini/support/tickets", {
          method: "POST",
          body: { subject: cleanSubject, body: cleanBody },
        });
        notify(res.message || "تیکت ثبت شد");
        invalidateResource("support");
        go("ticket", { ticketId: res.ticket_id });
      } catch (err) {
        notify(failureText(err, TICKET_NEW_UNKNOWN), "err");
        if (isUnknownOutcome(err)) {
          closeSheet();
          invalidateResource("support");
        }
      }
    });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <TextField fullWidth variant="secondary" value={subject} onChange={setSubject}>
        <Label>موضوع</Label>
        <Input maxLength={SUBJECT_MAX} autoComplete="off" />
      </TextField>
      <TextField fullWidth variant="secondary" value={body} onChange={setBody}>
        <Label>متن پیام</Label>
        <TextArea rows={5} maxLength={BODY_MAX} />
      </TextField>
      <ActionButton tone="ink" type="submit" fullWidth icon="solar:send-square-bold" isPending={busy(BUSY_KEY)}>
        ثبت تیکت
      </ActionButton>
    </form>
  );
}
