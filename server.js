import express from 'express';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { InputError } from './src/dates.js';
import { computeFacts } from './src/facts.js';
import { llmConfig, LlmError, streamChat } from './src/openrouter.js';
import { buildMessages, MOODS, sanitizeHistory, WIDGETS } from './src/prompts.js';

const app = express();
const resolve = (p) => fileURLToPath(new URL(p, import.meta.url));

app.use(express.json({ limit: '64kb' }));
app.use(express.static(resolve('./public')));
app.get('/vendor/marked.js', (_req, res) => res.sendFile(resolve('./node_modules/marked/lib/marked.esm.js')));
app.get('/vendor/purify.js', (_req, res) => res.sendFile(resolve('./node_modules/dompurify/dist/purify.es.mjs')));

app.get('/api/config', (_req, res) => {
  res.json({ llmEnabled: Boolean(llmConfig().apiKey), moods: MOODS });
});

app.post('/api/facts', (req, res) => {
  const { birthdate, tz, date } = req.body ?? {};
  try {
    res.json(computeFacts({ birthdate, tz, date }));
  } catch (err) {
    if (err instanceof InputError) return res.status(400).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Could not compute today\'s sky.' });
  }
});

const CACHE_LIMIT = 200;
const cache = new Map();
function remember(key, text) {
  cache.set(key, text);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
}

app.post('/api/interpret/:widget', async (req, res) => {
  const { widget } = req.params;
  if (!WIDGETS.includes(widget)) return res.status(404).json({ error: 'Unknown widget.' });

  const { birthdate, tz, date, mood, history, fresh } = req.body ?? {};
  let facts;
  try {
    facts = computeFacts({ birthdate, tz, date });
  } catch (err) {
    if (err instanceof InputError) return res.status(400).json({ error: err.message });
    console.error(err);
    return res.status(500).json({ error: 'Could not compute today\'s sky.' });
  }
  if (widget === 'correlation' && !MOODS.includes(mood)) {
    return res.status(400).json({ error: 'Choose your mood today.' });
  }
  if (!llmConfig().apiKey) {
    return res.status(503).json({ error: 'Add OPENROUTER_API_KEY to .env to enable AI interpretations.' });
  }

  const extras = { mood, history: sanitizeHistory(history, facts.today.iso) };
  const messages = buildMessages(widget, facts, extras);
  const key = createHash('sha256').update(JSON.stringify([llmConfig().model, widget, facts.today.iso, messages])).digest('hex');

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Accel-Buffering', 'no');
  const send = (obj) => res.write(JSON.stringify(obj) + '\n');

  if (!fresh && cache.has(key)) {
    send({ delta: cache.get(key) });
    send({ done: true, cached: true });
    return res.end();
  }

  const controller = new AbortController();
  res.on('close', () => controller.abort());

  let text = '';
  try {
    for await (const delta of streamChat(messages, { signal: controller.signal })) {
      text += delta;
      send({ delta });
    }
    if (text) remember(key, text);
    send({ done: true });
  } catch (err) {
    if (controller.signal.aborted) return;
    console.error(`[${widget}]`, err.message);
    send({ error: err instanceof LlmError ? err.message : 'The interpretation failed. Try again.' });
  }
  res.end();
});

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';
app.listen(port, host, () => {
  const { apiKey, model } = llmConfig();
  console.log(`Cosmic Week Tracker running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  console.log(apiKey ? `AI interpretations: ${model} via OpenRouter` : 'AI interpretations disabled: set OPENROUTER_API_KEY in .env');
});
