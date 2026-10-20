export const MOODS = ['Energized', 'Scattered', 'Grounded', 'Reflective', 'Anxious', 'Creative', 'Peaceful', 'Restless'];

export const WIDGETS = ['moon', 'numerology', 'transits', 'correlation'];

const deg = (n) => `${n.toFixed(1)}°`;

function section(facts, name) {
  const { today, birth, moon, numerology, sky } = facts;
  switch (name) {
    case 'date':
      return `DATE: ${today.label} (${today.tz}).`;
    case 'birth':
      return `BIRTHDATE: ${birth.label}. Natal Sun: ${sky.natal.sunPosition}${sky.natal.nearCusp ? ' (near a sign cusp; birth time would confirm the sign)' : ''}. Birth time is unknown, so no rising sign or natal Moon.`;
    case 'moon':
      return `MOON: ${moon.phase}, ${moon.illumination.toFixed(1)}% illuminated, ${moon.waxing ? 'waxing' : 'waning'}, ${moon.ageDays.toFixed(1)} days since new moon, Moon at ${moon.moonPosition}.\n` +
        `UPCOMING LUNAR PHASES: ${moon.upcoming.map((u) => `${u.name} ${u.label}`).join('; ')}.`;
    case 'numerology':
      return `NUMEROLOGY: Personal Day ${numerology.personalDay}${numerology.isMaster ? ' (master number)' : ''} — ${numerology.keywords}. Personal Month ${numerology.personalMonth}. Personal Year ${numerology.personalYear} — ${numerology.yearKeywords}.`;
    case 'mercury': {
      const m = sky.mercury;
      const describe = (p) => `retrograde ${p.label}${p.shadowLabel ? `, full shadow ${p.shadowLabel}` : ''}`;
      const lines = [`MERCURY STATUS: ${m.status.toUpperCase()}.`];
      if (m.current) lines.push(`Current cycle: ${describe(m.current)}.`);
      if (m.stationing) lines.push(`Mercury is stationing ${m.stationing.kind} (${m.stationing.label}).`);
      if (m.next) lines.push(`Next cycle: ${describe(m.next)}.`);
      if (m.previous) lines.push(`Previous cycle: ${describe(m.previous)}.`);
      return lines.join(' ');
    }
    case 'positions':
      return `POSITIONS: ${sky.positions.map((p) => `${p.body} ${p.position}${p.retrograde ? ' (retrograde)' : ''}`).join('; ')}.`;
    case 'events': {
      const short = sky.aspects.filter((a) => !a.longRunning);
      const long = sky.aspects.filter((a) => a.longRunning);
      const fmtAspect = (a) => `${a.a} ${a.aspect} ${a.b} (orb ${deg(a.orb)}, ${a.applying ? 'applying' : 'separating'})`;
      const lines = [
        `ASPECTS TODAY: ${short.length ? short.map(fmtAspect).join('; ') : 'none within orb'}.`,
        `LONG-RUNNING GENERATIONAL ASPECTS: ${long.length ? long.map(fmtAspect).join('; ') : 'none'}.`,
        `STATIONS WITHIN 7 DAYS: ${sky.stations.length ? sky.stations.map((s) => `${s.body} stations ${s.kind} ${s.label}`).join('; ') : 'none'}.`,
        `SIGN INGRESSES (±3 days): ${sky.ingresses.length ? sky.ingresses.map((i) => `${i.body} ${i.past ? 'entered' : 'enters'} ${i.sign} ${i.label}`).join('; ') : 'none'}.`,
        `ECLIPSES WITHIN 14 DAYS: ${sky.eclipses.length ? sky.eclipses.map((e) => `${e.kind} ${e.type} eclipse ${e.label}`).join('; ') : 'none'}.`,
      ];
      return lines.join('\n');
    }
    case 'natal':
      return `TRANSITS TO NATAL SUN: ${sky.natal.transits.length ? sky.natal.transits.map((t) => `transiting ${t.body} ${t.aspect} natal Sun (orb ${deg(t.orb)})`).join('; ') : 'none within orb'}.`;
    case 'intensity': {
      const i = sky.intensity;
      return `COSMIC INTENSITY: ${i.score}/10. Computed as base ${i.base}${i.items.map((x) => ` + ${x.points} (${x.label})`).join('')} = ${i.raw.toFixed(2)}, rounded and clamped to 1–10.`;
    }
    default:
      throw new Error(`Unknown section ${name}`);
  }
}

const brief = (facts, names) => names.map((n) => section(facts, n)).join('\n');

