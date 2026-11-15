/** Confirmation before a destructive or paying panel action, answered by the Figma dialog. */
import type { ConfirmOptions, ConfirmPresenter } from "@/components/feedback/ConfirmHost";

let presenter: ConfirmPresenter | null = null;

export function setConfirmPresenter(next: ConfirmPresenter | null): () => void {
  presenter = next;
  return () => {
    if (presenter === next) presenter = null;
  };
}

/** The in-app dialog while the shell is mounted, the browser's confirm otherwise. */
export function confirm(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  if (presenter) return presenter(message, options);
  return Promise.resolve(window.confirm(message));
}
