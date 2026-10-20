import * as Astronomy from 'astronomy-engine';
import { formatInstant, formatShortDate } from './dates.js';
import { angleDiff, formatZodiac, normalizeDeg, signOf } from './zodiac.js';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export const BODIES = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
const PLANETS = BODIES.filter((b) => b !== 'Sun' && b !== 'Moon');
const SLOW = new Set(['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']);

const ASPECTS = [
  { name: 'conjunction', angle: 0, orb: 8, nature: 'intensifying' },
  { name: 'sextile', angle: 60, orb: 4, nature: 'harmonious' },
  { name: 'square', angle: 90, orb: 7, nature: 'challenging' },
  { name: 'trine', angle: 120, orb: 7, nature: 'harmonious' },
  { name: 'opposition', angle: 180, orb: 8, nature: 'challenging' },
];
const MOON_MAX_ORB = 6;
const NATAL_ORB = 3;

const at = (ms) => new Date(ms);

/** Geocentric tropical longitude on the true ecliptic of date. */
export function longitude(body, date) {
  if (body === 'Moon') return Astronomy.EclipticGeoMoon(date).lon;
  return Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body[body], date, true)).elon;
}

/** Apparent motion in degrees per day. */
export function dailyMotion(body, date) {
  const t = date.getTime();
  return angleDiff(longitude(body, at(t + 6 * HOUR_MS)), longitude(body, at(t - 6 * HOUR_MS))) * 2;
}

/** Finds the moment in [t1, t2] where `f` changes sign, assuming it does so once. */
function bisect(f, t1, t2, toleranceMs = 60_000) {
  let a = t1, b = t2;
  const fa = Math.sign(f(at(a)));
  while (b - a > toleranceMs) {
    const mid = (a + b) / 2;
    if (Math.sign(f(at(mid))) === fa) a = mid; else b = mid;
  }
  return at((a + b) / 2);
}

/** Scans [start, end] for zero crossings of `f`, sampling every `stepMs`. */
function crossings(f, start, end, stepMs) {
  const found = [];
  let prevT = start;
  let prevV = f(at(start));
  for (let t = start + stepMs; t <= end; t += stepMs) {
    const v = f(at(t));
    if (Math.sign(v) !== Math.sign(prevV) && Math.abs(v - prevV) < 90) {
      found.push({ time: bisect(f, prevT, t), rising: v > prevV });
    }
    prevT = t; prevV = v;
  }
  return found;
}

export function stations(body, start, end) {
  return crossings((d) => dailyMotion(body, d), start, end, DAY_MS)
    .map(({ time, rising }) => ({
      body,
      kind: rising ? 'direct' : 'retrograde',
      time,
      lon: longitude(body, time),
    }));
}

function retrogradePeriods(body, start, end) {
  const list = stations(body, start, end);
  const periods = [];
  for (let i = 0; i < list.length; i++) {
    const sr = list[i];
    const sd = list[i + 1];
    if (sr.kind !== 'retrograde' || !sd || sd.kind !== 'direct') continue;
    const pre = crossings((d) => angleDiff(longitude(body, d), sd.lon),
      sr.time.getTime() - 45 * DAY_MS, sr.time.getTime(), DAY_MS / 2).filter((c) => c.rising).pop();
    const post = crossings((d) => angleDiff(longitude(body, d), sr.lon),
      sd.time.getTime(), sd.time.getTime() + 45 * DAY_MS, DAY_MS / 2).find((c) => c.rising);
    periods.push({
      start: sr.time, end: sd.time,
      startLon: sr.lon, endLon: sd.lon,
      preShadowStart: pre?.time ?? null,
      postShadowEnd: post?.time ?? null,
    });
    i++;
  }
  return periods;
}

