"use client";

import { Button } from "@heroui/react";

import { SubmitButton } from "../../ui/Fields";

/** The end of a form: the ink submit button and an outline cancel. */
export function FormActions({ submitLabel, pending, disabled, onCancel, cancelLabel = "انصراف" }: { submitLabel: string; pending?: boolean; disabled?: boolean; onCancel?: () => void; cancelLabel?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SubmitButton pending={pending} isDisabled={disabled}>
        {submitLabel}
      </SubmitButton>
      {onCancel ? (
        <Button type="button" variant="outline" className="!h-12 !rounded-lg" onPress={onCancel}>
          {cancelLabel}
        </Button>
      ) : null}
    </div>
  );
}
