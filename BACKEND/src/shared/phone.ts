import { parsePhoneNumberFromString } from 'libphonenumber-js';

/** "0712 345 678" → "+254712345678". Returns null if not a valid number. */
export function normalizePhone(input: string): string | null {
  const phone = parsePhoneNumberFromString(input, 'KE');
  return phone?.isValid() ? phone.number : null;
}
