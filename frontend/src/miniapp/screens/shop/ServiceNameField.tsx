"use client";

import { FieldError, Input, Label, TextField } from "@heroui/react";

import { ActionButton } from "../../ui/ActionButton";
import { InsetBlock } from "./parts";
import { NAME_INPUT_MAX, NAME_RULES, randomServiceName, serviceNameProblem } from "./serviceName";

type ServiceNameFieldProps = {
  value: string;
  onChange: (value: string) => void;
  /** The order already carries its name (a payment was started); it cannot change any more. */
  locked: boolean;
  /** Show the rule that failed (after the customer tried to pay). */
  showProblem: boolean;
};

/** The required «نام سرویس» of a shop that makes the buyer name the service before paying. */
export function ServiceNameField({ value, onChange, locked, showProblem }: ServiceNameFieldProps) {
  const problem = showProblem ? serviceNameProblem(value) : null;
  return (
    <InsetBlock title="نام سرویس" labelId="shop-service-name" hint={locked ? "نام این سفارش ثبت شده است." : NAME_RULES}>
      <div className="flex items-end gap-2">
        <TextField
          className="min-w-0 flex-1"
          value={value}
          onChange={onChange}
          maxLength={NAME_INPUT_MAX}
          isDisabled={locked}
          isRequired
          isInvalid={Boolean(problem)}
          variant="secondary"
        >
          <Label className="text-xs text-muted">نام سرویس (الزامی)</Label>
          <Input dir="ltr" autoComplete="off" autoCapitalize="none" spellCheck={false} className="ltr" />
          <FieldError>{problem}</FieldError>
        </TextField>
        <ActionButton tone="neutral" size="md" icon="solar:refresh-linear" isDisabled={locked} onPress={() => onChange(randomServiceName())}>
          تصادفی
        </ActionButton>
      </div>
    </InsetBlock>
  );
}
