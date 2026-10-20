const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

export const DEFAULT_MODEL = 'anthropic/claude-sonnet-5';

export class LlmError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export function llmConfig() {
  return {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
  };
}

/** Streams completion text deltas from OpenRouter's OpenAI-compatible API. */
export async function* streamChat(messages, { signal, maxTokens = 1200, temperature = 0.8 } = {}) {
  const { apiKey, model } = llmConfig();
  if (!apiKey) throw new LlmError('OPENROUTER_API_KEY is not set.', 503);

  const baseUrl = (process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
      'X-Title': 'Cosmic Week Tracker',
    },
    body: JSON.stringify({ model, messages, stream: true, max_tokens: maxTokens, temperature }),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error?.message || JSON.stringify(body);
    } catch {
      detail = res.statusText;
    }
    throw new LlmError(`OpenRouter error ${res.status}: ${detail}`, res.status === 401 ? 503 : 502);
  }

  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return;
      let event;
      try {
        event = JSON.parse(payload);
      } catch {
        continue;
      }
      if (event.error) throw new LlmError(event.error.message || 'Model stream error', 502);
      const delta = event.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}
