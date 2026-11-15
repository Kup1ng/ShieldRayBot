"use client";

/** Form fields of the panel: label above, help below, ink submit button (Figma «Mini app» forms). */

import { Button, Checkbox, Description, Input, Label, ListBox, Modal, Select, Switch, TextArea, TextField } from "@heroui/react";
import type { ReactNode } from "react";

import { digitsOnly, fa } from "../core/format";

export type Option = { id: string; label: string };

/** React Aria keys cannot be an empty string reliably, so «no value» travels as this key. */
const NONE = "__none__";

/** A «0» default is selected on focus, so typing replaces it instead of producing «050». */
function selectZero(event: React.FocusEvent<HTMLInputElement>): void {
  if (event.currentTarget.value === "0") event.currentTarget.select();
}

type TextFieldProps = {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  help?: ReactNode;
  type?: "text" | "number" | "password";
  placeholder?: string;
  required?: boolean;
  /** URLs, codes, numbers: always left-to-right. */
  ltr?: boolean;
  min?: number;
  max?: number;
  step?: number | string;
  maxLength?: number;
  readOnly?: boolean;
  disabled?: boolean;
  name?: string;
  className?: string;
};

export function TextInput({ label, value, onChange, help, type = "text", placeholder, required, ltr, min, max, step, maxLength, readOnly, disabled, name, className }: TextFieldProps) {
  return (
    <TextField name={name} type={type} value={value} onChange={onChange} isRequired={required} isReadOnly={readOnly} isDisabled={disabled} className={`min-w-0 ${className ?? ""}`}>
      <Label>{label}</Label>
      <Input dir={ltr || type === "number" ? "ltr" : undefined} className={ltr || type === "number" ? "text-start" : undefined} placeholder={placeholder} min={min} max={max} step={step} maxLength={maxLength} inputMode={type === "number" ? "decimal" : undefined} onFocus={selectZero} />
      {help ? <Description>{help}</Description> : null}
    </TextField>
  );
}

export function TextAreaInput({
  label,
  value,
  onChange,
  help,
  rows = 2,
  className,
  placeholder,
  required,
  maxLength,
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  help?: ReactNode;
  rows?: number;
  className?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <TextField value={value} onChange={onChange} isRequired={required} className={`min-w-0 ${className ?? ""}`}>
      <Label>{label}</Label>
      <TextArea rows={rows} placeholder={placeholder} maxLength={maxLength} />
      {help ? <Description>{help}</Description> : null}
    </TextField>
  );
}

export function SelectInput({
  label,
  value,
  onChange,
  options,
  help,
  placeholder = "انتخاب کنید",
  disabled,
  className,
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  help?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select
      className={`min-w-0 ${className ?? ""}`}
      placeholder={placeholder}
      isDisabled={disabled}
      value={value === "" ? NONE : value}
      onChange={(key) => onChange(key === NONE || key === null ? "" : String(key))}
    >
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      {help ? <Description>{help}</Description> : null}
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item key={option.id || NONE} id={option.id || NONE} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

export function SwitchInput({ label, help, checked, onChange, disabled }: { label: ReactNode; help?: ReactNode; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <Switch isSelected={checked} onChange={onChange} isDisabled={disabled} className="w-full justify-between gap-4">
      <Switch.Content className="min-w-0">
        <Label>{label}</Label>
        {help ? <Description>{help}</Description> : null}
      </Switch.Content>
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
    </Switch>
  );
}

export function CheckInput({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <Checkbox isSelected={checked} onChange={onChange} isDisabled={disabled}>
      <Checkbox.Content>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Label>{label}</Label>
      </Checkbox.Content>
    </Checkbox>
  );
}

/** A labelled group of checkboxes (PasarGuard groups, purchase types, permissions). */
export function CheckGroup({
  label,
  help,
  options,
  selected,
  onChange,
  empty,
  columns = false,
}: {
  label: ReactNode;
  help?: ReactNode;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  empty?: ReactNode;
  columns?: boolean;
}) {
  const toggle = (id: string, on: boolean) => onChange(on ? Array.from(new Set([...selected, id])) : selected.filter((x) => x !== id));
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      {help ? <p className="text-xs text-muted">{help}</p> : null}
      {options.length ? (
        <div className={columns ? "grid gap-2 sm:grid-cols-2" : "flex flex-wrap gap-x-4 gap-y-2"}>
          {options.map((option) => (
            <CheckInput key={option.id} label={option.label} checked={selected.includes(option.id)} onChange={(on) => toggle(option.id, on)} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">{empty}</p>
      )}
    </fieldset>
  );
}

/** The grid forms use: one column on a phone, two or more from the tablet width. */
export function FormGrid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const wide = cols === 4 ? "lg:grid-cols-4" : cols === 3 ? "lg:grid-cols-3" : "";
  return <div className={`grid gap-4 sm:grid-cols-2 ${wide}`}>{children}</div>;
}

export function FormSection({ title, description, children }: { title: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-0.5">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        {description ? <p className="text-xs leading-5 text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Modal frame with a scrolling body and a footer for the form's buttons. */
export function FormModal({
  isOpen,
  onOpenChange,
  title,
  description,
  size = "lg",
  children,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  size?: "sm" | "md" | "lg" | "cover";
  children: ReactNode;
}) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange} variant="blur">
      <Modal.Container size={size} scroll="inside">
        <Modal.Dialog className="!rounded-xl">
          <Modal.CloseTrigger aria-label="بستن" />
          <Modal.Header className="flex flex-col gap-1">
            <Modal.Heading>{title}</Modal.Heading>
            {description ? <p className="text-sm text-muted">{description}</p> : null}
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-4 p-1">{children}</Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

/** An amount in toman: digits only (a pasted «150,000» works), with the grouped number echoed back. */
export function MoneyInput({
  label,
  value,
  onChange,
  help,
  placeholder,
  required,
  disabled,
  className,
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  help?: ReactNode;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const echo = value ? `${fa(Number(value))} تومان` : null;
  return (
    <TextInput
      label={label}
      value={value}
      onChange={(raw) => onChange(digitsOnly(raw))}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      className={className}
      ltr
      help={
        help || echo ? (
          <>
            {help}
            {help && echo ? " — " : null}
            {echo ? <bdi className="num">{echo}</bdi> : null}
          </>
        ) : undefined
      }
    />
  );
}

/** The primary form button: ink, 48px like the Figma screens. */
export function SubmitButton({ children, pending, onPress, type = "submit", isDisabled }: { children: ReactNode; pending?: boolean; onPress?: () => void; type?: "submit" | "button"; isDisabled?: boolean }) {
  return (
    <Button type={type} isPending={pending} isDisabled={isDisabled} onPress={onPress} className="button--ink !h-12 !rounded-lg px-6 text-sm">
      {children}
    </Button>
  );
}
