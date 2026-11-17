"use client";

import { Button } from "@heroui/react";
import { useState } from "react";

import { Icon } from "@/icons/Icon";

import { SwitchInput, TextInput } from "../ui/Fields";
import { parseChannels, serializeChannels, type ChannelRow } from "./logic";

/**
 * The channels a customer must join, edited as rows. The form carries them as the JSON the bot
 * reads; a row being typed (no id and no link yet) is kept in the editor and left out of the JSON.
 */
export function ChannelsField({ label, help, value, onChange }: { label: string; help?: string; value: string; onChange: (value: string) => void }) {
  // The rows live here so a half-typed one stays; the form gets the JSON of the complete ones.
  const [rows, setRows] = useState<ChannelRow[]>(() => parseChannels(value));
  const commit = (next: ChannelRow[]) => {
    setRows(next);
    onChange(serializeChannels(next));
  };
  const patch = (index: number, change: Partial<ChannelRow>) => commit(rows.map((row, i) => (i === index ? { ...row, ...change } : row)));
  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      {help ? <p className="text-xs text-muted">{help}</p> : null}
      {rows.map((row, index) => (
        <div key={index} className="inset-tile flex flex-col gap-3 rounded-lg p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="عنوان دکمه اینلاین" value={row.title} onChange={(title) => patch(index, { title })} placeholder="مثلاً کانال اخبار" help="متنی که روی دکمه عضویت در ربات دیده می‌شود" />
            <TextInput label="شناسه کانال" value={row.id} onChange={(id) => patch(index, { id })} ltr placeholder="@channel یا -100… یا t.me/c/…" help="برای تأیید عضویت: @username یا -100… — ربات باید ادمین کانال باشد" />
          </div>
          <TextInput label="لینک دکمه / دعوت" value={row.link} onChange={(link) => patch(index, { link })} ltr placeholder="https://t.me/+… یا t.me/channel" help="لینک روی دکمه اینلاین؛ کانال خصوصی حتماً لینک دعوت (+…) بگذارید" />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SwitchInput label="عضویت الزامی" checked={row.required} onChange={(required) => patch(index, { required })} />
            </div>
            <Button size="sm" variant="danger-soft" onPress={() => commit(rows.filter((_, i) => i !== index))} aria-label="حذف کانال">
              <Icon name="solar:trash-bin-minimalistic-linear" size={18} />
              حذف
            </Button>
          </div>
        </div>
      ))}
      <div>
        <Button size="sm" variant="outline" onPress={() => commit([...rows, { id: "", required: true, link: "", title: "" }])}>
          <Icon name="solar:add-circle-linear" size={18} />
          افزودن کانال
        </Button>
      </div>
    </fieldset>
  );
}
