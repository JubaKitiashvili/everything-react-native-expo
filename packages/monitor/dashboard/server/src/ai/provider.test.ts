import { describe, expect, test, vi } from 'vitest';
import { createAnthropicProvider, resolveAiProvider } from './provider.js';

function mockFetch(response: { ok: boolean; status?: number; json: unknown }) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    return {
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      json: async () => response.json,
    } as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('createAnthropicProvider', () => {
  test('POSTs the Messages API with key + version + prompt, parses text', async () => {
    const { fetchImpl, calls } = mockFetch({
      ok: true,
      json: { content: [{ type: 'text', text: 'A null deref in LoginScreen.' }] },
    });
    const provider = createAnthropicProvider({ apiKey: 'sk-test', fetchImpl, model: 'claude-x' });
    const out = await provider.complete({ prompt: 'summarize', maxTokens: 100, system: 'be terse' });

    expect(out).toBe('A null deref in LoginScreen.');
    const call = calls[0]!;
    expect(call.url).toBe('https://api.anthropic.com/v1/messages');
    const headers = call.init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(call.init.body as string);
    expect(body).toMatchObject({
      model: 'claude-x',
      max_tokens: 100,
      system: 'be terse',
      messages: [{ role: 'user', content: 'summarize' }],
    });
  });

  test('joins multiple text blocks + ignores non-text', async () => {
    const { fetchImpl } = mockFetch({
      ok: true,
      json: { content: [{ type: 'text', text: 'a' }, { type: 'tool_use' }, { type: 'text', text: 'b' }] },
    });
    const provider = createAnthropicProvider({ apiKey: 'k', fetchImpl });
    expect(await provider.complete({ prompt: 'x' })).toBe('ab');
  });

  test('throws on a non-ok response', async () => {
    const { fetchImpl } = mockFetch({ ok: false, status: 429, json: {} });
    const provider = createAnthropicProvider({ apiKey: 'k', fetchImpl });
    await expect(provider.complete({ prompt: 'x' })).rejects.toThrow(/ai_provider_error_429/);
  });

  test('clamps maxTokens into range', async () => {
    const { fetchImpl, calls } = mockFetch({ ok: true, json: { content: [] } });
    const provider = createAnthropicProvider({ apiKey: 'k', fetchImpl });
    await provider.complete({ prompt: 'x', maxTokens: 999_999 });
    expect(JSON.parse(calls[0]!.init.body as string).max_tokens).toBe(4096);
  });
});

describe('resolveAiProvider', () => {
  test('explicit provider wins', () => {
    const stub = { complete: vi.fn() };
    expect(resolveAiProvider(stub, {})).toBe(stub);
  });

  test('explicit null forces no provider even with env key', () => {
    expect(resolveAiProvider(null, { ANTHROPIC_API_KEY: 'k' })).toBeNull();
  });

  test('falls back to env ANTHROPIC_API_KEY, else null', () => {
    expect(resolveAiProvider(undefined, { ANTHROPIC_API_KEY: 'k' })).not.toBeNull();
    expect(resolveAiProvider(undefined, {})).toBeNull();
  });
});
