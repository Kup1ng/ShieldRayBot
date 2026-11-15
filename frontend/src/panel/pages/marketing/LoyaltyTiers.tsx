"use client";

import { useState } from "react";

import { run, usePending } from "../../core/actions";
import { fa } from "../../core/format";
import { FormGrid, TextInput, SwitchInput } from "../../ui/Fields";
import { EmptyBlock } from "../../ui/States";
import { EditorCard, EditorForm, IntroNote } from "./editor";
import { inputValue, multiplierText } from "./format";
import type { Tier } from "./types";

function TierCard({ tier, refresh }: { tier: Tier; refresh: () => void }) {
  const [name, setName] = useState(tier.name);
  const [min, setMin] = useState(inputValue(tier.min_points));
  const [max, setMax] = useState(inputValue(tier.max_points));
  const [bps, setBps] = useState(inputValue(tier.multiplier_bps));
  const [enabled, setEnabled] = useState(tier.enabled);
  const { pending, track } = usePending();

  const save = () =>
    track(() =>
      run(`/loyalty/tiers/${tier.id}/save`, { name, min_points: min, max_points: max, multiplier_bps: bps, enabled }, { success: "سطح ذخیره شد.", refresh }),
    );

  return (
    <EditorCard title={tier.name} enabled={tier.enabled}>
      <EditorForm onSubmit={() => void save()} pending={pending} submitLabel="ذخیره سطح">
        <TextInput label="نام" value={name} onChange={setName} required />
        <FormGrid cols={3}>
          <TextInput type="number" label="حداقل امتیاز" value={min} onChange={setMin} min={0} />
          <TextInput type="number" label="حداکثر (خالی=بدون سقف)" value={max} onChange={setMax} min={0} />
          <TextInput type="number" label="ضریب (bps)" value={bps} onChange={setBps} min={0} />
        </FormGrid>
        <SwitchInput label="فعال" checked={enabled} onChange={setEnabled} />
      </EditorForm>
    </EditorCard>
  );
}

function TierRow({ tier }: { tier: Tier }) {
  const range = tier.max_points === null ? `از ${fa(tier.min_points)}+` : `از ${fa(tier.min_points)} تا ${fa(tier.max_points)}`;
  return (
    <div className="inset-tile flex flex-wrap items-center justify-between gap-2 rounded-lg p-3">
      <strong className="text-sm text-foreground" dir="auto">
        {tier.name}
      </strong>
      <span className="text-xs text-muted">
        {range} · ضریب {multiplierText(tier.multiplier_bps)}
      </span>
    </div>
  );
}

export function LoyaltyTiers({ tiers, canEdit, refresh }: { tiers: Tier[]; canEdit: boolean; refresh: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <IntroNote title="سطوح باشگاه">
        {canEdit
          ? "بازه امتیاز و ضریب پاداش هر سطح را تنظیم کنید. ضریب بر حسب bps است (۱۰۰۰۰ = ۱×)."
          : "سطوح سراسری هستند و فقط ادمین اصلی می‌تواند آن‌ها را ویرایش کند."}
      </IntroNote>
      {tiers.length ? (
        tiers.map((tier) => (canEdit ? <TierCard key={`${tier.id}:${JSON.stringify(tier)}`} tier={tier} refresh={refresh} /> : <TierRow key={tier.id} tier={tier} />))
      ) : (
        <EmptyBlock title="سطحی تعریف نشده." />
      )}
    </div>
  );
}
