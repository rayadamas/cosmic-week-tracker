import * as Astronomy from 'astronomy-engine';
import { formatInstant } from './dates.js';
import { formatZodiac, signOf } from './zodiac.js';

export const SYNODIC_MONTH = 29.530588853;
/** New moon of 2000-01-06 18:14 UTC. */
export const REFERENCE_NEW_MOON_JD = 2451550.26;

export const PHASES = [
  'New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
  'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent',
];
const QUARTER_NAMES = ['New Moon', 'First Quarter', 'Full Moon', 'Last Quarter'];

/** Each phase covers 45° of Sun–Moon elongation, centered on the principal phases. */
export function phaseNameFromAngle(angle) {
  return PHASES[Math.floor((((angle + 22.5) % 360) + 360) % 360 / 45)];
}

/** Meeus, Astronomical Algorithms ch. 7 (Gregorian calendar). */
export function julianDate(instant) {
  let Y = instant.getUTCFullYear();
  let M = instant.getUTCMonth() + 1;
  const dayFraction = (instant.getUTCHours() + instant.getUTCMinutes() / 60
    + instant.getUTCSeconds() / 3600) / 24;
  const D = instant.getUTCDate() + dayFraction;
  const adjusted = M <= 2;
  if (adjusted) { Y -= 1; M += 12; }
  const A = Math.floor(Y / 100);
  const B = 2 - A + Math.floor(A / 4);
  const termY = Math.floor(365.25 * (Y + 4716));
  const termM = Math.floor(30.6001 * (M + 1));
  const jd = termY + termM + D + B - 1524.5;
  return { jd, Y, M, D, A, B, termY, termM, adjusted };
}

const f = (n, digits = 4) => n.toFixed(digits);

export function moonReport(today) {
  const { instant, tz } = today;

  const jd = julianDate(instant);
  const elapsed = jd.jd - REFERENCE_NEW_MOON_JD;
  const cycles = elapsed / SYNODIC_MONTH;
  const fraction = cycles - Math.floor(cycles);
  const ageDays = fraction * SYNODIC_MONTH;
  const approxAngle = fraction * 360;
  const approxIllumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2 * 100;
  const approxPhase = phaseNameFromAngle(approxAngle);

  const angle = Astronomy.MoonPhase(instant);
  const illumination = Astronomy.Illumination(Astronomy.Body.Moon, instant).phase_fraction * 100;
  const phase = phaseNameFromAngle(angle);
  const moonLon = Astronomy.EclipticGeoMoon(instant).lon;
  const waxing = angle < 180;

  const upcoming = [];
  let mq = Astronomy.SearchMoonQuarter(instant);
  for (let i = 0; i < 4; i++) {
    upcoming.push({
      name: QUARTER_NAMES[mq.quarter],
      iso: mq.time.date.toISOString(),
      label: formatInstant(mq.time.date, tz),
    });
    mq = Astronomy.NextMoonQuarter(mq);
  }

  const utcLabel = instant.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const steps = [
    `**Step 1 — Today's date.** It is **${today.label}** in ${tz}. The calculation uses the current moment, ${formatInstant(instant, tz)} (${utcLabel}).`,
    `**Step 2 — Julian Date.** ${jd.adjusted ? `January and February count as months 13 and 14 of the previous year, so Y = ${jd.Y} and M = ${jd.M}.` : `Y = ${jd.Y}, M = ${jd.M}.`} D = ${f(jd.D, 5)} (day plus the fraction of the day elapsed in UTC).\n` +
      `A = ⌊Y / 100⌋ = ${jd.A}; B = 2 − A + ⌊A / 4⌋ = ${jd.B}\n` +
      `JD = ⌊365.25 × (Y + 4716)⌋ + ⌊30.6001 × (M + 1)⌋ + D + B − 1524.5\n` +
      `JD = ${jd.termY} + ${jd.termM} + ${f(jd.D, 5)} + (${jd.B}) − 1524.5 = **${f(jd.jd, 5)}**`,
    `**Step 3 — Days since a known new moon.** Reference new moon: January 6, 2000 at 18:14 UTC = JD ${REFERENCE_NEW_MOON_JD}.\n` +
      `${f(jd.jd, 5)} − ${REFERENCE_NEW_MOON_JD} = **${f(elapsed)} days**`,
    `**Step 4 — Position in the lunar cycle.** ${f(elapsed)} ÷ ${SYNODIC_MONTH} = ${f(cycles, 5)} cycles. The fractional part, **${f(fraction, 5)}**, is how far we are through the current cycle.`,
    `**Step 5 — Moon age.** ${f(fraction, 5)} × ${SYNODIC_MONTH} = **${f(ageDays, 2)} days** since the last new moon.`,
    `**Step 6 — Phase name.** Each of the 8 phases spans ${f(SYNODIC_MONTH / 8, 2)} days, centered on the new, quarter, and full moons. ${f(ageDays, 2)} days → **${approxPhase}**.`,
    `**Step 7 — Illumination.** Illuminated fraction ≈ (1 − cos(2π × ${f(fraction, 5)})) ÷ 2 = **${f(approxIllumination, 1)}%**.`,
    `**Precision check.** The mean-cycle method above ignores the Moon's elliptical orbit, which shifts real phases by up to ~14 hours. A full lunar ephemeris (astronomy-engine) gives a Sun–Moon elongation of ${f(angle, 2)}°, **${f(illumination, 1)}% illuminated**, **${phase}**, with the Moon at ${formatZodiac(moonLon)}. These precise values are the ones used everywhere else in the app.`,
  ];

  return {
    phase,
    angle,
    illumination,
    waxing,
    ageDays: angle / 360 * SYNODIC_MONTH,
    moonSign: signOf(moonLon),
    moonPosition: formatZodiac(moonLon),
    upcoming,
    approximation: { jd: jd.jd, elapsed, fraction, ageDays, phase: approxPhase, illumination: approxIllumination },
    steps,
  };
}

/** Lightweight snapshot used for the week strip. */
export function moonSnapshot(instant) {
  const angle = Astronomy.MoonPhase(instant);
  return {
    phase: phaseNameFromAngle(angle),
    angle,
    illumination: Astronomy.Illumination(Astronomy.Body.Moon, instant).phase_fraction * 100,
    moonSign: signOf(Astronomy.EclipticGeoMoon(instant).lon),
  };
}
