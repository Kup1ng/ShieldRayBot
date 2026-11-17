/** Shapes of /api/mini/onboarding (see app/api/miniapp_onboarding.py, app/services/miniapp_onboarding.py). */
import { BLOCKED, ENTRY_PENDING, ApiError } from "../../core/api";

export const ONBOARDING_PATH = "/api/mini/onboarding";
export const REFERRAL_PATH = `${ONBOARDING_PATH}/referral`;
export const JOIN_CHECK_PATH = `${ONBOARDING_PATH}/join-check`;
export const TERMS_PATH = `${ONBOARDING_PATH}/terms`;

/** The server's cap on a referral code (`REFERRAL_CODE_MAX_CHARS`). */
export const REFERRAL_MAX = 64;

export type ChannelStatus = "joined" | "missing" | "unverified";

export type Channel = {
  label: string;
  /** A t.me link, or "" when the admin saved a private channel without its invite link. */
  url: string;
  status: ChannelStatus;
};

export type OnboardingStep =
  | { step: "referral"; text: string; invalid?: boolean }
  | { step: "force_join"; text: string; check_label: string; channels: Channel[] }
  | { step: "terms"; text: string; button: string }
  | { step: "ready" };

const STEPS = new Set(["referral", "force_join", "terms", "ready"]);

export function isOnboardingStep(value: unknown): value is OnboardingStep {
  return Boolean(value) && typeof value === "object" && STEPS.has(String((value as { step?: unknown }).step));
}

export type Refusal = "pending" | "blocked";

/** Refusals that end onboarding with a screen of their own: waiting for an admin, or blocked. */
export function refusalKind(err: unknown): Refusal | null {
  if (!(err instanceof ApiError) || err.status !== 403) return null;
  if (err.code === ENTRY_PENDING) return "pending";
  if (err.code === BLOCKED) return "blocked";
  return null;
}
