"use client";

import { Button, Spinner, toast } from "@heroui/react";
import { useEffect, useState, type FormEvent } from "react";

import { Icon } from "@/icons/Icon";

import { PanelError, panelGet } from "../../core/api";
import { CheckGroup, FormGrid, FormModal, SelectInput, TextInput } from "../../ui/Fields";
import { Notice } from "../../ui/States";
import {
  createUserError,
  createUserFields,
  defaultCreateMode,
  editUserError,
  editUserFields,
  editUserForm,
  type CreateMode,
  type CreateUserForm,
  type EditUserForm,
} from "./forms";
import { optionList } from "./format";
import { useDialogPost } from "./submit";
import type { PgOption, PgUserRow, PgUsersCan } from "./types";
import { FormError, FormFooter } from "./ui";

const GB_HELP = "۰ یا خالی = نامحدود";
const DAYS_HELP = "از الان محاسبه می‌شود — خالی = بدون انقضا";
const MODE_LABELS: Record<CreateMode, string> = { custom: "سفارشی (گروه + حجم + مدت)", template: "از تمپلیت آماده" };

type DialogProps = { onClose: () => void; refresh: () => void };

function CreateForm({ can, templates, groups, onClose, refresh }: DialogProps & { can: PgUsersCan; templates: PgOption[]; groups: PgOption[] }) {
  const [form, setForm] = useState<CreateUserForm>({
    username: "",
    mode: defaultCreateMode({ requireTemplate: can.require_template, canCustom: can.custom_create, canTemplate: can.template_create }),
    gb: "",
    days: "",
    hwid: "",
    groupIds: [],
    templateId: "",
  });
  const { pending, error, setError, post } = useDialogPost({ onClose, refresh });
  const patch = (next: Partial<CreateUserForm>) => setForm((current) => ({ ...current, ...next }));
  const modes: CreateMode[] = can.require_template ? ["template"] : [...(can.custom_create || groups.length ? (["custom"] as const) : []), ...(can.template_create || templates.length ? (["template"] as const) : [])];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problem = createUserError(form);
    if (problem) setError(problem);
    else void post("/pg/users", createUserFields(form));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      <TextInput label="نام کاربری" value={form.username} onChange={(username) => patch({ username })} ltr required maxLength={32} placeholder="user_01" help="۳ تا ۳۲ کاراکتر انگلیسی، عدد یا _ — بدون فاصله و فارسی" />
      <SelectInput
        label="حالت ساخت"
        value={form.mode}
        onChange={(mode) => patch({ mode: mode === "template" ? "template" : "custom" })}
        options={modes.map((mode) => ({ id: mode, label: MODE_LABELS[mode] }))}
        disabled={can.require_template}
        help={can.require_template ? "نقش شما فقط ساخت از تمپلیت را مجاز می‌داند." : undefined}
      />
      {form.mode === "custom" ? (
        <>
          <FormGrid cols={3}>
            <TextInput label="حجم (گیگابایت)" type="number" min={0} step={0.1} value={form.gb} onChange={(gb) => patch({ gb })} placeholder="مثلاً 50" help={GB_HELP} />
            <TextInput label="مدت (روز)" type="number" min={0} step={1} value={form.days} onChange={(days) => patch({ days })} placeholder="مثلاً 30" help={DAYS_HELP} />
            <TextInput label="سقف دستگاه (HWID)" type="number" min={0} step={1} value={form.hwid} onChange={(hwid) => patch({ hwid })} placeholder="مثلاً 2" help="خالی = طبق سقف نقش (در صورت وجود) یا نامحدود" />
          </FormGrid>
          <CheckGroup label="گروه‌های پاسارگارد (حداقل یکی)" options={optionList(groups)} selected={form.groupIds} onChange={(groupIds) => patch({ groupIds })} empty="گروهی در دسترس نیست." columns />
        </>
      ) : (
        <>
          <SelectInput label="تمپلیت پاسارگارد" value={form.templateId} onChange={(templateId) => patch({ templateId })} options={optionList(templates)} placeholder="— انتخاب —" />
          {templates.length ? null : <p className="text-sm text-muted">تمپلیتی در دسترس نیست.</p>}
        </>
      )}
      <FormFooter submitLabel="ساخت" pending={pending} disabled={!can.custom_create && !can.template_create} onCancel={onClose} />
    </form>
  );
}

/** «ساخت کاربر»: custom (groups, volume, days, devices) or from a ready template. */
export function CreateUserDialog({ open, can, templates, groups, onClose, refresh }: DialogProps & { open: boolean; can: PgUsersCan; templates: PgOption[]; groups: PgOption[] }) {
  return (
    <FormModal isOpen={open} onOpenChange={(next) => !next && onClose()} title="ساخت کاربر پاسارگارد" description="کاربر مستقیم در پاسارگارد">
      {open ? <CreateForm can={can} templates={templates} groups={groups} onClose={onClose} refresh={refresh} /> : null}
    </FormModal>
  );
}

