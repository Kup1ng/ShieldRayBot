"use client";

import { Alert, Button, Table, Tooltip } from "@heroui/react";
import { useState } from "react";

import { Icon } from "@/icons/Icon";

import { run, usePending } from "../../core/actions";
import { fa } from "../../core/format";
import { Ltr, StatusChip } from "../../ui/Data";
import { FormGrid, TextInput, SelectInput, SwitchInput } from "../../ui/Fields";
import { EmptyBlock } from "../../ui/States";
import { DangerButton, EditorCard, EditorForm, IntroNote } from "./editor";
import { asOptions, inputValue, moveItem } from "./format";
import type { WheelPrize, WheelSettings, WheelSpin } from "./types";

function IconButton({ label, icon, onPress }: { label: string; icon: string; onPress: () => void }) {
  return (
    <Tooltip delay={600}>
      <Button isIconOnly size="sm" variant="ghost" aria-label={label} onPress={onPress}>
        <Icon name={icon} size={18} />
      </Button>
      <Tooltip.Content>
        <p>{label}</p>
      </Tooltip.Content>
    </Tooltip>
  );
}

type SubmenuProps = {
  active: string[];
  hidden: string[];
  labels: Record<string, string>;
  onChange: (active: string[], hidden: string[]) => void;
};

/** Order and visibility of the club buttons in the bot: a hidden button is not shown there. */
function SubmenuOrder({ active, hidden, labels, onChange }: SubmenuProps) {
  const name = (key: string) => labels[key] ?? key;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="inset-tile flex flex-col gap-2 rounded-lg p-3">
        <h5 className="text-sm font-semibold text-foreground">فعال در زیرمنو</h5>
        {active.map((key, index) => (
          <div key={key} className="flex items-center justify-between gap-2 rounded-lg bg-surface/60 px-3 py-2">
            <span className="flex min-w-0 flex-col">
              <strong className="text-sm text-foreground">{name(key)}</strong>
              <bdi dir="ltr" className="text-xs text-muted">
                {key}
              </bdi>
            </span>
            <span className="flex shrink-0">
              <IconButton label={`بالا بردن ${name(key)}`} icon="solar:alt-arrow-up-linear" onPress={() => onChange(moveItem(active, index, -1), hidden)} />
              <IconButton label={`پایین بردن ${name(key)}`} icon="solar:alt-arrow-down-linear" onPress={() => onChange(moveItem(active, index, 1), hidden)} />
              <IconButton label={`پنهان کردن ${name(key)}`} icon="solar:close-circle-linear" onPress={() => onChange(active.filter((k) => k !== key), [...hidden, key])} />
            </span>
          </div>
        ))}
      </div>
      <div className="inset-tile flex flex-col gap-2 rounded-lg p-3">
        <h5 className="text-sm font-semibold text-foreground">مخفی / مخزن</h5>
        {hidden.length ? (
          hidden.map((key) => (
            <div key={key} className="flex items-center justify-between gap-2 rounded-lg bg-surface/60 px-3 py-2">
              <span className="flex min-w-0 flex-col">
                <strong className="text-sm text-foreground">{name(key)}</strong>
                <bdi dir="ltr" className="text-xs text-muted">
                  {key}
                </bdi>
              </span>
              <IconButton label={`افزودن ${name(key)}`} icon="solar:add-circle-linear" onPress={() => onChange([...active, key], hidden.filter((k) => k !== key))} />
            </div>
          ))
        ) : (
          <p className="text-sm text-muted">همه دکمه‌ها در زیرمنو هستند</p>
        )}
      </div>
    </div>
  );
}

