import { Icon as Iconify } from "@iconify/react";

import { SOLAR_ICONS } from "./solar-data";

type IconProps = {
  /** A bundled Solar icon, e.g. "solar:wallet-bold". */
  name: string;
  size?: number;
  className?: string;
  /** Decorative by default; pass a label when the icon is the only content. */
  label?: string;
};

/** Offline icon: data comes from the build-time bundle, never from the network. */
export function Icon({ name, size = 24, className, label }: IconProps) {
  const data = SOLAR_ICONS[name];
  if (!data) return null;
  return (
    <Iconify
      icon={data}
      width={size}
      height={size}
      className={className}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}
