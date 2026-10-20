import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBirthdate, parseDateInput, resolveToday, InputError } from '../src/dates.js';
import { computeFacts } from '../src/facts.js';
import { julianDate, moonReport, phaseNameFromAngle } from '../src/moon.js';
import { personalNumbers, reduce } from '../src/numerology.js';
import { buildMessages, sanitizeHistory } from '../src/prompts.js';
import { skyReport } from '../src/sky.js';

const at = (iso, tz = 'UTC') => resolveToday({ tz, now: new Date(iso) });

test('today is the real current date in the user timezone, never a fixed date', () => {
  const t = at('2026-10-19T22:45:00Z', 'America/Chicago');
  assert.equal(t.iso, '2026-10-19');
  assert.equal(t.label, 'Monday, October 19, 2026');

  assert.equal(at('2026-10-20T03:30:00Z', 'America/Chicago').iso, '2026-10-19');
  assert.equal(at('2026-10-20T03:30:00Z', 'Asia/Tokyo').iso, '2026-10-20');
  assert.equal(at('2027-01-01T00:00:00Z').iso, '2027-01-01');
});

test('unknown timezones fall back to UTC', () => {
  assert.equal(resolveToday({ tz: 'Not/AZone', now: new Date('2026-05-12T12:00:00Z') }).tz, 'UTC');
});

test('birthdate parsing', () => {
  assert.deepEqual(parseDateInput('07/14/1995'), { year: 1995, month: 7, day: 14 });
  assert.deepEqual(parseDateInput('7/4/1995'), { year: 1995, month: 7, day: 4 });
  assert.deepEqual(parseDateInput('1995-07-14'), { year: 1995, month: 7, day: 14 });
  assert.equal(parseDateInput('02/30/1995'), null);
  assert.equal(parseDateInput('14/07/1995'), null);
  assert.throws(() => parseBirthdate('01/01/2030', { year: 2026, month: 10, day: 19 }), InputError);
});

test('Julian Date matches Meeus reference values', () => {
  assert.equal(julianDate(new Date('2000-01-01T12:00:00Z')).jd, 2451545.0);
  // Meeus example 7.a: 1957 October 4.81 = JD 2436116.31
  assert.ok(Math.abs(julianDate(new Date('1957-10-04T19:26:24Z')).jd - 2436116.31) < 1e-6);
  // January/February use the previous year as months 13 and 14.
  const feb = new Date('2024-02-29T00:00:00Z');
  assert.equal(julianDate(feb).jd, feb.getTime() / 86_400_000 + 2440587.5);
});

test('phase bins are centered on the principal phases', () => {
  assert.equal(phaseNameFromAngle(0), 'New Moon');
  assert.equal(phaseNameFromAngle(350), 'New Moon');
  assert.equal(phaseNameFromAngle(45), 'Waxing Crescent');
  assert.equal(phaseNameFromAngle(90), 'First Quarter');
  assert.equal(phaseNameFromAngle(180), 'Full Moon');
  assert.equal(phaseNameFromAngle(270), 'Last Quarter');
  assert.equal(phaseNameFromAngle(315), 'Waning Crescent');
});

test('moon report at the October 2026 full moon', () => {
  const m = moonReport(at('2026-10-26T04:12:00Z'));
  assert.equal(m.phase, 'Full Moon');
  assert.ok(m.illumination > 99.5);
  assert.equal(m.approximation.phase, 'Full Moon');
});

test('numerology reduction keeps master numbers', () => {
  assert.equal(reduce(29).value, 11);
  assert.equal(reduce(29, { keepMasters: false }).value, 2);
  assert.equal(reduce(38).value, 11);
  assert.equal(reduce(48).value, 3);
  assert.deepEqual(reduce(48).trail, ['48 → 4 + 8 = 12', '12 → 1 + 2 = 3']);
});

test('personal day chain', () => {
  const n = personalNumbers({ year: 1995, month: 7, day: 14 }, { year: 2026, month: 10, day: 19 });
  assert.equal(n.personalYear, 4); // 7 + 14 + 10 = 31 → 4
  assert.equal(n.personalMonth, 5); // 4 + 10 = 14 → 5
  assert.equal(n.personalDay, 6); // 5 + 19 = 24 → 6

  const master = personalNumbers({ year: 1995, month: 7, day: 14 }, { year: 2026, month: 10, day: 24 });
  assert.equal(master.personalDay, 11); // 5 + 24 = 29 → 11
  assert.equal(master.isMaster, true);
});

test('Mercury retrograde periods for 2026 come from the ephemeris', () => {
  const sky = skyReport(at('2026-05-12T12:00:00Z'), null);
  const starts = sky.mercury.thisYear.map((p) => p.start.slice(0, 10));
  const ends = sky.mercury.thisYear.map((p) => p.end.slice(0, 10));
  assert.deepEqual(starts, ['2026-02-26', '2026-06-29', '2026-10-24']);
  assert.deepEqual(ends, ['2026-03-20', '2026-07-23', '2026-11-13']);
  assert.equal(sky.mercury.status, 'direct');
});

test('Mercury status transitions through shadow and retrograde', () => {
  assert.equal(skyReport(at('2026-10-19T12:00:00Z'), null).mercury.status, 'pre-shadow');
  assert.equal(skyReport(at('2026-11-01T12:00:00Z'), null).mercury.status, 'retrograde');
  assert.equal(skyReport(at('2026-11-20T12:00:00Z'), null).mercury.status, 'post-shadow');
  assert.equal(skyReport(at('2026-12-10T12:00:00Z'), null).mercury.status, 'direct');
});

test('facts include natal Sun, week strip, and a bounded intensity score', () => {
  const f = computeFacts({ birthdate: '07/14/1995', tz: 'America/Chicago', now: new Date('2026-10-19T22:45:00Z') });
  assert.equal(f.sky.natal.sunSign, 'Cancer');
  assert.equal(f.week.length, 7);
  assert.equal(f.week[0].weekday, 'Mon');
  assert.equal(f.week.filter((d) => d.isToday).length, 1);
  assert.ok(f.sky.intensity.score >= 1 && f.sky.intensity.score <= 10);
});

test('prompts carry the real date and forbid recomputation', () => {
  const f = computeFacts({ birthdate: '07/14/1995', tz: 'America/Chicago', now: new Date('2026-10-19T22:45:00Z') });
  for (const widget of ['moon', 'numerology', 'transits']) {
    const [system, user] = buildMessages(widget, f);
    assert.match(system.content, /Monday, October 19, 2026/);
    assert.match(system.content, /Never recompute/);
    assert.doesNotMatch(user.content, /May 12/);
  }
  const [, user] = buildMessages('correlation', f, { mood: 'Anxious', history: [] });
  assert.match(user.content, /MOOD TODAY: Anxious/);
});

test('mood history is validated and excludes today', () => {
  const clean = sanitizeHistory([
    { date: '2026-10-18', mood: 'Calm', phase: 'x', illumination: 1, personalDay: 1 },
    { date: '2026-10-17', mood: 'Anxious', phase: 'First Quarter', illumination: 50, personalDay: 4, extra: 'drop' },
    { date: '2026-10-19', mood: 'Grounded', phase: 'First Quarter', illumination: 60, personalDay: 6 },
    'junk',
  ], '2026-10-19');
  assert.deepEqual(clean, [{ date: '2026-10-17', mood: 'Anxious', phase: 'First Quarter', illumination: 50, personalDay: 4 }]);
});
