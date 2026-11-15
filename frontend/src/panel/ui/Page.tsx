import type { ReactNode } from "react";

import { IconTile, type TileTone } from "@/components/ui/IconTile";

/** The top of a panel page: badge-like icon, Title Case heading, one-line description, actions. */
export function PageHeader({
  icon,
  tone = "purple",
  title,
  description,
  actions,
}: {
  icon: string;
  tone?: TileTone;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <IconTile icon={icon} tone={tone} size="lg" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
          {description ? <p className="text-sm text-muted">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** A frosted section of a page (Figma "Multistep" panel), with an optional heading row. */
export function GlassSection({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass flex flex-col gap-4 rounded-xl p-5 md:p-6 ${className}`}>
      {title || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            {title ? <h3 className="text-base font-semibold text-foreground">{title}</h3> : null}
            {description ? <p className="text-sm text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** A metric: icon tile, short label, a large tabular value, optional hint. Neutral inset surface. */
export function StatTile({ icon, tone = "purple", label, value, hint }: { icon: string; tone?: TileTone; label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="inset-tile flex items-center gap-3 rounded-lg p-3">
      <IconTile icon={icon} tone={tone} />
      <div className="flex min-w-0 flex-col">
        <span className="text-xs text-muted">{label}</span>
        <span className="num text-lg leading-7 font-bold text-foreground">{value}</span>
        {hint ? <span className="text-xs text-muted">{hint}</span> : null}
      </div>
    </div>
  );
}
