"use client";

import { Segment } from "@heroui-pro/react";
import type { ReactNode } from "react";

/** Figma group: a neutral inset block with a short centred title. */
export function InsetBlock({
  title,
  hint,
  children,
  className = "",
  labelId,
}: {
  title?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  labelId?: string;
}) {
  return (
    <section aria-labelledby={title ? labelId : undefined} className={`inset-tile flex flex-col gap-3 rounded-lg p-4 ${className}`}>
      {title ? (
        <h2 id={labelId} className="text-center text-base font-semibold text-foreground">
          {title}
        </h2>
      ) : null}
      {hint ? <p className="text-center text-xs leading-5 text-muted">{hint}</p> : null}
      {children}
    </section>
  );
}

/** The admin's text about a plan or category: plain text with its line breaks, never markup. */
export function Description({ text, className = "" }: { text?: string | null; className?: string }) {
  const value = String(text ?? "").trim();
  if (!value) return null;
  return <p className={`text-xs leading-6 whitespace-pre-line text-muted ${className}`}>{value}</p>;
}

export type SegmentOption = { key: string; label: string };

/** Styles live in globals.css (`.segment--ink`): Tailwind reads "__" in arbitrary variants as spaces. */
const INK_SEGMENT = "segment--ink w-full";

/** Figma segmented choice: the selected segment is the dark "ink" pill. */
export function InkSegment({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: SegmentOption[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <Segment aria-label={label} size="lg" className={INK_SEGMENT} selectedKey={value} onSelectionChange={(key) => onChange(String(key))}>
      {options.map((option) => (
        <Segment.Item key={option.key} id={option.key}>
          {option.label}
        </Segment.Item>
      ))}
    </Segment>
  );
}

/** «label: value» summary line inside cards. */
export function SumRow({ label, children, strong }: { label: ReactNode; children: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 text-sm ${strong ? "font-semibold text-foreground" : "text-foreground/75"}`}>
      <span>{label}</span>
      <span className="text-end text-foreground">{children}</span>
    </div>
  );
}
