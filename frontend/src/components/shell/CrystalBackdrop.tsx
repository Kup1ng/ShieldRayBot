import { asset } from "@/lib/asset";

/**
 * The Figma "3D shapes" layer: purple glass crystals behind the frosted panels. Fixed to the
 * viewport and inert, so it never scrolls, catches taps or reaches assistive tech.
 */
export function CrystalBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
      <img
        src={asset("/brand/crystal-b.webp")}
        alt=""
        width={720}
        height={720}
        decoding="async"
        className="absolute -top-[200px] -left-[260px] size-[600px] max-w-none opacity-[var(--crystal-opacity)]"
      />
      <img
        src={asset("/brand/crystal-a.webp")}
        alt=""
        width={720}
        height={720}
        decoding="async"
        className="absolute top-1/2 left-1/2 size-[600px] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-20"
      />
      <img
        src={asset("/brand/crystal-c.webp")}
        alt=""
        width={720}
        height={720}
        decoding="async"
        className="absolute -right-[250px] -bottom-[240px] size-[600px] max-w-none -scale-y-100 rotate-180 opacity-[var(--crystal-opacity)]"
      />
    </div>
  );
}
