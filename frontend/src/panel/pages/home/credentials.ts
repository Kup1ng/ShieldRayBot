/** The rules the password-change form checks before posting (the server applies the full policy). */

import { fa } from "../../core/format";

export const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 64;
export const PASSWORD_MIN = 12;

export type CredentialFields = { old_username: string; current_password: string; new_username: string; new_password: string };

/** The first thing wrong with the form, in the words the old page's field rules used; "" when it can be sent. */
export function credentialError(fields: CredentialFields): string {
  const { old_username, current_password, new_username, new_password } = fields;
  if (!old_username.trim() || !current_password || !new_username.trim() || !new_password) return "همه فیلدها الزامی هستند";
  const oldLength = old_username.trim().length;
  if (oldLength < USERNAME_MIN || oldLength > USERNAME_MAX) return `یوزر قدیم باید ${fa(USERNAME_MIN)} تا ${fa(USERNAME_MAX)} کاراکتر باشد`;
  const next = new_username.trim();
  if (next.length < USERNAME_MIN || next.length > USERNAME_MAX) return `یوزر جدید باید ${fa(USERNAME_MIN)} تا ${fa(USERNAME_MAX)} کاراکتر باشد`;
  if (!USERNAME_PATTERN.test(next)) return "یوزر جدید فقط حروف انگلیسی، عدد و _ می‌پذیرد";
  if (new_password.length < PASSWORD_MIN) return `رمز جدید باید حداقل ${fa(PASSWORD_MIN)} کاراکتر باشد`;
  return "";
}

