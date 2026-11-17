"use client";

import type { ReactNode } from "react";

import { BrandMark } from "@/components/shell/BrandMark";
import { CrystalBackdrop } from "@/components/shell/CrystalBackdrop";
import { GlassBar } from "@/components/shell/Glass";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

import { paintTelegramChrome } from "../../core/telegram";
import { MINI_MAX_W } from "../../layout/MiniShell";

/** The frame of every screen shown before the app itself: no signed-in shell exists yet. */
export function GateFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <CrystalBackdrop />
      <div className={`mx-auto flex min-h-dvh w-full ${MINI_MAX_W} flex-col gap-6 px-4 pt-[calc(var(--mini-safe-top)+24px)] pb-[calc(var(--mini-safe-bottom)+24px)]`}>
        <GlassBar start={<BrandMark size={30} />} end={<ThemeToggle onChange={paintTelegramChrome} />} />
        <main className="glass my-auto flex flex-col gap-4 rounded-xl p-6" aria-live="polite">
          <h1 className="text-center text-2xl font-medium text-foreground">{title}</h1>
          {children}
        </main>
      </div>
    </>
  );
}
