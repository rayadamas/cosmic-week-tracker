import { marked } from '/vendor/marked.js';
import DOMPurify from '/vendor/purify.js';

const STORAGE = { birthdate: 'cwt.birthdate', mood: 'cwt.mood', log: 'cwt.moodLog' };
const AI_WIDGETS = ['moon', 'numerology', 'transits'];
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

const $ = (sel, root = document) => root.querySelector(sel);
const card = (widget) => $(`[data-widget="${widget}"]`);
const slot = (widget, name) => $(`[data-slot="${name}"]`, card(widget));

const state = {
  config: null,
  facts: null,
  factsKey: null,
  controllers: {},
  texts: {},
};

const md = (text, opts) => DOMPurify.sanitize(marked.parse(text, opts));
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function localIsoDate() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return p;
}

// ---------- Moon drawing ----------

/** Lit side follows the northern-hemisphere view: waxing lights the right limb. */
function moonSvg(angle, size = 64) {
  const r = size / 2 - 1;
  const c = size / 2;
  const a = ((angle % 360) + 360) % 360;
  const rx = Math.abs(Math.cos((a * Math.PI) / 180)) * r;
  const waxing = a < 180;
  const outerSweep = waxing ? 1 : 0;
  const innerSweep = waxing ? (a < 90 ? 0 : 1) : (a > 270 ? 1 : 0);
  const lit = `M ${c} ${c - r} A ${r} ${r} 0 0 ${outerSweep} ${c} ${c + r} A ${rx} ${r} 0 0 ${innerSweep} ${c} ${c - r} Z`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-hidden="true">
    <circle cx="${c}" cy="${c}" r="${r}" fill="var(--moon-dark)" stroke="var(--ink)" stroke-width="1"/>
    <path d="${lit}" fill="var(--moon-lit)"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--ink)" stroke-width="1"/>
  </svg>`;
}

// ---------- Card chrome ----------

const ICONS = {
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
};

function setupActions(widget) {
  const actions = $('.card-actions', card(widget));
  if (!actions) return;
  actions.innerHTML = `
    <button class="icon-btn" data-action="refresh" title="Regenerate" aria-label="Regenerate" disabled>${ICONS.refresh}</button>
    <button class="icon-btn" data-action="copy" title="Copy" aria-label="Copy" disabled>${ICONS.copy}</button>`;
  actions.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    if (btn.dataset.action === 'refresh') {
      interpret(widget, { fresh: true });
    } else {
      await navigator.clipboard.writeText(copyText(widget));
      btn.innerHTML = ICONS.check;
      setTimeout(() => { btn.innerHTML = ICONS.copy; }, 1200);
    }
  });
}

function setActionsEnabled(widget, enabled) {
  card(widget).querySelectorAll('.card-actions button').forEach((b) => { b.disabled = !enabled; });
}

function showContent(widget, show) {
  const c = card(widget);
  $('.placeholder', c).hidden = show;
  $('.content', c).hidden = !show;
}

function copyText(widget) {
  const f = state.facts;
  const parts = [];
  if (widget === 'moon') parts.push(`${f.moon.phase} — ${f.moon.illumination.toFixed(1)}% illuminated`, f.moon.steps.join('\n\n'));
  if (widget === 'numerology') parts.push(`Personal Day ${f.numerology.personalDay}`, f.numerology.steps.join('\n\n'));
  if (widget === 'transits') parts.push(`Mercury: ${f.sky.mercury.status}. Cosmic intensity ${f.sky.intensity.score}/10`);
  if (state.texts[widget]) parts.splice(1, 0, state.texts[widget]);
  return parts.join('\n\n');
}

// ---------- Rendering computed facts ----------

function renderMoon(f) {
  const m = f.moon;
  slot('moon', 'hero').innerHTML = `
    ${moonSvg(m.angle, 72)}
    <div>
      <p class="hero-title">${m.phase}</p>
      <p class="hero-sub">${m.illumination.toFixed(1)}% illuminated · ${m.waxing ? 'Waxing' : 'Waning'} · ${m.ageDays.toFixed(1)} days old<br>Moon in ${m.moonSign}</p>
    </div>`;
  const upcoming = m.upcoming.map((u) => `- **${u.name}** — ${u.label}`).join('\n');
  slot('moon', 'steps').innerHTML = md(`${m.steps.join('\n\n')}\n\n**Upcoming phases**\n\n${upcoming}`, { breaks: true });
}

function renderNumerology(f) {
  const n = f.numerology;
  slot('numerology', 'hero').innerHTML = `
    <div class="number-badge">${n.personalDay}</div>
    <div>
      <p class="hero-title">Personal Day ${n.personalDay}${n.isMaster ? ' · Master Number' : ''}</p>
      <p class="hero-sub">${escapeHtml(n.keywords)}<br>Personal Month ${n.personalMonth} · Personal Year ${n.personalYear}</p>
    </div>`;
  slot('numerology', 'steps').innerHTML = md(n.steps.join('\n\n'), { breaks: true });
}

const STATUS_LABEL = {
  direct: 'Mercury Direct',
  retrograde: 'Mercury Retrograde',
  'pre-shadow': 'Mercury Pre-Shadow',
  'post-shadow': 'Mercury Post-Shadow',
};

function renderTransits(f) {
  const s = f.sky;
  const m = s.mercury;
  const pillClass = m.status === 'direct' ? 'direct' : m.status === 'retrograde' ? 'retrograde' : 'shadow';
  const meter = Array.from({ length: 10 }, (_, i) => `<span class="${i < s.intensity.score ? 'on' : ''}"></span>`).join('');
  const day = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: f.today.tz, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso));
  const nextShift = {
    'pre-shadow': () => `Stations retrograde ${day(m.current.start)}`,
    retrograde: () => `Stations direct ${day(m.current.end)}`,
    'post-shadow': () => `Shadow clears ${day(m.current.postShadowEnd)}`,
    direct: () => (m.next ? `Next retrograde ${day(m.next.start)}` : ''),
  }[m.status]();
  slot('transits', 'hero').innerHTML = `
    <div>
      <span class="status-pill ${pillClass}">${STATUS_LABEL[m.status]}</span>
      <span class="hero-sub" style="margin-left:6px">${nextShift}</span>
      <p class="hero-title" style="margin-top:8px">Cosmic intensity ${s.intensity.score}/10</p>
      <div class="meter" aria-hidden="true">${meter}</div>
      <p class="hero-sub">Your Sun: ${s.natal.sunPosition}</p>
    </div>`;

  const cycle = (label, p) => p ? `- **${label}:** retrograde ${p.label} (${p.retrogradeSpan})${p.shadowLabel ? `; shadow ${p.shadowLabel}` : ''}` : '';
  const rows = s.positions.map((p) => `| ${p.body} | ${p.position} | ${p.retrograde ? 'Retrograde' : 'Direct'} |`).join('\n');
  const fmtAspect = (a) => `- ${a.a} ${a.aspect} ${a.b} — ${a.orb.toFixed(1)}° orb, ${a.applying ? 'applying' : 'separating'}${a.longRunning ? ' (generational)' : ''}`;
  const events = [
    ...s.stations.map((x) => `- ${x.body} stations ${x.kind} — ${x.label}`),
    ...s.ingresses.map((x) => `- ${x.body} ${x.past ? 'entered' : 'enters'} ${x.sign} — ${x.label}`),
    ...s.eclipses.map((x) => `- ${x.kind[0].toUpperCase() + x.kind.slice(1)} ${x.type} eclipse — ${x.label}`),
  ];
  const natal = s.natal.transits.length
    ? s.natal.transits.map((t) => `- Transiting ${t.body} ${t.aspect} your Sun — ${t.orb.toFixed(1)}° orb`).join('\n')
    : '- No transits within 3° of your natal Sun today.';
  const breakdown = [`- Base: ${s.intensity.base}`, ...s.intensity.items.map((i) => `- +${i.points}: ${i.label}`), `- Total ${s.intensity.raw.toFixed(2)} → **${s.intensity.score}/10**`].join('\n');

  slot('transits', 'steps').innerHTML = md([
    '**Mercury**',
    [cycle('Current cycle', m.current), cycle('Next', m.next), cycle('Previous', m.previous)].filter(Boolean).join('\n'),
    `**Mercury retrogrades in ${f.today.iso.slice(0, 4)}**`,
    m.thisYear.map((p) => `- ${p.label}`).join('\n'),
    '**Positions (tropical zodiac)**',
    `| Body | Position | Motion |\n|---|---|---|\n${rows}`,
    '**Aspects in orb**',
    s.aspects.length ? s.aspects.map(fmtAspect).join('\n') : '- None',
    '**Stations, ingresses, eclipses**',
    events.length ? events.join('\n') : '- None nearby',
    `**Your natal Sun (${s.natal.sunPosition})**${s.natal.nearCusp ? ' — near a cusp; a birth time would confirm the sign.' : ''}`,
    natal,
    '**How the intensity rating is computed**',
    breakdown,
  ].join('\n\n'));
}

function readLog() {
  try { return JSON.parse(localStorage.getItem(STORAGE.log)) || {}; } catch { return {}; }
}

function renderWeek(f) {
  const log = readLog();
  slot('week', 'week').innerHTML = f.week.map((d) => {
    const entry = log[d.iso];
    return `
      <div class="day${d.isToday ? ' today' : ''}">
        <span class="day-name">${d.isToday ? 'Today' : d.weekday}</span>
        <span class="day-date">${escapeHtml(d.label.replace(/, \d{4}$/, ''))}</span>
        ${moonSvg(d.angle, 40)}
        <span class="day-phase">${d.phase}</span>
        <span class="day-date">${Math.round(d.illumination)}% · ${d.moonSign}</span>
        <span class="day-pd" title="Personal Day Number">${d.personalDay}</span>
        <span class="day-mood${entry ? ' logged' : ''}">${entry ? escapeHtml(entry.mood) : (d.iso < f.today.iso ? 'No mood logged' : '')}</span>
      </div>`;
  }).join('');
}

function renderFacts(f) {
  renderMoon(f);
  renderNumerology(f);
  renderTransits(f);
  renderWeek(f);
  for (const w of [...AI_WIDGETS, 'week']) showContent(w, true);
}

function clearFacts() {
  state.facts = null;
  state.factsKey = null;
  for (const w of [...AI_WIDGETS, 'week', 'correlation']) {
    abort(w);
    showContent(w, false);
    setActionsEnabled(w, false);
  }
}

// ---------- Interpretation streaming ----------

function abort(widget) {
  state.controllers[widget]?.abort();
  delete state.controllers[widget];
}

function moodHistory() {
  const today = state.facts.today.iso;
  return Object.values(readLog()).filter((e) => e.date < today);
}

function logMood(mood) {
  const f = state.facts;
  if (f.today.isOverride) return;
  const log = readLog();
  log[f.today.iso] = {
    date: f.today.iso,
    mood,
    phase: f.moon.phase,
    illumination: Math.round(f.moon.illumination),
    personalDay: f.numerology.personalDay,
  };
  localStorage.setItem(STORAGE.log, JSON.stringify(log));
  renderWeek(f);
}

async function interpret(widget, { fresh = false } = {}) {
  if (!state.facts) return;
  abort(widget);
  const target = slot(widget, 'interpretation');
  state.texts[widget] = '';

  if (!state.config?.llmEnabled) {
    target.classList.remove('loading');
    const tail = widget === 'correlation'
      ? 'Your mood is still logged to your cosmic week.'
      : 'The computed values below are complete without it.';
    target.innerHTML = `<p class="notice">AI interpretation is off. Add <code>OPENROUTER_API_KEY</code> to <code>.env</code> and restart the server. ${tail}</p>`;
    setActionsEnabled(widget, true);
    return;
  }

  const mood = $('#mood').value;
  const controller = new AbortController();
  state.controllers[widget] = controller;
  target.innerHTML = '';
  target.classList.add('loading');
  setActionsEnabled(widget, false);

  let text = '';
  let pending = false;
  const paint = () => {
    pending = false;
    target.innerHTML = md(text);
  };

  try {
    const res = await fetch(`/api/interpret/${widget}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        birthdate: $('#birthdate').value,
        tz,
        mood,
        history: widget === 'correlation' ? moodHistory() : undefined,
        fresh,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finished = false;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (!line.trim()) continue;
        const msg = JSON.parse(line);
        if (msg.error) throw new Error(msg.error);
        if (msg.delta) {
          if (!text) target.classList.remove('loading');
          text += msg.delta;
          state.texts[widget] = text;
          if (!pending) { pending = true; requestAnimationFrame(paint); }
        }
        if (msg.done) finished = true;
      }
    }
    paint();
    if (!finished) throw new Error('The response ended early. Try regenerating.');
  } catch (err) {
    if (controller.signal.aborted) return;
    target.classList.remove('loading');
    target.insertAdjacentHTML('beforeend', `<p class="notice">${escapeHtml(err.message)}</p>`);
  } finally {
    if (state.controllers[widget] === controller) {
      delete state.controllers[widget];
      setActionsEnabled(widget, true);
    }
  }
}