function mercuryReport(instant, today) {
  const t = instant.getTime();
  const yearStart = Date.UTC(today.year, 0, 1);
  const yearEnd = Date.UTC(today.year + 1, 0, 1);
  const periods = retrogradePeriods('Mercury',
    Math.min(yearStart, t) - 160 * DAY_MS, Math.max(yearEnd, t) + 160 * DAY_MS);

  let status = 'direct';
  let current = null;
  for (const p of periods) {
    if (t >= p.start && t < p.end) { status = 'retrograde'; current = p; break; }
    if (p.preShadowStart && t >= p.preShadowStart && t < p.start) { status = 'pre-shadow'; current = p; break; }
    if (p.postShadowEnd && t >= p.end && t < p.postShadowEnd) { status = 'post-shadow'; current = p; break; }
  }
  const next = periods.find((p) => p.start > t && p !== current) ?? null;
  const previous = [...periods].reverse().find((p) => p.end <= t && p !== current) ?? null;
  const thisYear = periods.filter((p) => p.end >= yearStart && p.start < yearEnd);

  const station = periods.flatMap((p) => [
    { kind: 'retrograde', time: p.start }, { kind: 'direct', time: p.end },
  ]).find((s) => Math.abs(s.time - t) < 2 * DAY_MS) ?? null;

  const tz = today.tz;
  const fmt = (p) => ({
    start: p.start.toISOString(),
    end: p.end.toISOString(),
    label: `${formatShortDate(dateParts(p.start, tz))} – ${formatShortDate(dateParts(p.end, tz))}`,
    retrogradeSpan: `${formatZodiac(p.startLon)} back to ${formatZodiac(p.endLon)}`,
    preShadowStart: p.preShadowStart?.toISOString() ?? null,
    postShadowEnd: p.postShadowEnd?.toISOString() ?? null,
    shadowLabel: p.preShadowStart && p.postShadowEnd
      ? `${formatShortDate(dateParts(p.preShadowStart, tz))} – ${formatShortDate(dateParts(p.postShadowEnd, tz))}`
      : null,
  });

  return {
    status,
    stationing: station ? { kind: station.kind, label: formatInstant(station.time, tz) } : null,
    current: current ? fmt(current) : null,
    next: next ? fmt(next) : null,
    previous: previous ? fmt(previous) : null,
    thisYear: thisYear.map(fmt),
  };
}

