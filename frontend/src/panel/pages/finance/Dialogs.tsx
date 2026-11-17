"use client";

import { Button, Checkbox, Label, Modal, TextArea, TextField } from "@heroui/react";
import { useState } from "react";

import { run } from "../../core/actions";
import { fa } from "../../core/format";
import { Ltr } from "../../ui/Data";
import { faId } from "./format";

/** The receipt image of one payment, fetched by the browser from the existing proxy route. */
export function ReceiptDialog({ paymentId, onClose }: { paymentId: number | null; onClose: () => void }) {
  const [failed, setFailed] = useState<number | null>(null);
  return (
    <Modal.Backdrop isOpen={paymentId !== null} onOpenChange={(open) => !open && onClose()} variant="blur">
      <Modal.Container size="lg" scroll="inside">
        <Modal.Dialog aria-label="رسید پرداخت">
          <Modal.CloseTrigger aria-label="بستن" />
          <Modal.Header>
            <Modal.Heading>رسید پرداخت</Modal.Heading>
            <p className="text-sm text-muted">بررسی و تأیید رسید</p>
          </Modal.Header>
          <Modal.Body>
            {paymentId !== null ? (
              failed === paymentId ? (
                <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                  دریافت رسید ممکن نشد؛ دسترسی یا توکن ربات را بررسی کنید.
                </p>
              ) : (
                // The receipt is a private image behind the panel session; no framework image loader applies.
                <img src={`/payments/${paymentId}/receipt`} alt="رسید پرداخت" className="mx-auto max-h-[70vh] w-auto max-w-full rounded-lg object-contain" onError={() => setFailed(paymentId)} />
              )
            ) : null}
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

export type VoidTarget = { id: number; amount: number; isTopup: boolean };

function VoidForm({ target, onClose, onDone }: { target: VoidTarget; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState(false);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!reason.trim() || pending) return;
    setPending(true);
    const result = await run(`/payments/${target.id}/void`, { reason: reason.trim(), refund_to_wallet: !target.isTopup && refund }, { refresh: onDone });
    setPending(false);
    if (result?.ok) onClose();
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <p className="text-sm text-muted">
        پرداخت <Ltr>#{faId(target.id)}</Ltr> — <Ltr>{fa(target.amount)}</Ltr> تومان
      </p>
      <TextField isRequired value={reason} onChange={setReason}>
        <Label>دلیل ابطال</Label>
        <TextArea rows={3} maxLength={500} />
      </TextField>
      {target.isTopup ? (
        <p className="text-sm text-muted">مبلغ شارژ از کیف پول مشتری کم می‌شود؛ اگر مشتری آن را خرج کرده باشد ابطال انجام نمی‌شود.</p>
      ) : (
        <Checkbox isSelected={refund} onChange={setRefund}>
          <Checkbox.Content>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            مبلغ پرداخت به کیف پول مشتری برگردد
          </Checkbox.Content>
        </Checkbox>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onPress={onClose}>
          انصراف
        </Button>
        <Button type="submit" variant="danger" isPending={pending} isDisabled={!reason.trim()}>
          ابطال پرداخت
        </Button>
      </div>
    </form>
  );
}

/** Void an approved payment: the reason is required, the stopped service is explained up front. */
export function VoidDialog({ target, onClose, onDone }: { target: VoidTarget | null; onClose: () => void; onDone: () => void }) {
  return (
    <Modal.Backdrop isOpen={target !== null} onOpenChange={(open) => !open && onClose()} variant="blur">
      <Modal.Container size="md" scroll="inside">
        <Modal.Dialog aria-label="ابطال پرداخت تأییدشده">
          <Modal.CloseTrigger aria-label="بستن" />
          <Modal.Header>
            <Modal.Heading>ابطال پرداخت تأییدشده</Modal.Heading>
            <p className="text-sm text-muted">سرویس مربوط به این پرداخت غیرفعال می‌شود</p>
          </Modal.Header>
          <Modal.Body>{target ? <VoidForm key={target.id} target={target} onClose={onClose} onDone={onDone} /> : null}</Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
