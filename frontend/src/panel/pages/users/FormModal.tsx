"use client";

import { Button, Modal } from "@heroui/react";
import type { FormEvent, ReactNode } from "react";

import { IconTile, type TileTone } from "@/components/ui/IconTile";

type FormModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  icon?: string;
  tone?: TileTone;
  children?: ReactNode;
  submitLabel: string;
  /** `danger` paints the submit button as a destructive one. */
  submitTone?: "ink" | "danger";
  cancelLabel?: string;
  pending?: boolean;
  /** Keeps the submit button off until the form is complete. */
  canSubmit?: boolean;
  onSubmit: () => void | Promise<void>;
  size?: "sm" | "md" | "lg";
};

/**
 * The panel's dialog for a short form: tile + title, the fields, then cancel and an ink submit.
 * Enter submits; closing (Esc, backdrop, cancel) throws nothing away on the server.
 */
export function FormModal({
  open,
  onClose,
  title,
  description,
  icon = "solar:pen-new-square-bold",
  tone = "purple",
  children,
  submitLabel,
  submitTone = "ink",
  cancelLabel = "انصراف",
  pending = false,
  canSubmit = true,
  onSubmit,
  size = "md",
}: FormModalProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || !canSubmit) return;
    void onSubmit();
  };
  return (
    <Modal.Backdrop isOpen={open} onOpenChange={(next) => !next && !pending && onClose()} variant="blur">
      <Modal.Container size={size} placement="center">
        <Modal.Dialog className="!rounded-xl">
          <Modal.CloseTrigger aria-label="بستن" />
          <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
            <Modal.Header className="!flex-row !items-center gap-3 pe-8">
              <IconTile icon={icon} tone={tone} size="lg" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <Modal.Heading className="!text-base font-semibold">{title}</Modal.Heading>
                {description ? <p className="text-sm text-muted">{description}</p> : null}
              </div>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4 py-2">{children}</Modal.Body>
            <Modal.Footer className="!flex-row !justify-end gap-3">
              <Button type="button" variant="outline" className="!h-10 min-w-24 !rounded-lg" isDisabled={pending} onPress={onClose}>
                {cancelLabel}
              </Button>
              <Button
                type="submit"
                variant={submitTone === "danger" ? "danger" : undefined}
                className={`${submitTone === "danger" ? "" : "button--ink "}!h-10 min-w-24 !rounded-lg`}
                isPending={pending}
                isDisabled={!canSubmit}
              >
                {submitLabel}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
