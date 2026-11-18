"use client";

import { Button } from "@heroui/react";
import { useState } from "react";

import { run } from "../../core/actions";
import { usePanelSession } from "../../core/session";
import { SelectInput, SwitchInput, TextInput } from "../../ui/Fields";
import { GlassSection } from "../../ui/Page";
import { postForm } from "../../settings-ui/rawPost";
import { ALREADY_YOURS, attachableId, LOOKUP_KINDS, LOOKUP_MAX, previewError, previewRows, type LookupKind, type PreviewAnswer } from "./importAssign";
import { ReasonDialog, type ReasonRequest } from "./ReasonDialog";
import type { UserEdit } from "./types";

type SectionProps = { edit: UserEdit; reload: () => void };

const ATTACH_QUESTION = "سرویس بررسی‌شده به سرویس‌های این مشتری اضافه شود؟ در پنل چیزی تغییر نمی‌کند.";

function Preview({ data }: { data: PreviewAnswer }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {previewRows(data).map((row) => (
          <div key={row.label} className="inset-tile flex min-w-28 flex-col gap-0.5 rounded-lg px-3 py-2">
            <span className="text-xs text-muted">{row.label}</span>
            <strong className="text-sm text-foreground">{row.ltr ? <bdi dir="ltr">{row.value}</bdi> : row.value}</strong>
          </div>
        ))}
      </div>
      {data.already_yours === true ? <p className="text-sm text-muted">{ALREADY_YOURS}</p> : null}
    </div>
  );
}

/**
 * «افزودن سرویس قبلی»: check a customer's existing panel service first, then attach exactly the panel user that
 * was shown. The link is a bearer secret: it is only ever sent in a POST body, and the screen forgets it once used.
 */
export function ImportServiceSection({ edit, reload }: SectionProps) {
  const { session } = usePanelSession();
  const [kind, setKind] = useState<LookupKind>("link");
  const [value, setValue] = useState("");
  const [notify, setNotify] = useState(true);
  const [preview, setPreview] = useState<PreviewAnswer | null>(null);
  const [problem, setProblem] = useState("");
  const [checking, setChecking] = useState(false);
  const [request, setRequest] = useState<ReasonRequest | null>(null);
  const base = `/users/${edit.user.id}/import-service`;
  const panelUserId = attachableId(preview);

  const forget = () => {
    setPreview(null);
    setProblem("");
  };
  const change = (apply: () => void) => {
    apply();
    forget();
  };

  const check = async () => {
    if (!value.trim()) {
      setProblem("لینک اشتراک یا نام کاربری پنل را وارد کنید.");
      return;
    }
    forget();
    setChecking(true);
    const answer = await postForm<PreviewAnswer>(`${base}/preview`, { kind, value }, session.csrf_token);
    setChecking(false);
    if (answer.status === 200 && answer.body?.ok === true) setPreview(answer.body);
    else setProblem(previewError(answer.body));
  };

  const attach = () =>
    setRequest({
      title: "افزودن سرویس قبلی",
      message: ATTACH_QUESTION,
      confirmLabel: "افزودن سرویس",
      reasonLabel: "علت افزودن",
      onConfirm: async (reason) => {
        const result = await run(base, { kind, value, panel_user_id: panelUserId, reason, notify }, { success: "سرویس اضافه شد" });
        if (result?.ok) {
          setValue("");
          forget();
        }
        reload();
      },
    });

  return (
    <GlassSection
      title="افزودن سرویس قبلی"
      description="سرویسی که مشتری از قبل در پنل دارد با لینک اشتراک یا نام کاربری پنل به «سرویس‌های من» او وصل می‌شود. چیزی در پنل تغییر نمی‌کند؛ سرویس قابل تمدید است ولی لغو و بازگشت وجه ندارد."
    >
      <SelectInput label="نوع ورودی" value={kind} onChange={(next) => change(() => setKind(next === "username" ? "username" : "link"))} options={LOOKUP_KINDS} />
      <form
        noValidate
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void check();
        }}
      >
        <TextInput className="min-w-0 flex-1" label="لینک یا نام کاربری" value={value} onChange={(next) => change(() => setValue(next))} ltr maxLength={LOOKUP_MAX} required />
        <Button type="submit" variant="outline" className="!h-10 !rounded-lg" isPending={checking}>
          بررسی
        </Button>
      </form>
      {problem ? (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {problem}
        </p>
      ) : null}
      {preview ? <Preview data={preview} /> : null}
      <SwitchInput label="پیام به مشتری" help="بعد از افزودن، ربات با ذکر علت به مشتری خبر می‌دهد" checked={notify} onChange={setNotify} />
      <div>
        <Button className="button--ink !h-12 !rounded-lg" isDisabled={!panelUserId} onPress={attach}>
          افزودن سرویس
        </Button>
      </div>
      <ReasonDialog request={request} onClose={() => setRequest(null)} />
    </GlassSection>
  );
}