function WheelSettingsForm({ wheel, refresh }: { wheel: WheelSettings; refresh: () => void }) {
  const [enabled, setEnabled] = useState(wheel.enabled);
  const [cost, setCost] = useState(inputValue(wheel.spin_cost));
  const [daily, setDaily] = useState(inputValue(wheel.daily_limit));
  const [cooldown, setCooldown] = useState(inputValue(wheel.cooldown_seconds));
  const [free, setFree] = useState(inputValue(wheel.free_spins_daily));
  const [menu, setMenu] = useState({ active: wheel.submenu_active, hidden: wheel.submenu_hidden });
  const { pending, track } = usePending();

  const save = () =>
    track(() =>
      run(
        "/loyalty/wheel/settings",
        {
          lucky_wheel_enabled: enabled,
          lucky_wheel_spin_cost_points: cost,
          lucky_wheel_daily_limit: daily,
          lucky_wheel_cooldown_seconds: cooldown,
          lucky_wheel_free_spins_daily: free,
          loyalty_submenu_order: menu.active.join(","),
        },
        { success: "تنظیمات چرخ ذخیره شد.", refresh },
      ),
    );

  return (
    <EditorCard title="تنظیمات چرخ شانس" meta="چرخ فقط وقتی فعال است که باشگاه مشتریان هم روشن باشد.">
      <p className="text-xs leading-5 text-muted">
        متن دکمه از تنظیمات «متن دکمه‌های منو» (<bdi dir="ltr">btn_loy_wheel</bdi>) و جایگاه دکمه باشگاه از <bdi dir="ltr">menu_order</bdi> تغییر می‌کند.
      </p>
      <EditorForm onSubmit={() => void save()} pending={pending} submitLabel="ذخیره تنظیمات چرخ">
        <SwitchInput label="فعال بودن چرخ شانس" checked={enabled} onChange={setEnabled} />
        <FormGrid cols={3}>
          <TextInput type="number" label="هزینه هر چرخش (امتیاز)" value={cost} onChange={setCost} min={0} max={1000000} help="۰ = رایگان (بدون امتیاز)" />
          <TextInput type="number" label="سقف روزانه" value={daily} onChange={setDaily} min={0} max={100} help="۰ = نامحدود" />
          <TextInput type="number" label="کولدون (ثانیه)" value={cooldown} onChange={setCooldown} min={0} max={86400} />
          <TextInput type="number" label="چرخش رایگان روزانه" value={free} onChange={setFree} min={0} max={50} />
        </FormGrid>
        <IntroNote title="ترتیب زیرمنوی باشگاه">
          ترتیب و نمایش دکمه‌های باشگاه در ربات. دکمه‌ای که از لیست حذف شود در ربات پنهان می‌شود. اگر کلید بالا خاموش باشد، گردونه هم نمایش داده نمی‌شود.
        </IntroNote>
        <SubmenuOrder
          active={menu.active}
          hidden={menu.hidden}
          labels={wheel.submenu_labels}
          onChange={(active, hidden) => setMenu({ active, hidden })}
        />
      </EditorForm>
    </EditorCard>
  );
}

