import { Icon } from "@/icons/Icon";

type ProcessingViewProps = {
  title?: string;
  description?: string;
};

/**
 * Figma "Loading": a turning gradient ring with an info card under it, shown while a receipt
 * or payment is being checked. The ring is decorative; the card carries the live message.
 */
export function ProcessingView({ title = "در حال بررسی رسید تراکنش!", description = "ممکن است ۳۰ ثانیه طول بکشد" }: ProcessingViewProps) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-14 py-10" aria-busy="true">
      <span aria-hidden className="relative size-36">
        <span className="absolute inset-0 rounded-full border-[10px] border-[var(--glass-inset)] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.02)]" />
        <span className="absolute inset-0 animate-spin rounded-full border-[10px] border-transparent border-t-accent border-e-accent/40 [animation-duration:1.4s]" />
      </span>
      <div role="status" aria-live="polite" className="inset-tile flex w-full items-center gap-3 rounded-lg p-3">
        <span aria-hidden className="inline-flex size-12 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-foreground">
          <Icon name="solar:info-circle-bold" size={24} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted">{description}</p>
        </div>
      </div>
    </section>
  );
}