function dateParts(date, tz) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' })
    .formatToParts(date);
  const get = (type) => Number(p.find((x) => x.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function positions(instant) {
  return BODIES.map((body) => {
    const lon = longitude(body, instant);
    const motion = dailyMotion(body, instant);
    return {
      body,
      lon,
      sign: signOf(lon),
      position: formatZodiac(lon),
      motion,
      retrograde: !['Sun', 'Moon'].includes(body) && motion < 0,
    };
  });
}

function findAspect(sep, maxOrbOverride) {
  for (const a of ASPECTS) {
    const orb = Math.abs(sep - a.angle);
    const limit = maxOrbOverride ? Math.min(a.orb, maxOrbOverride) : a.orb;
    if (orb <= limit) return { ...a, orb };
  }
  return null;
}

function aspects(instant, pos) {
  const later = at(instant.getTime() + HOUR_MS);
  const found = [];
  for (let i = 0; i < pos.length; i++) {
    for (let j = i + 1; j < pos.length; j++) {
      const a = pos[i], b = pos[j];
      const sep = Math.abs(angleDiff(a.lon, b.lon));
      const moon = a.body === 'Moon' || b.body === 'Moon';
      const hit = findAspect(sep, moon ? MOON_MAX_ORB : null);
      if (!hit) continue;
      const sepLater = Math.abs(angleDiff(longitude(a.body, later), longitude(b.body, later)));
      found.push({
        a: a.body, b: b.body,
        aspect: hit.name, nature: hit.nature,
        orb: hit.orb,
        applying: Math.abs(sepLater - hit.angle) < hit.orb,
        longRunning: SLOW.has(a.body) && SLOW.has(b.body),
        involvesMoon: moon,
      });
    }
  }
  return found.sort((x, y) => x.orb - y.orb);
}

function ingresses(instant, tz) {
  const t = instant.getTime();
  const events = [];
  for (const body of BODIES) {
    const window = body === 'Moon' ? 2.5 * DAY_MS : 3 * DAY_MS;
    const segments = body === 'Moon' ? [[t, t + window]] : [[t - window, t], [t, t + window]];
    for (const [s, e] of segments) {
      const startSign = signOf(longitude(body, at(s)));
      if (signOf(longitude(body, at(e))) === startSign) continue;
      const time = bisect((d) => (signOf(longitude(body, d)) === startSign ? -1 : 1), s, e);
      events.push({
        body,
        sign: signOf(longitude(body, at(time.getTime() + HOUR_MS))),
        time: time.toISOString(),
        label: formatInstant(time, tz),
        past: time.getTime() < t,
      });
    }
  }
  return events;
}

function nearbyStations(instant, tz) {
  const t = instant.getTime();
  return PLANETS.flatMap((body) => stations(body, t - 7 * DAY_MS, t + 7 * DAY_MS))
    .map((s) => ({
      body: s.body,
      kind: s.kind,
      time: s.time.toISOString(),
      label: formatInstant(s.time, tz),
      daysAway: (s.time.getTime() - t) / DAY_MS,
    }));
}

function nearbyEclipses(instant, tz) {
  const t = instant.getTime();
  const from = at(t - 14 * DAY_MS);
  const found = [];
  const lunar = Astronomy.SearchLunarEclipse(from);
  if (Math.abs(lunar.peak.date.getTime() - t) <= 14 * DAY_MS) {
    found.push({ type: 'lunar', kind: lunar.kind, time: lunar.peak.date.toISOString(), label: formatInstant(lunar.peak.date, tz), daysAway: (lunar.peak.date.getTime() - t) / DAY_MS });
  }
  const solar = Astronomy.SearchGlobalSolarEclipse(from);
  if (Math.abs(solar.peak.date.getTime() - t) <= 14 * DAY_MS) {
    found.push({ type: 'solar', kind: solar.kind, time: solar.peak.date.toISOString(), label: formatInstant(solar.peak.date, tz), daysAway: (solar.peak.date.getTime() - t) / DAY_MS });
  }
  return found;
}

function natalReport(birth, instant, pos) {
  const birthNoon = at(Date.UTC(birth.year, birth.month - 1, birth.day, 12));
  const lon = longitude('Sun', birthNoon);
  const withinSign = normalizeDeg(lon) % 30;
  const transits = [];
  for (const p of pos) {
    const sep = Math.abs(angleDiff(p.lon, lon));
    const hit = findAspect(sep, p.body === 'Moon' ? 2 : NATAL_ORB);
    if (hit) transits.push({ body: p.body, aspect: hit.name, nature: hit.nature, orb: hit.orb });
  }
  return {
    sunSign: signOf(lon),
    sunPosition: formatZodiac(lon),
    nearCusp: withinSign < 1 || withinSign > 29,
    transits: transits.sort((x, y) => x.orb - y.orb),
  };
}

function intensity({ mercury, moonAngle, aspectList, retrogrades, stationList, eclipses, natal }) {
  const items = [];
  const add = (points, label) => items.push({ points, label });

  if (mercury.status === 'retrograde') add(1.5, 'Mercury is retrograde');
  else if (mercury.status !== 'direct') add(0.5, `Mercury is in its ${mercury.status} zone`);

  for (const s of stationList) {
    if (Math.abs(s.daysAway) <= 3) add(s.body === 'Mercury' ? 1 : 0.75, `${s.body} stations ${s.kind} within 3 days`);
  }

  const fromNewOrFull = Math.min(Math.abs(angleDiff(moonAngle, 0)), Math.abs(angleDiff(moonAngle, 180)));
  if (fromNewOrFull <= 18) add(1.5, `Within ~1.5 days of a ${Math.abs(angleDiff(moonAngle, 180)) <= 18 ? 'full' : 'new'} moon`);

  for (const e of eclipses) {
    if (Math.abs(e.daysAway) <= 7) add(2, `A ${e.type} eclipse within a week`);
  }

  for (const a of aspectList) {
    if (a.longRunning || a.involvesMoon || a.orb > 2) continue;
    if (a.nature === 'challenging') add(0.75, `Tight ${a.a}–${a.b} ${a.aspect} (${a.orb.toFixed(1)}°)`);
    else if (a.aspect === 'conjunction') add(0.5, `Tight ${a.a}–${a.b} conjunction (${a.orb.toFixed(1)}°)`);
  }

  for (const r of ['Venus', 'Mars']) {
    if (retrogrades.includes(r)) add(0.75, `${r} is retrograde`);
  }

  if (natal) {
    for (const t of natal.transits) {
      if (['Mars', 'Saturn', 'Uranus', 'Pluto'].includes(t.body) && t.nature !== 'harmonious') {
        add(0.75, `Transiting ${t.body} ${t.aspect} your natal Sun`);
      }
    }
  }

  const BASE = 3;
  const raw = BASE + items.reduce((s, i) => s + i.points, 0);
  return {
    score: Math.max(1, Math.min(10, Math.round(raw))),
    base: BASE,
    raw,
    items,
  };
}

export function skyReport(today, birth) {
  const { instant, tz } = today;
  const pos = positions(instant);
  const mercury = mercuryReport(instant, today);
  const aspectList = aspects(instant, pos);
  const retrogrades = pos.filter((p) => p.retrograde).map((p) => p.body);
  const stationList = nearbyStations(instant, tz);
  const eclipses = nearbyEclipses(instant, tz);
  const natal = birth ? natalReport(birth, instant, pos) : null;
  const moonAngle = Astronomy.MoonPhase(instant);

  const score = intensity({ mercury, moonAngle, aspectList, retrogrades, stationList, eclipses, natal });

  return {
    positions: pos.map(({ lon, ...rest }) => ({ ...rest, lon: Number(lon.toFixed(3)) })),
    retrogrades,
    mercury,
    aspects: aspectList,
    ingresses: ingresses(instant, tz),
    stations: stationList,
    eclipses,
    natal,
    intensity: score,
  };
}
