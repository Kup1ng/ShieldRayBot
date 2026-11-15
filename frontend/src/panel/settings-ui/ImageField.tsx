"use client";

import { Button } from "@heroui/react";
import { useRef } from "react";

import { Icon } from "@/icons/Icon";

import { confirm } from "../core/confirm";
import type { ImageChanges } from "./logic";
import type { SettingField } from "./types";
import { useFilePreview } from "./useFilePreview";

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

type Props = {
  field: SettingField;
  images: ImageChanges;
  /** A chosen file, or null to drop the pending change (file and removal alike). */
  onPick: (file: File | null) => void;
  onClear: (cleared: boolean) => void;
};

/** An uploaded picture: the saved one or the one just chosen, replace, and remove after a confirmation. */
export function ImageField({ field, images, onPick, onClear }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const picked = images.files[field.key];
  const cleared = Boolean(images.cleared[field.key]);
  const pickedUrl = useFilePreview(picked);
  const shown = pickedUrl || (cleared ? "" : field.image_url || "");
  const hasSaved = Boolean(field.image_url) && !picked && !cleared;

  const removeSaved = async () => {
    const ok = await confirm("حذف فایل", { description: "فایل آپلودشده با ذخیرهٔ تنظیمات حذف شود؟", confirmLabel: "حذف فایل", tone: "danger" });
    if (ok) onClear(true);
  };

  return (
    <div className="flex flex-col gap-2">
      <strong className="text-sm font-medium text-foreground">{field.label}</strong>
      {shown ? <img src={shown} alt="پیش‌نمایش" className="max-h-40 w-fit max-w-full rounded-lg border border-border object-contain" /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept={IMAGE_ACCEPT}
          className="sr-only"
          aria-label={`آپلود ${field.label}`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onPick(file);
            event.target.value = "";
          }}
        />
        <Button size="sm" variant="outline" onPress={() => input.current?.click()}>
          <Icon name="solar:upload-linear" size={18} />
          {field.image_url || picked ? "آپلود عکس جدید" : "انتخاب فایل"}
        </Button>
        {picked ? <span className="text-xs text-muted">{picked.name}</span> : null}
        {picked || cleared ? (
          <Button size="sm" variant="ghost" onPress={() => onPick(null)}>
            انصراف از تغییر
          </Button>
        ) : null}
        {hasSaved ? (
          <Button size="sm" variant="ghost" className="text-danger" onPress={() => void removeSaved()}>
            حذف فایل آپلودشده
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted">{cleared ? "فایل با ذخیره حذف می‌شود." : "PNG، JPG، WEBP یا GIF"}</p>
      {field.help ? <p className="text-xs text-muted">{field.help}</p> : null}
    </div>
  );
}
