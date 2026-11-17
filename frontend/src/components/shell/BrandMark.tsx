import { asset } from "@/lib/asset";

type BrandMarkProps = {
  /** A shop's own logo URL from the server; the ShieldRay shield otherwise. */
  logoUrl?: string | null;
  name?: string;
  showName?: boolean;
  size?: number;
};

/** A same-origin upload path: no scheme, no "//", no ".." segment, plain path characters only. */
const SAME_ORIGIN_PATH = /^\/(?!\/)(?!.*\.\.)[A-Za-z0-9_\-./]+$/;

export function BrandMark({ logoUrl, name = "ShieldRay", showName = false, size = 32 }: BrandMarkProps) {
  const src = logoUrl && SAME_ORIGIN_PATH.test(logoUrl) ? logoUrl : asset("/brand/shieldray-logo.png");
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <img src={src} alt={showName ? "" : name} width={size} height={size} className="shrink-0 rounded-[8px] object-contain" />
      {showName ? <bdi className="truncate text-base font-semibold text-foreground">{name}</bdi> : null}
    </span>
  );
}
