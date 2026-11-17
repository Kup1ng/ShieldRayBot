"use client";

import { Radio, RadioGroup } from "@heroui/react";
import type { ReactNode } from "react";

export type Choice = {
  id: number;
  title: string;
  meta?: ReactNode;
  price?: ReactNode;
};

type ChoiceListProps = {
  label: string;
  items: Choice[];
  value: number | null;
  onChange: (id: number) => void;
  isDisabled?: boolean;
};

/** Radio rows on inset tiles (Figma "انتخاب حجم سرویس"): the chosen row gets an accent ring. */
export function ChoiceList({ label, items, value, onChange, isDisabled }: ChoiceListProps) {
  return (
    <RadioGroup
      aria-label={label}
      value={value === null ? "" : String(value)}
      onChange={(next) => onChange(Number(next))}
      isDisabled={isDisabled}
      className="gap-2"
    >
      {items.map((item) => (
        <Radio
          key={item.id}
          value={String(item.id)}
          className="inset-tile w-full rounded-lg border border-transparent p-3 data-[selected=true]:border-accent"
        >
          <Radio.Content className="w-full">
            <Radio.Control>
              <Radio.Indicator />
            </Radio.Control>
            <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-start">
              <span className="text-sm font-medium text-foreground">{item.title}</span>
              {item.meta ? <span className="text-xs text-muted">{item.meta}</span> : null}
            </span>
            {item.price ? <span className="shrink-0 text-sm text-foreground">{item.price}</span> : null}
          </Radio.Content>
        </Radio>
      ))}
    </RadioGroup>
  );
}
