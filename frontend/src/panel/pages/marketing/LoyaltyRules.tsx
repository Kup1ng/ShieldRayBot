"use client";

import { Button } from "@heroui/react";
import { useState } from "react";

import { run, usePending } from "../../core/actions";
import { FormGrid, TextInput, SelectInput, SwitchInput } from "../../ui/Fields";
import { EmptyBlock } from "../../ui/States";
import { EditorCard, EditorForm, IntroNote } from "./editor";
import { asOptions, inputValue } from "./format";
import type { Option, PointsRule } from "./types";

const AMOUNT_MODES: Option[] = [
  { value: "fixed", label: "مقدار ثابت" },
  { value: "per_gb", label: "به‌ازای هر گیگ" },
];

function RuleCard({ rule, refresh }: { rule: PointsRule; refresh: () => void }) {
  const [name, setName] = useState(rule.name);
  const [mode, setMode] = useState(rule.amount_mode);
  const [amount, setAmount] = useState(inputValue(rule.amount));
  const [maxReward, setMaxReward] = useState(inputValue(rule.max_reward));
  const [minToman, setMinToman] = useState(inputValue(rule.min_purchase_toman));
  const [minGb, setMinGb] = useState(inputValue(rule.min_purchase_gb));
  const [cooldown, setCooldown] = useState(inputValue(rule.cooldown_hours));
  const [enabled, setEnabled] = useState(rule.enabled);
  const [firstOnly, setFirstOnly] = useState(rule.first_time_only);
  const { pending, track } = usePending();

  const save = () =>
    track(() =>
      run(
        `/loyalty/rules/${rule.id}/save`,
        {
          name,
          amount_mode: mode,
          amount,
          max_reward: maxReward,
          min_purchase_toman: minToman,
          min_purchase_gb: minGb,
          cooldown_hours: cooldown,
          enabled,
          first_time_only: firstOnly,
        },
        { success: "قانون ذخیره شد.", refresh },
      ),
    );

  return (
    <EditorCard
      title={rule.event_label}
      enabled={rule.enabled}
      headAction={
        <Button size="sm" variant="ghost" onPress={() => void run(`/loyalty/rules/${rule.id}/toggle`, {}, { success: "وضعیت قانون تغییر کرد.", refresh })}>
          {rule.enabled ? "غیرفعال کردن" : "فعال کردن"}
        </Button>
      }
    >
      <EditorForm onSubmit={() => void save()} pending={pending} submitLabel="ذخیره قانون">
        <TextInput label="عنوان" value={name} onChange={setName} required />
        <FormGrid cols={3}>
          <SelectInput label="حالت محاسبه" value={mode} options={asOptions(AMOUNT_MODES)} onChange={setMode} />
          <TextInput type="number" label="مقدار امتیاز" value={amount} onChange={setAmount} min={0} />
          <TextInput type="number" label="حداکثر امتیاز" value={maxReward} onChange={setMaxReward} min={0} placeholder="بدون سقف" />
        </FormGrid>
        <FormGrid cols={3}>
          <TextInput type="number" label="حداقل مبلغ خرید (تومان)" value={minToman} onChange={setMinToman} min={0} />
          <TextInput type="number" label="حداقل حجم (گیگ)" value={minGb} onChange={setMinGb} min={0} />
          <TextInput type="number" label="کول‌داون (ساعت)" value={cooldown} onChange={setCooldown} min={0} />
        </FormGrid>
        <FormGrid>
          <SwitchInput label="فعال" checked={enabled} onChange={setEnabled} />
          <SwitchInput label="فقط بار اول" checked={firstOnly} onChange={setFirstOnly} />
        </FormGrid>
      </EditorForm>
    </EditorCard>
  );
}

export function LoyaltyRules({ rules, refresh }: { rules: PointsRule[]; refresh: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <IntroNote title="قوانین امتیاز">رویدادهای فعال به کاربر امتیاز می‌دهند. فقط بار اول، حداقل خرید و کول‌داون را در هر قانون تنظیم کنید.</IntroNote>
      {rules.length ? (
        // A reload with new values remounts the card so its fields show what was saved.
        rules.map((rule) => <RuleCard key={`${rule.id}:${JSON.stringify(rule)}`} rule={rule} refresh={refresh} />)
      ) : (
        <EmptyBlock title="قانونی تعریف نشده — با باز کردن صفحه، پیش‌فرض‌ها ایجاد می‌شوند." />
      )}
    </div>
  );
}
