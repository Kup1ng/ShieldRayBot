"use client";

import { Button, Chip, Description, Input, Label, TextField } from "@heroui/react";
import { useState } from "react";

import { Icon } from "@/icons/Icon";

import { addAddresses } from "./forms";

/** One address per chip: type or paste (comma or newline separated) and press Enter or «افزودن». */
export function AddressListInput({ label, value, onChange, help, placeholder }: { label: string; value: string[]; onChange: (next: string[]) => void; help?: string; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    if (!draft.trim()) return;
    onChange(addAddresses(value, draft));
    setDraft("");
  };
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <TextField value={draft} onChange={setDraft} className="min-w-0">
        <Label>{label}</Label>
        <div className="flex items-center gap-2">
          <Input
            dir="ltr"
            className="min-w-0 flex-1 text-start"
            placeholder={placeholder}
            autoComplete="off"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              }
            }}
            // A pasted list becomes chips at once; leaving the field with text keeps it too.
            onBlur={commit}
          />
          <Button type="button" variant="outline" className="!h-10 shrink-0" onPress={commit}>
            افزودن
          </Button>
        </div>
        {help ? <Description>{help}</Description> : null}
      </TextField>
      {value.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="آدرس‌های افزوده‌شده">
          {value.map((address) => (
            <li key={address}>
              <Chip size="md" variant="soft">
                <Chip.Label>
                  <bdi dir="ltr">{address}</bdi>
                </Chip.Label>
                <button type="button" aria-label={`حذف ${address}`} className="ms-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus" onClick={() => onChange(value.filter((item) => item !== address))}>
                  <Icon name="solar:close-circle-linear" size={16} />
                </button>
              </Chip>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
