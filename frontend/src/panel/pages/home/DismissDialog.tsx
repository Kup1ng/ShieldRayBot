"use client";

import { Button, Description, Label, Modal, Radio, RadioGroup } from "@heroui/react";
import { useState } from "react";

import { IconTile } from "@/components/ui/IconTile";

import { run, usePending } from "../../core/actions";

export type DismissTarget = { key: string; entity: string };
export type DismissMode = "24h" | "forever";

const OPTIONS: { mode: DismissMode; title: string; hint: string }[] = [
  { mode: "24h", title: "۲۴ ساعت", hint: "بعد از ۲۴ ساعت اگر هنوز برقرار باشد دوباره نمایش داده می‌شود" },
  {
    mode: "forever",
    title: "برای همیشه",
    hint: "تا وقتی مورد جدیدی اضافه نشود نمایش داده نمی‌شود؛ با برطرف شدن مشکل کاملاً حذف می‌شود",
  },
];

/**
 * Hide one inbox alert for a day or until it is resolved. Posts the existing /inbox/dismiss form
 * (alert_key, entity_id, mode, return_to) and tells the page to reload afterwards.
 */
export function DismissDialog({ target, onClose, onDone }: { target: DismissTarget | null; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<DismissMode>("24h");
  const { pending, track } = usePending();

  const submit = async () => {
    if (!target || pending) return;
    await track(async () => {
      const result = await run("/inbox/dismiss", {
        alert_key: target.key,
        entity_id: target.entity,
        mode,
        return_to: window.location.pathname + window.location.search,
      });
      if (result?.ok) {
        onClose();
        onDone();
      }
    });
  };

  return (
    <>
      <Modal.Backdrop
        isOpen={target !== null}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <Modal.Container size="sm">
          <Modal.Dialog aria-labelledby="inbox-dismiss-title">
            <Modal.CloseTrigger aria-label="بستن" />
            <Modal.Header>
              <IconTile icon="solar:bell-off-bold" tone="gray" size="lg" />
              <Modal.Heading id="inbox-dismiss-title">حذف اعلان</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <RadioGroup name="dismiss_choice" value={mode} onChange={(value) => setMode(value === "forever" ? "forever" : "24h")}>
                <Label>مدت مخفی‌سازی را انتخاب کنید، سپس تأیید کنید.</Label>
                {OPTIONS.map((option) => (
                  <Radio key={option.mode} value={option.mode}>
                    <Radio.Content>
                      <Radio.Control>
                        <Radio.Indicator />
                      </Radio.Control>
                      {option.title}
                    </Radio.Content>
                    <Description>{option.hint}</Description>
                  </Radio>
                ))}
              </RadioGroup>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline" onPress={onClose} isDisabled={pending}>
                انصراف
              </Button>
              <Button className="button--ink" onPress={() => void submit()} isPending={pending}>
                تأیید
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
