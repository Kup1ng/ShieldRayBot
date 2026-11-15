"use client";

import { Alert, Button, Input, Label, TextField } from "@heroui/react";
import { useState, type FormEvent } from "react";

import { AppToastProvider } from "@/components/feedback/AppToast";
import { BrandMark } from "@/components/shell/BrandMark";
import { CrystalBackdrop } from "@/components/shell/CrystalBackdrop";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { Icon } from "@/icons/Icon";
import { useLocation } from "@/lib/location";
import { safeNext } from "@/lib/safeNext";
import { panelAction, safeMessage } from "@/panel/core/api";

export function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  // A message the server put in the address (?err= after a lost session, ?ok= after a reset).
  const [addressDismissed, setAddressDismissed] = useState(false);
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const shownError = error || (addressDismissed ? "" : safeMessage(params.get("err"), ""));
  const notice = addressDismissed ? "" : safeMessage(params.get("ok"), "");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    if (!username.trim() || !password) {
      setError("نام کاربری و رمز دسترسی الزامی است.");
      return;
    }
    setPending(true);
    setError("");
    setAddressDismissed(true);
    try {
      const result = await panelAction("/login", { username: username.trim(), password });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const next = safeNext(new URLSearchParams(window.location.search).get("next"), window.location.origin);
      window.location.assign(next || result.location || "/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <CrystalBackdrop />
      <AppToastProvider />
      <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col justify-center gap-6 px-4 py-10">
        <div className="glass flex h-[72px] items-center justify-between rounded-xl px-6">
          <BrandMark name="ShieldRay" size={32} />
          <ThemeToggle />
        </div>
        <main className="glass flex flex-col gap-6 rounded-xl p-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-2xl font-bold text-foreground">ورود به پنل</h1>
            <p className="text-sm text-muted">برای مدیریت شیلدری وارد حساب خود شوید.</p>
          </div>
          {notice ? (
            <Alert status="success">
              <Alert.Content>
                <Alert.Description>{notice}</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}
          <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)} noValidate>
            <TextField name="username" isRequired value={username} onChange={setUsername} autoComplete="username">
              <Label>نام کاربری</Label>
              <Input dir="ltr" className="text-start" placeholder="admin" />
            </TextField>
            <TextField name="password" type="password" isRequired value={password} onChange={setPassword} autoComplete="current-password">
              <Label>رمز ورود</Label>
              <Input dir="ltr" className="text-start" />
            </TextField>
            {shownError ? (
              <p role="alert" className="flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                <Icon name="solar:danger-circle-bold" size={18} />
                {shownError}
              </p>
            ) : null}
            <Button type="submit" isPending={pending} fullWidth className="button--ink !h-12 !rounded-lg text-sm">
              ورود
              <Icon name="solar:arrow-left-linear" size={22} />
            </Button>
          </form>
        </main>
        <p className="text-center text-xs text-muted">
          © <bdi>ShieldRay</bdi> · شیلدری
        </p>
      </div>
    </>
  );
}
