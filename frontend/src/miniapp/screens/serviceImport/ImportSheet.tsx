"use client";

import { Description, Input, Label, TextField } from "@heroui/react";
import { useState } from "react";

import { api, isUnknownOutcome } from "../../core/api";
import { failureText, useMini, type MiniContextValue } from "../../state/store";
import { ActionButton } from "../../ui/ActionButton";
import { IMPORT_PATH, LINK_MAX, type ImportReply } from "./importKit";

const IMPORT_KEY = "service-import";
const EMPTY_LINK = "لینک اشتراک را وارد کنید.";
const UNKNOWN_OUTCOME = "نتیجه مشخص نشد؛ فهرست سرویس‌ها دوباره خوانده شد. اگر سرویس اضافه نشده بود دوباره تلاش کنید.";

type FormProps = { close: () => void; onDone?: () => void };

function ImportForm({ close, onDone }: FormProps) {
  const { run, busy, notify, go, refreshAfterChange } = useMini();
  const [link, setLink] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    const value = link.trim();
    if (!value) {
      setError(EMPTY_LINK);
      return;
    }
    setError("");
    void run(IMPORT_KEY, async () => {
      let reply: ImportReply;
      try {
        reply = await api<ImportReply>(IMPORT_PATH, { method: "POST", body: { link: value } });
      } catch (err) {
        setError(failureText(err, UNKNOWN_OUTCOME));
        // A lost reply may still have added the service: read the state again, never retry on our own.
        if (isUnknownOutcome(err)) await refreshAfterChange();
        return;
      }
      close();
      notify(reply.message);
      onDone?.();
      if (reply.outcome === "pending_approval") return;
      await refreshAfterChange();
      go("services");
    });
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <TextField value={link} onChange={setLink} maxLength={LINK_MAX} autoFocus isInvalid={Boolean(error)}>
        <Label>لینک اشتراک</Label>
        <Input
          dir="ltr"
          className="ltr"
          placeholder="https://"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <Description>فقط سرویس‌هایی که زیر همین فروشگاه ساخته شده‌اند و به حساب دیگری وصل نیستند اضافه می‌شوند.</Description>
      </TextField>
      {error ? (
        <p role="alert" className="text-sm leading-6 text-danger">
          {error}
        </p>
      ) : null}
      <ActionButton type="submit" tone="ink" icon="solar:link-round-bold" fullWidth isPending={busy(IMPORT_KEY)}>
        افزودن سرویس
      </ActionButton>
    </form>
  );
}

/** Opens the «اتصال اشتراک قبلی» sheet; `onDone` runs once the server accepted the link. */
export function openImportSheet(mini: MiniContextValue, onDone?: () => void): void {
  if (!mini.commerce) return;
  mini.openSheet({ title: "اتصال اشتراک قبلی", render: (close) => <ImportForm close={close} onDone={onDone} /> });
}