function EditForm({ row, groups, onClose, refresh }: DialogProps & { row: PgUserRow; groups: PgOption[] }) {
  const [form, setForm] = useState<EditUserForm>(() => editUserForm(row));
  const { pending, error, setError, post } = useDialogPost({ onClose, refresh });
  const patch = (next: Partial<EditUserForm>) => setForm((current) => ({ ...current, ...next }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problem = editUserError(form);
    if (problem) setError(problem);
    else void post(`/pg/users/${row.id}/edit`, editUserFields(form));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      <TextInput label="نام کاربری" value={row.username} onChange={() => undefined} ltr readOnly disabled help="در پاسارگارد امکان تغییر نام کاربری وجود ندارد" />
      <FormGrid>
        <TextInput label="حجم (گیگابایت)" type="number" min={0} step={0.1} value={form.gb} onChange={(gb) => patch({ gb })} placeholder="مثلاً 50" help={GB_HELP} />
        <TextInput label="مدت (روز)" type="number" min={0} step={1} value={form.days} onChange={(days) => patch({ days })} placeholder="مثلاً 30" help={DAYS_HELP} />
      </FormGrid>
      <TextInput label="سقف دستگاه (HWID)" type="number" min={0} step={1} value={form.hwid} onChange={(hwid) => patch({ hwid })} placeholder="مثلاً 2" help={GB_HELP} />
      <CheckGroup label="گروه‌ها (حداقل یکی)" options={optionList(groups)} selected={form.groupIds} onChange={(groupIds) => patch({ groupIds })} empty="گروهی در دسترس نیست." columns />
      <FormFooter submitLabel="ذخیره" pending={pending} onCancel={onClose} />
    </form>
  );
}

/** «ویرایش کاربر»: volume, days from now, device limit and groups (the name cannot change). */
export function EditUserDialog({ row, groups, onClose, refresh }: DialogProps & { row: PgUserRow | null; groups: PgOption[] }) {
  return (
    <FormModal isOpen={row !== null} onOpenChange={(next) => !next && onClose()} title="ویرایش کاربر" description="حجم، مدت و گروه‌های کاربر">
      {row ? <EditForm key={row.id} row={row} groups={groups} onClose={onClose} refresh={refresh} /> : null}
    </FormModal>
  );
}

type LinkAnswer = { ok?: boolean; url?: string; username?: string };
type LinkState = { status: "loading" } | { status: "ready"; url: string } | { status: "error"; message: string };

const WEB_URL = /^https?:\/\//i;
const LINK_MISSING = "لینک اشتراک برای این کاربر یافت نشد.";

/** The link is fetched when the dialog opens and lives only in this component; it is never part of a list. */
function LinkBody({ id, onClose }: { id: number; onClose: () => void }) {
  const [state, setState] = useState<LinkState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    panelGet<LinkAnswer>(`/pg/users/${id}/link`, { signal: controller.signal })
      .then((answer) => setState(answer.url ? { status: "ready", url: answer.url } : { status: "error", message: LINK_MISSING }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: "error", message: err instanceof PanelError ? err.message : "دریافت لینک ناموفق بود." });
      });
    return () => controller.abort();
  }, [id]);

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted" aria-busy="true">
        <Spinner size="sm" />
        در حال دریافت لینک…
      </div>
    );
  }
  if (state.status === "error") return <Notice tone="warning">{state.message}</Notice>;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(state.url);
      toast.success("لینک کپی شد");
    } catch (err) {
      console.debug("clipboard refused", err);
      toast.danger("کپی انجام نشد؛ لینک را دستی انتخاب و کپی کنید.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <TextInput label="آدرس اشتراک" value={state.url} onChange={() => undefined} ltr readOnly />
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" className="!h-12 !rounded-lg px-6" onPress={onClose}>
          بستن
        </Button>
        {WEB_URL.test(state.url) ? (
          <Button type="button" variant="outline" className="!h-12 !rounded-lg px-6" onPress={() => window.open(state.url, "_blank", "noopener,noreferrer")}>
            <Icon name="solar:arrow-right-up-linear" size={18} />
            باز کردن
          </Button>
        ) : null}
        <Button type="button" className="button--ink !h-12 !rounded-lg px-6 text-sm" onPress={() => void copy()}>
          <Icon name="solar:copy-linear" size={18} />
          کپی لینک
        </Button>
      </div>
    </div>
  );
}

/** «لینک اشتراک» of one user. */
export function LinkDialog({ target, onClose }: { target: { id: number; username: string } | null; onClose: () => void }) {
  return (
    <FormModal isOpen={target !== null} onOpenChange={(next) => !next && onClose()} title="لینک اشتراک" size="md" description={target ? <bdi dir="ltr">{target.username}</bdi> : undefined}>
      {target ? <LinkBody key={target.id} id={target.id} onClose={onClose} /> : null}
    </FormModal>
  );
}
