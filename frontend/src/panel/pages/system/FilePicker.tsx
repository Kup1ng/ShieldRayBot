"use client";

import { useId, type ReactNode } from "react";

import { fa } from "../../core/format";

/** A file chooser that shows the picked name and size; the label and help are tied to the input. */
export function FilePicker({
  label,
  accept,
  file,
  onFile,
  help,
  required,
  disabled,
}: {
  label: ReactNode;
  accept: string;
  file: File | null;
  onFile: (file: File | null) => void;
  help?: ReactNode;
  required?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        type="file"
        accept={accept}
        required={required}
        disabled={disabled}
        aria-describedby={help ? `${id}-help` : undefined}
        onChange={(event) => onFile(event.currentTarget.files?.[0] ?? null)}
        className="block w-full min-w-0 cursor-pointer rounded-lg border border-dashed border-border bg-surface p-2 text-sm text-muted file:me-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-default file:px-4 file:py-2 file:text-sm file:font-medium file:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      />
      {file ? (
        <p className="text-xs text-muted">
          <bdi dir="ltr">{file.name}</bdi> · <span className="num">{fa(Math.max(1, Math.round(file.size / 1024)))}</span> کیلوبایت
        </p>
      ) : (
        <p className="text-xs text-muted">فایلی انتخاب نشده</p>
      )}
      {help ? (
        <p id={`${id}-help`} className="text-xs text-muted">
          {help}
        </p>
      ) : null}
    </div>
  );
}
