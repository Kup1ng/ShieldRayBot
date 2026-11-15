"use client";

import { Chip } from "@heroui/react";
import { useId, type KeyboardEvent } from "react";

import { Icon } from "@/icons/Icon";

export type PayMethodOption = {
  id: string;
  label: string;
  icon: string;
  /** e.g. the wallet's «کافی/ناکافی» chip. */
  chip?: { text: string; tone: "success" | "danger" };
  hint?: string;
  disabled?: boolean;
};

/** Bot button labels often start with emoji; the method rows carry their own icon instead. */
export function plainLabel(label: string): string {
  return label.replace(/[\p{Extended_Pictographic}️‍]/gu, "").replace(/\s{2,}/g, " ").trim() || label;
}

type PayMethodsProps = {
  title?: string;
  options: PayMethodOption[];
  value: string | null;
  onChange: (id: string) => void;
};

/**
 * Figma «روش پرداخت»: one row per way to pay. The chosen row is the filled purple row; the
 * others are outlined. A radio group, so arrow keys move between methods.
 */
export function PayMethods({ title = "روش پرداخت", options, value, onChange }: PayMethodsProps) {
  const titleId = useId();
  const enabled = options.filter((o) => !o.disabled);

  const onKey = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const i = enabled.findIndex((o) => o.id === id);
    const step = event.key === "ArrowDown" || event.key === "ArrowLeft" ? 1 : -1;
    const next = enabled[(i + step + enabled.length) % enabled.length];
    if (next) onChange(next.id);
  };

  return (
    <section className="inset-tile flex flex-col gap-3 rounded-lg p-2 pt-4" aria-labelledby={titleId}>
      <h2 id={titleId} className="text-center text-base font-medium text-foreground">
        {title}
      </h2>
      <div role="radiogroup" aria-labelledby={titleId} className="flex flex-col gap-2">
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={option.disabled}
              tabIndex={selected || (!value && option === enabled[0]) ? 0 : -1}
              onClick={() => onChange(option.id)}
              onKeyDown={(event) => onKey(event, option.id)}
              className={`flex min-h-12 w-full cursor-[var(--cursor-interactive)] items-center gap-2 rounded-lg border p-1.5 ps-1.5 pe-2 text-start outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? "border-accent bg-accent text-accent-foreground shadow-[var(--mouve-accent-fill-shadow)]"
                  : "border-accent/45 bg-surface text-foreground"
              }`}
            >
              <span aria-hidden className={`inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] ${selected ? "bg-white text-accent" : "bg-accent text-accent-foreground"}`}>
                <Icon name={option.icon} size={22} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">{plainLabel(option.label)}</span>
                {option.hint ? <span className={`text-xs ${selected ? "text-white/80" : "text-muted"}`}>{option.hint}</span> : null}
              </span>
              {option.chip ? (
                <Chip size="sm" variant={selected ? "secondary" : "soft"} color={option.chip.tone} className="shrink-0">
                  <Icon name={option.chip.tone === "success" ? "solar:check-read-linear" : "solar:close-circle-linear"} size={14} />
                  <Chip.Label>{option.chip.text}</Chip.Label>
                </Chip>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
