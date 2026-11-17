"use client";

import { toast } from "@heroui/react";
import { useMemo } from "react";

import { tokenProblem, tokensIn } from "./logic";

async function copyToken(token: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(token);
    toast.success("متغیر کپی شد.");
  } catch {
    toast.danger("کپی انجام نشد؛ متغیر را دستی بنویسید.");
  }
}

/**
 * The placeholders a text may use, as copyable chips, and a warning when it uses one this section
 * does not support. The server keeps its own check; this only shows the problem while typing.
 */
export function TokenHints({ text, allowed }: { text: string; allowed: Record<string, string> }) {
  const tokens = useMemo(() => tokensIn(text, allowed), [text, allowed]);
  const problem = tokenProblem(tokens);
  return (
    <div className="flex flex-col gap-1">
      {problem ? (
        <p role="alert" className="text-xs text-danger">
          {problem}
        </p>
      ) : null}
      <details className="text-xs text-muted">
        <summary className="w-fit cursor-pointer select-none text-accent">متغیرهای قابل استفاده</summary>
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="متغیرها">
          {tokens.map((item) => (
            <li key={item.token}>
              <button
                type="button"
                dir="ltr"
                disabled={!item.valid}
                onClick={() => void copyToken(item.token)}
                title={item.valid ? `${item.title} — برای کپی کلیک کنید` : item.malformed ? "قالب متغیر نادرست است" : "در این بخش پشتیبانی نمی‌شود"}
                aria-label={`${item.token}: ${item.valid ? (item.used ? "معتبر" : "استفاده‌نشده") : "نامعتبر"}`}
                className={`rounded-md border px-2 py-0.5 font-mono outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                  !item.valid ? "border-danger text-danger" : item.used ? "border-success text-success" : "border-border text-muted hover:bg-surface-secondary"
                }`}
              >
                {item.token.length > 64 ? `${item.token.slice(0, 61)}...` : item.token}
              </button>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
