"use client";

import { Button } from "@heroui/react";
import { useState, type FormEvent } from "react";

import { Icon } from "@/icons/Icon";

import { run } from "../../core/actions";
import { useJson, useQuery, useUrlFlash } from "../../core/data";
import { fa, type ChipColor } from "../../core/format";
import { StatusChip } from "../../ui/Data";
import { TextInput, SelectInput, TextAreaInput, SubmitButton } from "../../ui/Fields";
import { EmptyBlock, Loadable } from "../../ui/States";
import { PanelShell } from "../../layout/PanelShell";
import { GlassSection, PageHeader } from "../../ui/Page";
import { asOptions, clampDays } from "./format";
import { MarketingStrip } from "./sections";
import type { CampaignRow, CampaignsData } from "./types";

const MAX_TEXT = 3500;
const STATUS_COLOR: Record<string, ChipColor> = { draft: "default", running: "accent", paused: "warning", completed: "success", review: "warning" };

/** Which audience and range the preview and the draft use; the address keeps them like the old page. */
function AudienceForm({ data, onPreview }: { data: CampaignsData; onPreview: (audience: string, days: number) => void }) {
  const [audience, setAudience] = useState(data.audience);
  const [days, setDays] = useState(String(data.days));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onPreview(audience, clampDays(days));
  };
  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SelectInput label="گروه" value={audience} options={asOptions(data.audiences)} onChange={setAudience} />
        <TextInput type="number" label="بازهٔ روز" value={days} onChange={setDays} min={1} max={365} required />
      </div>
      <div>
        <Button type="submit" variant="secondary" className="!h-12 !rounded-lg px-6 text-sm">
          <Icon name="solar:eye-linear" size={20} />
          پیش‌نمایش مخاطبان
        </Button>
      </div>
    </form>
  );
}

function DraftForm({ data, onCreated }: { data: CampaignsData; onCreated: () => void }) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || !text.trim()) return;
    setPending(true);
    // The preview's audience and range are what gets frozen into the draft, as in the old hidden fields.
    const result = await run("/campaigns", { audience: data.audience, days: data.days, text }, { success: "پیش‌نویس ساخته شد.", refresh: onCreated });
    if (result?.ok) setText("");
    setPending(false);
  };
  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
      <TextAreaInput label="متن سادهٔ پیام" value={text} onChange={setText} rows={6} maxLength={MAX_TEXT} required />
      <div>
        <SubmitButton pending={pending}>
          <Icon name="solar:document-add-bold" size={20} />
          ساخت پیش‌نویس و تثبیت مخاطبان
        </SubmitButton>
      </div>
    </form>
  );
}

function CampaignCard({ row, refresh }: { row: CampaignRow; refresh: () => void }) {
  const running = row.status === "running";
  const control = () =>
    void run(`/campaigns/${row.id}/${running ? "pause" : "start"}`, {}, {
      ask: running ? undefined : { title: "شروع ارسال", text: "ارسال این متن به مخاطبان پیش‌نمایش‌شده آغاز شود؟", confirmLabel: "شروع ارسال", tone: "warning" },
      success: running ? "ارسال متوقف شد." : "ارسال آغاز شد.",
      refresh,
    });
  const controlLabel = running ? "توقف ارسال" : row.status === "paused" ? "ادامهٔ ارسال" : "شروع ارسال";
  return (
    <GlassSection
      className="scroll-mt-24"
      title={
        <span id={`campaign-${row.id}`}>
          کمپین <bdi dir="ltr">#{fa(row.id)}</bdi> — {row.audience_title}
        </span>
      }
      actions={<StatusChip color={STATUS_COLOR[row.status] ?? "default"}>{row.status_label}</StatusChip>}
    >
      <p className="inset-tile rounded-lg p-3 text-sm leading-6 break-words whitespace-pre-wrap text-foreground/90" dir="auto">
        {row.text}
      </p>
      {row.progress.length ? (
        <div className="flex flex-wrap gap-2">
          {row.progress.map((item) => (
            <StatusChip key={item.status} color={item.status === "failed" ? "danger" : item.status === "sent" ? "success" : item.status === "review" ? "warning" : "default"}>
              {item.label}: {fa(item.count)}
            </StatusChip>
          ))}
        </div>
      ) : null}
      {row.has_review ? <p className="text-xs leading-5 text-muted">پیام‌هایی که نتیجهٔ ارسالشان نامشخص است خودکار دوباره ارسال نمی‌شوند.</p> : null}
      {row.can_control ? (
        <div>
          <Button variant={running ? "secondary" : "primary"} className="!h-10 !rounded-lg" onPress={control}>
            <Icon name={running ? "solar:pause-bold" : "solar:play-bold"} size={18} />
            {controlLabel}
          </Button>
        </div>
      ) : null}
    </GlassSection>
  );
}

function CampaignsBody() {
  const query = useQuery();
  useUrlFlash();
  const params = new URLSearchParams();
  if (query.get("audience")) params.set("audience", query.get("audience"));
  if (query.get("days")) params.set("days", query.get("days"));
  const resource = useJson<CampaignsData>(`/api/panel/marketing/campaigns${params.size ? `?${params}` : ""}`);
  return (
    <Loadable state={resource} rows={4}>
      {(data) => (
        <>
          <MarketingStrip sections={data.sections} />
          <div className="flex flex-col gap-6">
            <GlassSection title="انتخاب مخاطبان">
              {/* A new preview remounts the form so its fields show the values the server accepted. */}
              <AudienceForm key={`${data.audience}:${data.days}`} data={data} onPreview={(audience, days) => query.set({ audience, days: String(days) })} />
              <p className="text-sm text-foreground">
                <bdi className="num font-semibold">{fa(data.count)}</bdi> مخاطب واجد شرایط؛ سقف هر کمپین <bdi className="num">{fa(data.limit)}</bdi> نفر.
              </p>
              <p className="text-xs leading-5 text-muted">
                گروه «نزدیک انقضا» از اطلاعات ۲۴ ساعت اخیر ساخته می‌شود و گروه «غیرفعال» از نداشتن خرید در این فروشگاه. کاربران مسدودشده یا لغوکننده حذف می‌شوند. فهرست مخاطبان نمایش داده نمی‌شود.
              </p>
              <DraftForm data={data} onCreated={resource.reload} />
            </GlassSection>
            {data.campaigns.length ? (
              data.campaigns.map((row) => <CampaignCard key={row.id} row={row} refresh={resource.reload} />)
            ) : (
              <GlassSection>
                <EmptyBlock icon="solar:mailbox-linear" title="هنوز کمپینی ساخته نشده" />
              </GlassSection>
            )}
          </div>
        </>
      )}
    </Loadable>
  );
}

export function CampaignsPage() {
  return (
    <PanelShell title="کمپین هدفمند">
      <PageHeader icon="solar:target-bold" title="کمپین هدفمند" description="پیش‌نمایش مخاطبان، ساخت پیش‌نویس و کنترل ارسال به مشتریان فروشگاه" />
      <CampaignsBody />
    </PanelShell>
  );
}
