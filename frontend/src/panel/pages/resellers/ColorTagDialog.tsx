"use client";

import { useState, type FormEvent } from "react";

import { run, usePending } from "../../core/actions";
import { useJson } from "../../core/data";
import { FormModal } from "../../ui/Fields";
import { Loadable } from "../../ui/States";
import { RiskTagPicker } from "../users/RiskTagChip";
import { FormActions } from "./Actions";
import type { ColorTagData } from "./types";

export const colorTagPath = (userId: number): string => `/api/panel/resellers/${userId}/color-tag`;

function TagForm({ data, onDone, onClose }: { data: ColorTagData; onDone: () => void; onClose?: () => void }) {
  const [tag, setTag] = useState(data.color_tag);
  const { pending, track } = usePending();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void track(async () => {
      const result = await run(`/resellers/${data.user_id}/color-tag`, { color_tag: tag }, { success: "تگ ریسک ذخیره شد" });
      if (result?.ok) {
        onDone();
        onClose?.();
      }
    });
  };
  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <p className="text-sm text-muted">تگ ریسک فقط برای اسکن سریع لیست است؛ کاربر نهایی آن را نمی‌بیند.</p>
      <RiskTagPicker tags={data.tags} value={tag} onChange={setTag} />
      <FormActions submitLabel="ذخیره تگ ریسک" pending={pending} onCancel={onClose} />
    </form>
  );
}

function TagBody({ userId, onDone, onClose }: { userId: number; onDone: () => void; onClose: () => void }) {
  const state = useJson<ColorTagData>(colorTagPath(userId));
  return (
    <Loadable state={state} rows={2}>
      {(data) => <TagForm data={data} onDone={onDone} onClose={onClose} />}
    </Loadable>
  );
}

/** The risk-tag picker of one shop owner; the server checks the shop is inside the staff member's scope. */
export function ColorTagDialog({ userId, name, onClose, onDone }: { userId: number | null; name: string; onClose: () => void; onDone: () => void }) {
  return (
    <FormModal isOpen={userId !== null} onOpenChange={(open) => !open && onClose()} title={`تگ ریسک ${name || "نماینده"}`} description="سطح ریسک کنار نام در لیست" size="md">
      {userId !== null ? <TagBody key={userId} userId={userId} onDone={onDone} onClose={onClose} /> : null}
    </FormModal>
  );
}

/** The same picker on the edit page, where the shop is already loaded. */
export function ColorTagPanel({ userId, current, tags, onDone }: { userId: number; current: string; tags: ColorTagData["tags"]; onDone: () => void }) {
  return <TagForm key={current} data={{ user_id: userId, name: "", color_tag: current, tags }} onDone={onDone} />;
}
