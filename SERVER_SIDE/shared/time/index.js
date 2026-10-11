/**
 * EAT (East Africa Time, UTC+3) helpers.
 * Store everything as UTC; display/compute business logic in EAT.
 */
import { toZonedTime, fromZonedTime, format } from 'date-fns-tz';
import { addMinutes, isBefore, isAfter, parseISO } from 'date-fns';

export const EAT_TZ = 'Africa/Nairobi';

/** Convert a UTC Date to EAT-zoned Date */
export function toEAT(utcDate) {
  return toZonedTime(utcDate, EAT_TZ);
}

/** Convert EAT wall-clock time to UTC Date */
export function fromEAT(eatDate) {
  return fromZonedTime(eatDate, EAT_TZ);
}

/** Format a UTC Date as EAT string */
export function formatEAT(utcDate, fmt = 'yyyy-MM-dd HH:mm:ss zzz') {
  return format(utcDate, fmt, { timeZone: EAT_TZ });
}

/**
 * Returns true if `now` (UTC) is before the same-day cut-off in EAT.
 * cutoffTime: "14:00" (HH:mm)
 */
export function isBeforeCutoff(now, cutoffTime = '14:00') {
  const [hour, min] = cutoffTime.split(':').map(Number);
  const eatNow = toEAT(now);
  const cutoff = new Date(eatNow);
  cutoff.setHours(hour, min, 0, 0);
  return isBefore(eatNow, cutoff);
}

/**
 * Is `now` within business hours?
 * openTime: "08:00", closeTime: "18:00"
 * workingDays: [1,2,3,4,5,6] (Mon=1 … Sun=0)
 */
export function isBusinessHours(now, { openTime = '08:00', closeTime = '18:00', workingDays = [1,2,3,4,5,6] } = {}) {
  const eatNow = toEAT(now);
  const dayOfWeek = eatNow.getDay(); // 0=Sun
  if (!workingDays.includes(dayOfWeek)) return false;
  const [oh, om] = openTime.split(':').map(Number);
  const [ch, cm] = closeTime.split(':').map(Number);
  const open = new Date(eatNow); open.setHours(oh, om, 0, 0);
  const close = new Date(eatNow); close.setHours(ch, cm, 0, 0);
  return !isBefore(eatNow, open) && isBefore(eatNow, close);
}

/**
 * Calculate a readyBy UTC Date from now + leadTimeMins,
 * respecting business hours and same-day cut-off.
 * Returns the UTC timestamp when the order will be ready.
 */
export function computeReadyBy(now, leadTimeMins, settings = {}) {
  const {
    openTime = '08:00',
    closeTime = '18:00',
    workingDays = [1,2,3,4,5,6],
    sameDayCutoff = '14:00',
    hubProcessingMins = 45,
  } = settings;

  const totalMins = leadTimeMins + hubProcessingMins;

  // Simple: if same-day order before cutoff and total lead time fits within today
  const eatNow = toEAT(now);
  const [ch, cm] = closeTime.split(':').map(Number);
  const close = new Date(eatNow); close.setHours(ch, cm, 0, 0);

  const tentative = addMinutes(now, totalMins);
  const tentativeEAT = toEAT(tentative);

  // If tentative is before close today → same-day promise
  if (isBeforeCutoff(now, sameDayCutoff) && isBefore(tentativeEAT, close)) {
    return tentative;
  }

  // Otherwise → next business day open time
  let next = new Date(eatNow);
  next.setDate(next.getDate() + 1);
  while (!workingDays.includes(next.getDay())) {
    next.setDate(next.getDate() + 1);
  }
  const [oh, om] = openTime.split(':').map(Number);
  next.setHours(oh, om, 0, 0);
  return fromEAT(addMinutes(next, totalMins));
}

/** Add minutes to a Date and return new Date */
export function addMins(date, mins) {
  return addMinutes(date, mins);
}

export { isBefore, isAfter, addMinutes };
