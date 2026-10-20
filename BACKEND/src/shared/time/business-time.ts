// Business-time helpers for East Africa Time (EAT = UTC+3, no daylight saving).
// Because EAT never changes offset, we can do the maths with a fixed +3h shift.

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type BusinessHours = {
  openMinutes: number; // 08:00 → 480
  closeMinutes: number; // 18:00 → 1080
  workingDays: number[]; // 0 = Sunday … 6 = Saturday
};

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  openMinutes: 8 * 60,
  closeMinutes: 18 * 60,
  workingDays: [1, 2, 3, 4, 5, 6], // Mon–Sat
};

/** Minutes since midnight in EAT, and the EAT weekday. */
function eatParts(date: Date) {
  const shifted = new Date(date.getTime() + EAT_OFFSET_MS);
  return { minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(), weekday: shifted.getUTCDay() };
}

/** Midnight (EAT) of the day containing `date`, as a real instant. */
function eatMidnight(date: Date): Date {
  const shifted = date.getTime() + EAT_OFFSET_MS;
  return new Date(Math.floor(shifted / DAY_MS) * DAY_MS - EAT_OFFSET_MS);
}

/** Next moment the business is open (returns `date` itself if open now). */
export function nextOpenMoment(date: Date, hours = DEFAULT_BUSINESS_HOURS): Date {
  let day = eatMidnight(date);
  for (let i = 0; i < 14; i++) {
    const open = new Date(day.getTime() + hours.openMinutes * 60_000);
    const close = new Date(day.getTime() + hours.closeMinutes * 60_000);
    if (hours.workingDays.includes(eatParts(day).weekday)) {
      if (date < open) return open;
      if (date < close) return date;
    }
    day = new Date(day.getTime() + DAY_MS);
  }
  throw new Error('No working days configured');
}

/** Opening time of the next business day after `date`'s day. */
export function nextBusinessDayOpen(date: Date, hours = DEFAULT_BUSINESS_HOURS): Date {
  return nextOpenMoment(new Date(eatMidnight(date).getTime() + DAY_MS), hours);
}

/** Add working minutes, skipping nights, and closed days. */
export function addBusinessMinutes(start: Date, minutes: number, hours = DEFAULT_BUSINESS_HOURS): Date {
  let cursor = nextOpenMoment(start, hours);
  let remaining = minutes;
  while (remaining > 0) {
    const close = new Date(eatMidnight(cursor).getTime() + hours.closeMinutes * 60_000);
    const available = (close.getTime() - cursor.getTime()) / 60_000;
    if (remaining <= available) return new Date(cursor.getTime() + remaining * 60_000);
    remaining -= available;
    cursor = nextOpenMoment(new Date(close.getTime() + 1), hours);
  }
  return cursor;
}

/** True if `date` is after the same-day sourcing cut-off (e.g. "14:00") in EAT. */
export function isAfterCutoff(date: Date, cutoff: string): boolean {
  const [h, m] = cutoff.split(':').map(Number);
  return eatParts(date).minutes >= (h ?? 0) * 60 + (m ?? 0);
}

/** "today by 4:30 PM" / "tomorrow by 10:00 AM" / "Thu by 11:15 AM" — in EAT. */
export function formatReadyBy(readyBy: Date, now = new Date()): string {
  const time = new Intl.DateTimeFormat('en-KE', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Nairobi' })
    .format(readyBy)
    .replace(/[  ]/g, ' ') // some ICU versions use special spaces before AM/PM
    .toUpperCase();
  const dayDiff = Math.round((eatMidnight(readyBy).getTime() - eatMidnight(now).getTime()) / DAY_MS);
  if (dayDiff === 0) return `today by ${time}`;
  if (dayDiff === 1) return `tomorrow by ${time}`;
  const weekday = new Intl.DateTimeFormat('en-KE', { weekday: 'short', timeZone: 'Africa/Nairobi' }).format(readyBy);
  return `${weekday} by ${time}`;
}
