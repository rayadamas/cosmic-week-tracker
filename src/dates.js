const DAY_MS = 86_400_000;

export class InputError extends Error {}

export function isValidTimeZone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function zonedParts(instant, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(instant);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return {
    year: get('year'), month: get('month'), day: get('day'),
    hour: get('hour'), minute: get('minute'), second: get('second'),
  };
}

function tzOffsetMs(instant, tz) {
  const p = zonedParts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The UTC instant at which the wall clock in `tz` reads the given local time. */
export function zonedTimeToInstant(year, month, day, hour, tz) {
  const guess = Date.UTC(year, month - 1, day, hour);
  let ts = guess - tzOffsetMs(new Date(guess), tz);
  ts = guess - tzOffsetMs(new Date(ts), tz);
  return new Date(ts);
}

function isRealDate(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export function toIso({ year, month, day }) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addDays({ year, month, day }, n) {
  const d = new Date(Date.UTC(year, month - 1, day) + n * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function weekdayIndex({ year, month, day }) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function formatLongDate(d) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }).format(new Date(Date.UTC(d.year, d.month - 1, d.day)));
}

export function formatShortDate(d) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date(Date.UTC(d.year, d.month - 1, d.day)));
}

export function formatInstant(instant, tz) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz, month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(instant);
}

/** Accepts MM/DD/YYYY (also M/D/YYYY, dashes or dots) or YYYY-MM-DD. */
export function parseDateInput(input) {
  const s = String(input ?? '').trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  let year, month, day;
  if (m) {
    [month, day, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    return null;
  }
  return isRealDate(year, month, day) ? { year, month, day } : null;
}

export function parseBirthdate(input, today) {
  const d = parseDateInput(input);
  if (!d) throw new InputError('Enter your birthdate as MM/DD/YYYY.');
  if (d.year < 1800) throw new InputError('Birthdates before 1800 are not supported.');
  if (today && toIso(d) > toIso(today)) throw new InputError('That birthdate is in the future.');
  return d;
}

/**
 * Resolves "today" for the user. Without an override this is the real current
 * date in the user's timezone, and `instant` is right now. With an ISO `date`
 * override, `instant` is local noon on that date.
 */
export function resolveToday({ tz, date, now = new Date() } = {}) {
  const zone = isValidTimeZone(tz) ? tz : 'UTC';
  let local, instant, isOverride = false;
  if (date) {
    local = parseDateInput(date);
    if (!local) throw new InputError('Invalid date override; use YYYY-MM-DD.');
    instant = zonedTimeToInstant(local.year, local.month, local.day, 12, zone);
    isOverride = true;
  } else {
    const p = zonedParts(now, zone);
    local = { year: p.year, month: p.month, day: p.day };
    instant = now;
  }
  return {
    ...local,
    tz: zone,
    iso: toIso(local),
    label: formatLongDate(local),
    instant,
    isOverride,
  };
}
