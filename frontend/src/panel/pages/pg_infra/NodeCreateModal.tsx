"use client";

import { Button } from "@heroui/react";
import { useState, type FormEvent } from "react";

import { run, usePending } from "../../core/actions";
import { digitsOnly } from "../../core/format";
import { FormGrid, FormModal, SelectInput, SubmitButton, TextAreaInput, TextInput } from "../../ui/Fields";

const CONNECTION_TYPES = [
  { id: "grpc", label: "grpc" },
  { id: "rest", label: "rest" },
];

type Draft = { name: string; address: string; port: string; connection_type: string; core_config_id: string; api_key: string; server_ca: string };

const EMPTY: Draft = { name: "", address: "", port: "", connection_type: "grpc", core_config_id: "", api_key: "", server_ca: "" };

function NodeForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const { pending, track } = usePending();
  const set = (patch: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim() || !draft.address.trim()) return;
    void track(async () => {
      const result = await run("/pg/nodes", { ...draft }, { success: "نود ساخته شد." });
      if (result?.ok) onDone();
    });
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <p className="text-sm text-muted">فیلدهای گواهی و کلید API را از پنل پاسارگارد / نود کپی کنید.</p>
      <FormGrid>
        <TextInput label="نام" value={draft.name} onChange={(name) => set({ name })} required placeholder="DE node" />
        <TextInput label="آدرس" value={draft.address} onChange={(address) => set({ address })} required ltr placeholder="192.168.1.1" />
        <TextInput label="پورت" value={draft.port} onChange={(port) => set({ port: digitsOnly(port) })} ltr placeholder="62050" />
        <SelectInput label="نوع اتصال" value={draft.connection_type} onChange={(connection_type) => set({ connection_type })} options={CONNECTION_TYPES} />
        <TextInput label="شناسه هسته (core_config_id)" value={draft.core_config_id} onChange={(core_config_id) => set({ core_config_id: digitsOnly(core_config_id) })} ltr placeholder="1" />
        <TextInput label="API Key" type="password" value={draft.api_key} onChange={(api_key) => set({ api_key })} ltr />
      </FormGrid>
      <TextAreaInput label="Server CA" value={draft.server_ca} onChange={(server_ca) => set({ server_ca })} rows={4} help="گواهی سرور نود را کامل، از BEGIN تا END، جای‌گذاری کنید." />
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pending={pending}>ساخت نود</SubmitButton>
        <Button variant="outline" onPress={onCancel}>
          انصراف
        </Button>
      </div>
    </form>
  );
}

/** Create a node on the panel (the fields the old form posted). The form starts empty each time it opens. */
export function NodeCreateModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  return (
    <FormModal isOpen={open} onOpenChange={(next) => !next && onClose()} title="ساخت نود" description="نود جدید پاسارگارد">
      {open ? (
        <NodeForm
          onCancel={onClose}
          onDone={() => {
            onClose();
            onCreated();
          }}
        />
      ) : null}
    </FormModal>
  );
}
