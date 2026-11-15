import type { ReactNode } from "react";

import { IconTile, type TileTone } from "./IconTile";

type InfoRowProps = {
  icon: string;
  tone?: TileTone;
  label: ReactNode;
  value?: ReactNode;
  /** Optional control at the row's end (copy button, "افزایش" pill, chevron…). */
  action?: ReactNode;
  className?: string;
};

/**
 * Figma "Tag-base": icon tile + «label: value» on a neutral inset row. The value wraps rather
 * than truncating (amounts must be read in full) and sits in its own bidi-isolated span.
 */
export function InfoRow({ icon, tone, label, value, action, className = "" }: InfoRowProps) {
  const hasValue = value !== undefined && value !== null && value !== "";
  return (
    <div className={`inset-tile flex min-h-12 items-center gap-2 rounded-lg p-2 ${className}`}>
      <IconTile icon={icon} tone={tone} />
      <p className="min-w-0 flex-1 text-sm leading-5 text-foreground/75">
        <span>{label}</span>
        {hasValue ? (
          <>
            <span aria-hidden>: </span>
            <bdi className="font-semibold text-foreground">{value}</bdi>
          </>
        ) : null}
      </p>
      {action ? <div className="flex shrink-0 items-center">{action}</div> : null}
    </div>
  );
}
