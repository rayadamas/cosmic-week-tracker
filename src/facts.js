import { addDays, formatShortDate, parseBirthdate, resolveToday, toIso, weekdayIndex, zonedTimeToInstant } from './dates.js';
import { moonReport, moonSnapshot } from './moon.js';
import { personalDayOnly, personalNumbers } from './numerology.js';
import { skyReport } from './sky.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Monday-to-Sunday week containing `today`, with moon and Personal Day per day. */
function cosmicWeek(today, birth) {
  const offsetToMonday = (weekdayIndex(today) + 6) % 7;
  const monday = addDays(today, -offsetToMonday);
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    const instant = zonedTimeToInstant(d.year, d.month, d.day, 12, today.tz);
    const moon = moonSnapshot(instant);
    return {
      iso: toIso(d),
      weekday: WEEKDAYS[weekdayIndex(d)],
      dayOfMonth: d.day,
      label: formatShortDate(d),
      isToday: toIso(d) === today.iso,
      phase: moon.phase,
      angle: moon.angle,
      illumination: moon.illumination,
      moonSign: moon.moonSign,
      personalDay: birth ? personalDayOnly(birth, d) : null,
    };
  });
}

export function computeFacts({ birthdate, tz, date, now }) {
  const today = resolveToday({ tz, date, now });
  const birth = parseBirthdate(birthdate, today);
  return {
    today: {
      iso: today.iso,
      label: today.label,
      tz: today.tz,
      instant: today.instant.toISOString(),
      isOverride: today.isOverride,
    },
    birth: { ...birth, iso: toIso(birth), label: formatShortDate(birth) },
    moon: moonReport(today),
    numerology: personalNumbers(birth, today),
    sky: skyReport(today, birth),
    week: cosmicWeek(today, birth),
  };
}
