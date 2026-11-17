/**
 * The service name a shop may require before paying. The rules are the server's
 * (app/services/custom_service_name.py): a lower-case letter, then 2 to 19 letters, digits or «_».
 */
export const NAME_MIN = 3;
export const NAME_MAX = 20;
/** The server refuses anything longer than this before reading it (miniapp_buy_extras). */
export const NAME_INPUT_MAX = 64;
export const NAME_RULES = `فقط حروف انگلیسی کوچک، عدد و _ ؛ بین ${NAME_MIN} تا ${NAME_MAX} نویسه و با یک حرف شروع شود.`;
export const NAME_REQUIRED = "نام سرویس را وارد کنید.";

const NAME_PATTERN = new RegExp(`^[a-z][a-z0-9_]{${NAME_MIN - 1},${NAME_MAX - 1}}$`);
const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const LETTERS_AND_DIGITS = `${LETTERS}0123456789`;
const RANDOM_LENGTH = 8;

/** The name as the server reads it: trimmed, without a leading «@», lower-cased. */
export function cleanServiceName(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

/** Why `raw` cannot be sent, or null when it is a valid name. */
export function serviceNameProblem(raw: string): string | null {
  if (!raw.trim()) return NAME_REQUIRED;
  return NAME_PATTERN.test(cleanServiceName(raw)) ? null : NAME_RULES;
}

/** «تصادفی»: a letter, then seven letters or digits (`random` returns [0, 1)). */
export function randomServiceName(random: () => number = secureRandom): string {
  const pick = (chars: string) => chars[Math.floor(random() * chars.length) % chars.length];
  let name = pick(LETTERS);
  for (let i = 1; i < RANDOM_LENGTH; i += 1) name += pick(LETTERS_AND_DIGITS);
  return name;
}

function secureRandom(): number {
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  return buffer[0] / 2 ** 32;
}
