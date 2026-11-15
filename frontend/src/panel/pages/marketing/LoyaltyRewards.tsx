"use client";

import { useState } from "react";

import { run, usePending } from "../../core/actions";
import { fa } from "../../core/format";
import { FormGrid, TextInput, SelectInput, SwitchInput, TextAreaInput } from "../../ui/Fields";
import { EmptyBlock } from "../../ui/States";
import { DangerButton, EditorCard, EditorForm, IntroNote } from "./editor";
import { asOptions, inputValue } from "./format";
import type { Option, Reward } from "./types";

function CreateReward({ types, refresh }: { types: Option[]; refresh: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState(types[0]?.value ?? "");
  const [value, setValue] = useState("");
  const [cost, setCost] = useState("");
  const [order, setOrder] = useState("100");
  const [minToman, setMinToman] = useState("0");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [expires, setExpires] = useState("");
  const { pending, track } = usePending();

  const create = () =>
    track(async () => {
      const result = await run(
        "/loyalty/rewards/create",
        {
          name,
          description,
          reward_type: type,
          reward_value: value,
          points_cost: cost,
          sort_order: order,
          min_purchase_toman: minToman,
          max_discount_toman: maxDiscount,
          expires_days: expires,
        },
        { success: "جایزه ساخته شد.", refresh },
      );
      if (result?.ok) {
        setName("");
        setDescription("");
        setValue("");
        setCost("");
        setMaxDiscount("");
        setExpires("");
      }
    });

  return (
    <EditorCard title="افزودن جایزه" meta="جایزه جدید برای فروشگاه امتیاز ربات بسازید.">
      <EditorForm onSubmit={() => void create()} pending={pending} submitLabel="ایجاد جایزه">
        <TextInput label="نام" value={name} onChange={setName} required placeholder="مثلاً ۱۰ گیگ رایگان" />
        <TextAreaInput label="توضیح" value={description} onChange={setDescription} rows={2} />
        <FormGrid cols={3}>
          <SelectInput label="نوع" value={type} options={asOptions(types)} onChange={setType} />
          <TextInput type="number" label="مقدار" value={value} onChange={setValue} min={1} required />
          <TextInput type="number" label="هزینه (امتیاز)" value={cost} onChange={setCost} min={1} required />
          <TextInput type="number" label="ترتیب نمایش" value={order} onChange={setOrder} help="عدد کمتر = بالاتر در لیست ربات" />
        </FormGrid>
        <p className="text-sm text-muted">فقط برای تخفیف درصدی:</p>
        <FormGrid cols={3}>
          <TextInput type="number" label="حداقل خرید (تومان)" value={minToman} onChange={setMinToman} min={0} />
          <TextInput type="number" label="سقف تخفیف (تومان)" value={maxDiscount} onChange={setMaxDiscount} min={0} placeholder="اختیاری" />
          <TextInput type="number" label="انقضا (روز)" value={expires} onChange={setExpires} min={1} placeholder="اختیاری" />
        </FormGrid>
      </EditorForm>
    </EditorCard>
  );
}

function RewardCard({ reward, refresh }: { reward: Reward; refresh: () => void }) {
  const [name, setName] = useState(reward.name);
  const [description, setDescription] = useState(reward.description);
  const [value, setValue] = useState(inputValue(reward.reward_value));
  const [cost, setCost] = useState(inputValue(reward.points_cost));
  const [order, setOrder] = useState(inputValue(reward.sort_order));
  const [maxGlobal, setMaxGlobal] = useState(inputValue(reward.max_redemptions_global));
  const [maxUser, setMaxUser] = useState(inputValue(reward.max_redemptions_per_user));
  const [minToman, setMinToman] = useState(inputValue(reward.min_purchase_toman));
  const [maxDiscount, setMaxDiscount] = useState(inputValue(reward.max_discount_toman));
  const [expires, setExpires] = useState(inputValue(reward.expires_days));
  const [enabled, setEnabled] = useState(reward.enabled);
  const { pending, track } = usePending();
  const isDiscount = reward.reward_type === "discount_percent";

  const save = () =>
    track(() =>
      run(
        `/loyalty/rewards/${reward.id}/save`,
        {
          name,
          description,
          reward_value: value,
          points_cost: cost,
          sort_order: order,
          enabled,
          max_redemptions_global: maxGlobal,
          max_redemptions_per_user: maxUser,
          // The server only reads these for a percentage discount, as the old form only showed them there.
          ...(isDiscount ? { min_purchase_toman: minToman, max_discount_toman: maxDiscount, expires_days: expires } : {}),
        },
        { success: "جایزه ذخیره شد.", refresh },
      ),
    );

  const archive = () =>
    void run(`/loyalty/rewards/${reward.id}/archive`, {}, {
      ask: { title: "حذف جایزه", text: "این جایزه حذف شود؟ از لیست فعال‌ها خارج می‌شود.", confirmLabel: "حذف", tone: "danger" },
      success: "جایزه حذف شد.",
      refresh,
    });

  return (
    <EditorCard title={reward.name} meta={`${reward.type_label} · بازخرید: ${fa(reward.redemption_count)}`} enabled={reward.enabled}>
      <EditorForm onSubmit={() => void save()} pending={pending} submitLabel="ذخیره" extra={<DangerButton onPress={archive}>حذف</DangerButton>}>
        <TextInput label="نام" value={name} onChange={setName} required />
        <TextAreaInput label="توضیح" value={description} onChange={setDescription} rows={2} />
        <FormGrid cols={3}>
          <TextInput type="number" label="مقدار" value={value} onChange={setValue} min={1} />
          <TextInput type="number" label="هزینه" value={cost} onChange={setCost} min={1} />
          <TextInput type="number" label="ترتیب نمایش" value={order} onChange={setOrder} />
          <TextInput type="number" label="سقف کل" value={maxGlobal} onChange={setMaxGlobal} min={0} placeholder="نامحدود" />
          <TextInput type="number" label="سقف هر کاربر" value={maxUser} onChange={setMaxUser} min={0} placeholder="نامحدود" />
        </FormGrid>
        {isDiscount ? (
          <FormGrid cols={3}>
            <TextInput type="number" label="حداقل خرید" value={minToman} onChange={setMinToman} min={0} />
            <TextInput type="number" label="سقف تخفیف" value={maxDiscount} onChange={setMaxDiscount} min={0} />
            <TextInput type="number" label="انقضا (روز)" value={expires} onChange={setExpires} min={1} />
          </FormGrid>
        ) : null}
        <SwitchInput label="فعال" checked={enabled} onChange={setEnabled} />
      </EditorForm>
    </EditorCard>
  );
}

export function LoyaltyRewards({ rewards, types, refresh }: { rewards: Reward[]; types: Option[]; refresh: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <IntroNote title="جوایز">جوایزی که مشتری‌ها با امتیاز در ربات بازخرید می‌کنند.</IntroNote>
      <CreateReward types={types} refresh={refresh} />
      {rewards.length ? (
        rewards.map((reward) => <RewardCard key={`${reward.id}:${JSON.stringify(reward)}`} reward={reward} refresh={refresh} />)
      ) : (
        <EmptyBlock title="جایزه‌ای نیست." />
      )}
    </div>
  );
}
