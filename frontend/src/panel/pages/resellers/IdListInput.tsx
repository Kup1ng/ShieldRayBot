"use client";

import { Button, Chip } from "@heroui/react";
import { useState } from "react";

import { Ltr } from "../../ui/Data";
import { TextInput } from "../../ui/Fields";
import { addId } from "./idList";

/** A list of Telegram ids as removable chips plus one box to add the next. */
export function IdListInput({ label, help, ids, onChange }: { label: string; help: string; ids: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    onChange(addId(ids, draft));
    setDraft("");
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <TextInput label={label} value={draft} onChange={setDraft} ltr placeholder="123456789" help={help} className="flex-1" />
        <Button type="button" variant="outline" className="!h-10" isDisabled={!draft.trim()} onPress={add}>
          افزودن
        </Button>
      </div>
      {ids.length ? (
        <ul className="flex flex-wrap gap-2" aria-label={label}>
          {ids.map((id) => (
            <li key={id}>
              <Chip size="sm" variant="soft">
                <Chip.Label>
                  <Ltr>{id}</Ltr>
                </Chip.Label>
                <button type="button" aria-label={`حذف ${id}`} className="ms-1 rounded-full px-1 text-muted outline-none hover:text-danger focus-visible:ring-2 focus-visible:ring-focus" onClick={() => onChange(ids.filter((x) => x !== id))}>
                  ×
                </button>
              </Chip>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
