import type { ComponentType } from "react";

import { BackupView } from "./BackupView";
import { GeneralView } from "./GeneralView";
import { PwaView } from "./PwaView";
import { SslView } from "./SslView";
import { UpdateView } from "./UpdateView";

/**
 * Views of the panel-system settings tabs (general, backup, pwa, ssl, update), keyed by `?tab=`.
 * The /settings page frame renders the view for a panel tab from here; each view loads its own data.
 */
export const SYSTEM_TAB_VIEWS: Partial<Record<string, ComponentType>> = {
  general: GeneralView,
  backup: BackupView,
  pwa: PwaView,
  ssl: SslView,
  update: UpdateView,
};