function CreatePrize({ wheel, refresh }: { wheel: WheelSettings; refresh: () => void }) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState(wheel.prize_types[0]?.value ?? "");
  const [value, setValue] = useState("0");
  const [weight, setWeight] = useState("10");
  const [order, setOrder] = useState("100");
  const [minToman, setMinToman] = useState("0");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [expires, setExpires] = useState("");
  const { pending, track } = usePending();

  const create = () =>
    track(async () => {
      const result = await run(
        "/loyalty/wheel/prizes/create",
        {
          label,
          prize_type: type,
          prize_value: value,
          weight,
          sort_order: order,
          min_purchase_toman: minToman,
          max_discount_toman: maxDiscount,
          expires_days: expires,
        },
        { success: "بخش چرخ ساخته شد.", refresh },
      );
      if (result?.ok) {
        setLabel("");
        setValue("0");
        setMaxDiscount("");
        setExpires("");
      }
    });

  return (
    <EditorCard title="افزودن بخش چرخ" meta="وزن بالاتر = شانس بیشتر. انتخاب جایزه فقط سمت سرور انجام می‌شود.">
      <EditorForm onSubmit={() => void create()} pending={pending} submitLabel="ایجاد بخش">
        <TextInput label="برچسب" value={label} onChange={setLabel} required maxLength={128} placeholder="مثلاً ۱۰ گیگ" />
        <FormGrid cols={3}>
          <SelectInput label="نوع" value={type} options={asOptions(wheel.prize_types)} onChange={setType} />
          <TextInput type="number" label="مقدار" value={value} onChange={setValue} min={0} />
          <TextInput type="number" label="وزن" value={weight} onChange={setWeight} min={1} max={10000} />
          <TextInput type="number" label="ترتیب" value={order} onChange={setOrder} />
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

function PrizeCard({ prize, refresh }: { prize: WheelPrize; refresh: () => void }) {
  const [label, setLabel] = useState(prize.label);
  const [value, setValue] = useState(inputValue(prize.prize_value));
  const [weight, setWeight] = useState(inputValue(prize.weight));
  const [order, setOrder] = useState(inputValue(prize.sort_order));
  const [maxGlobal, setMaxGlobal] = useState(inputValue(prize.max_wins_global));
  const [maxUser, setMaxUser] = useState(inputValue(prize.max_wins_per_user));
  const [minToman, setMinToman] = useState(inputValue(prize.min_purchase_toman));
  const [maxDiscount, setMaxDiscount] = useState(inputValue(prize.max_discount_toman));
  const [expires, setExpires] = useState(inputValue(prize.expires_days));
  const [enabled, setEnabled] = useState(prize.enabled);
  const { pending, track } = usePending();
  const isDiscount = prize.prize_type === "discount_percent";

  const save = () =>
    track(() =>
      run(
        `/loyalty/wheel/prizes/${prize.id}/save`,
        {
          label,
          prize_value: value,
          weight,
          sort_order: order,
          enabled,
          max_wins_global: maxGlobal,
          max_wins_per_user: maxUser,
          ...(isDiscount ? { min_purchase_toman: minToman, max_discount_toman: maxDiscount, expires_days: expires } : {}),
        },
        { success: "بخش چرخ ذخیره شد.", refresh },
      ),
    );

  const archive = () =>
    void run(`/loyalty/wheel/prizes/${prize.id}/archive`, {}, {
      ask: { title: "حذف بخش چرخ", text: "این بخش حذف شود؟ از استخر چرخش خارج می‌شود.", confirmLabel: "حذف", tone: "danger" },
      success: "بخش چرخ حذف شد.",
      refresh,
    });

  return (
    <EditorCard title={prize.label} meta={`${prize.type_label} · برد: ${fa(prize.win_count)} · وزن: ${fa(prize.weight)}`} enabled={prize.enabled}>
      <EditorForm onSubmit={() => void save()} pending={pending} submitLabel="ذخیره" extra={<DangerButton onPress={archive}>حذف</DangerButton>}>
        <TextInput label="برچسب" value={label} onChange={setLabel} required maxLength={128} />
        <FormGrid cols={3}>
          <TextInput type="number" label="مقدار" value={value} onChange={setValue} min={0} />
          <TextInput type="number" label="وزن" value={weight} onChange={setWeight} min={1} max={10000} />
          <TextInput type="number" label="ترتیب" value={order} onChange={setOrder} />
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

function SpinsTable({ spins }: { spins: WheelSpin[] }) {
  return (
    <EditorCard title="چرخش‌های اخیر" meta={`${fa(spins.length)} چرخش`}>
      {spins.length ? (
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="چرخش‌های اخیر" className="min-w-[520px]">
              <Table.Header>
                <Table.Column isRowHeader>شناسه</Table.Column>
                <Table.Column>کاربر</Table.Column>
                <Table.Column>جایزه</Table.Column>
                <Table.Column>هزینه</Table.Column>
                <Table.Column>وضعیت</Table.Column>
              </Table.Header>
              <Table.Body>
                {spins.map((spin) => (
                  <Table.Row key={spin.id} id={spin.id}>
                    <Table.Cell>
                      <Ltr>#{fa(spin.id)}</Ltr>
                    </Table.Cell>
                    <Table.Cell>
                      <span dir="auto">{spin.user_label}</span>
                    </Table.Cell>
                    <Table.Cell>
                      <span dir="auto">{spin.prize_label}</span> <span className="text-muted">({spin.type_label})</span>
                    </Table.Cell>
                    <Table.Cell>{spin.used_free_spin ? "رایگان" : fa(spin.cost_points)}</Table.Cell>
                    <Table.Cell>
                      <StatusChip color={spin.status === "completed" ? "success" : "default"}>{spin.status}</StatusChip>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      ) : (
        <EmptyBlock title="هنوز چرخشی ثبت نشده" />
      )}
    </EditorCard>
  );
}

export function LoyaltyWheel({ wheel, refresh }: { wheel: WheelSettings; refresh: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      {wheel.degraded ? (
        <Alert status="warning">
          <Alert.Content>
            <Alert.Description>اطلاعات چرخ شانس خوانده نشد؛ مقدارهای پیش‌فرض نمایش داده می‌شود. پس از به‌روزرسانی پایگاه‌داده دوباره بررسی کنید.</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      <WheelSettingsForm key={JSON.stringify([wheel.enabled, wheel.spin_cost, wheel.daily_limit, wheel.cooldown_seconds, wheel.free_spins_daily, wheel.submenu_active])} wheel={wheel} refresh={refresh} />
      <CreatePrize wheel={wheel} refresh={refresh} />
      {wheel.prizes.length ? (
        wheel.prizes.map((prize) => <PrizeCard key={`${prize.id}:${JSON.stringify(prize)}`} prize={prize} refresh={refresh} />)
      ) : (
        <EmptyBlock title="بخشی برای چرخ تعریف نشده." />
      )}
      <SpinsTable spins={wheel.spins} />
    </div>
  );
}