function runCorrelation() {
  if (!state.facts || !$('#mood').value) {
    abort('correlation');
    showContent('correlation', false);
    return;
  }
  showContent('correlation', true);
  logMood($('#mood').value);
  interpret('correlation');
}

// ---------- Inputs ----------

const BIRTHDATE_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$|^(\d{4})-(\d{1,2})-(\d{1,2})$/;

async function loadFacts() {
  const input = $('#birthdate');
  const error = $('#birthdate-error');
  const value = input.value.trim();
  error.textContent = '';

  if (!BIRTHDATE_RE.test(value)) {
    if (value.length >= 8) error.textContent = 'Use MM/DD/YYYY, for example 07/14/1995.';
    clearFacts();
    return;
  }

  const key = `${value}|${localIsoDate()}`;
  if (key === state.factsKey) return;

  const res = await fetch('/api/facts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ birthdate: value, tz }),
  });
  const body = await res.json();
  if (input.value.trim() !== value) return;
  if (!res.ok) {
    error.textContent = body.error;
    clearFacts();
    return;
  }

  localStorage.setItem(STORAGE.birthdate, value);
  state.facts = body;
  state.factsKey = key;
  $('#today-chip').textContent = `Today · ${body.today.label}`;
  renderFacts(body);
  for (const w of AI_WIDGETS) interpret(w);
  runCorrelation();
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function init() {
  for (const w of [...AI_WIDGETS, 'correlation']) setupActions(w);

  $('#today-chip').textContent = `Today · ${new Intl.DateTimeFormat('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date())}`;

  state.config = await fetch('/api/config').then((r) => r.json());
  const select = $('#mood');
  for (const mood of state.config.moods) select.add(new Option(mood, mood));
  if (state.config.llmEnabled) {
    const chip = $('#model-chip');
    chip.textContent = state.config.model;
    chip.hidden = false;
  }

  const savedMood = localStorage.getItem(STORAGE.mood);
  if (savedMood && state.config.moods.includes(savedMood)) select.value = savedMood;
  const savedBirthdate = localStorage.getItem(STORAGE.birthdate);
  if (savedBirthdate) $('#birthdate').value = savedBirthdate;

  $('#birthdate').addEventListener('input', debounce(loadFacts, 700));
  $('#birthdate').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
  select.addEventListener('change', () => {
    localStorage.setItem(STORAGE.mood, select.value);
    runCorrelation();
  });

  // Keep "today" honest if the tab stays open past midnight.
  setInterval(() => {
    if (state.factsKey && !state.factsKey.endsWith(localIsoDate())) loadFacts();
  }, 60_000);

  if (savedBirthdate) loadFacts();
}

init();