function systemPrompt(facts) {
  return [
    'You are the voice of the Cosmic Week Tracker, a guide that blends astronomy, astrology, and numerology with self-reflection.',
    `Today is ${facts.today.label} in the ${facts.today.tz} timezone. Never assume any other date.`,
    'Every value you are given (dates, phases, illumination, positions, retrograde status, aspects, numbers, ratings) was computed in code from an astronomical ephemeris and is correct.',
    'Never recompute, adjust, or contradict those values, and never introduce planetary positions, aspects, retrograde dates, or events that are not in the data.',
    'The reader can already see the step-by-step math, so do not repeat it; interpret it.',
    'Write in Markdown with short paragraphs. Use bold sparingly. No top-level heading.',
    'Acknowledge where meanings come from astrological or numerological tradition rather than hard science, briefly and without undermining the experience.',
  ].join(' ');
}

const BUILDERS = {
  moon: (facts) => ({
    data: brief(facts, ['date', 'moon']),
    task: 'Provide a brief mystical description of what this moon phase means energetically for intuition, action, and rest. Weave in what the Moon\'s current sign adds, and note what the next lunar phase in the list invites. Keep the tone educational, grounded, and poetic. 130–190 words.',
  }),
  numerology: (facts) => ({
    data: brief(facts, ['date', 'birth', 'numerology']),
    task: `Provide a rich, grounded explanation of Personal Day ${facts.numerology.personalDay}'s energetic meaning — what it suggests about focus, relationships, creativity, rest, or challenge today. Briefly frame it within their Personal Month and Personal Year. Keep the tone educational and mystical but practical. 160–230 words.`,
  }),
  transits: (facts) => ({
    data: brief(facts, ['date', 'birth', 'mercury', 'positions', 'events', 'natal', 'intensity']),
    task: [
      'Give an overview of today\'s planetary transits and cosmic weather.',
      'Begin by clearly stating Mercury\'s status from the data (direct, retrograde, pre-shadow, or post-shadow) with the relevant dates, and what it means practically for communication, travel, and technology.',
      'Then describe the 2 to 3 most notable transits from the data. Prefer tight, applying, non-generational aspects, and include any station, ingress, or eclipse listed. For each, briefly explain the astronomical event and its traditional astrological interpretation.',
      'If there is a transit to their natal Sun, mention it personally.',
      'Finally, state the cosmic intensity rating exactly as computed and explain what drives it, using the listed contributors.',
      'Clear, grounded, educational — mystical but never alarmist. 230–330 words.',
    ].join(' '),
  }),
  correlation: (facts, { mood, history }) => {
    const log = history.length
      ? history.map((h) => `${h.date}: ${h.mood} — ${h.phase}, ${Math.round(h.illumination)}% lit, Personal Day ${h.personalDay}`).join('\n')
      : '(no previous entries)';
    return {
      data: [
        brief(facts, ['date', 'birth', 'moon', 'numerology', 'mercury', 'events', 'natal', 'intensity']),
        `MOOD TODAY: ${mood}.`,
        `MOOD LOG (previous days, most recent first):\n${log}`,
      ].join('\n'),
      task: [
        `Perform a thoughtful correlation analysis between their reported mood of "${mood}" and today's cosmic conditions. Use these five parts, each introduced by a short bold label:`,
        '1. The cosmic picture: describe today in 2 to 3 sentences.',
        `2. Your mood and the sky: analyze how "${mood}" aligns or contrasts with today's conditions — be specific and insightful, referencing actual values from the data.`,
        '3. Patterns: if the mood log has 3 or more entries, surface 1 to 2 real patterns between their moods and the moon phases or Personal Day numbers in the log, citing the dates. If it has fewer, say patterns will emerge as they keep logging, and instead offer 1 tendency based on their Sun sign and Personal Year.',
        '4. Working with today: exactly 3 practical, grounded suggestions as a numbered list.',
        '5. Affirmation: a single personalized cosmic affirmation — one sentence, written directly to them, that integrates their mood, their birthdate energy, and today\'s cosmic weather.',
        'Tone: warm, mystical, educational, empowering, and never fatalistic. 330–450 words.',
      ].join('\n'),
    };
  },
};

export function buildMessages(widget, facts, extras = {}) {
  const { data, task } = BUILDERS[widget](facts, extras);
  return [
    { role: 'system', content: systemPrompt(facts) },
    { role: 'user', content: `<computed_data>\n${data}\n</computed_data>\n\n${task}` },
  ];
}

/** Keeps only well-formed mood log entries from the client. */
export function sanitizeHistory(history, todayIso) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((h) => h && typeof h === 'object'
      && /^\d{4}-\d{2}-\d{2}$/.test(h.date) && h.date < todayIso
      && MOODS.includes(h.mood)
      && typeof h.phase === 'string' && h.phase.length < 40
      && Number.isFinite(h.illumination) && Number.isInteger(h.personalDay))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 30)
    .map(({ date, mood, phase, illumination, personalDay }) => ({ date, mood, phase, illumination, personalDay }));
}
