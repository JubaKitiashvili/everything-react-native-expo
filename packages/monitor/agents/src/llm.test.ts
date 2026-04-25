// Task 117.6 — LLM wrapper tests. We never hit the real Anthropic
// API; the constructor accepts a fake `client` whose `messages.create`
// returns canned responses.

import { describe, expect, test, vi } from 'vitest';
import { AnthropicLLM, renderContext } from './llm.js';
import type { FixContext } from './context.js';

const ctx: FixContext = {
  fingerprint: 'fp-1',
  message: 'undefined is not an object',
  firstSeen: 1_770_000_000_000,
  lastSeen: 1_770_000_010_000,
  eventCount: 5,
  sessionCount: 3,
  topScreen: 'Home',
  representativeEventId: 'evt-1',
  stack: [
    { symbol: 'HomeScreen.render', file: 'src/Home.tsx', line: 42, column: 7 },
  ],
  breadcrumbs: [
    { offsetMs: -10_000, type: 'tap', severity: 'info', message: 'pressed Login' },
  ],
  platform: 'ios',
  appVersion: '1.0.0',
};

function makeFakeClient(payload: string) {
  const create = vi.fn(async () => ({
    id: 'msg-1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    content: [{ type: 'text', text: payload }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  }));
  return { messages: { create } } as never;
}

describe('renderContext', () => {
  test('emits a deterministic plaintext payload', () => {
    const text = renderContext(ctx);
    expect(text).toContain('Crash fingerprint: fp-1');
    expect(text).toContain('App version: 1.0.0');
    expect(text).toContain('HomeScreen.render (src/Home.tsx:42:7)');
    expect(text).toContain('Breadcrumbs');
    expect(text).toContain('-10000ms  [info] tap — pressed Login');
  });

  test('two identical contexts produce identical strings', () => {
    expect(renderContext(ctx)).toBe(renderContext({ ...ctx }));
  });
});

describe('AnthropicLLM.generateFix — response parsing', () => {
  test('parses a well-formed JSON response into a FixCandidate', async () => {
    const llm = new AnthropicLLM({
      apiKey: 'unused',
      client: makeFakeClient(
        JSON.stringify({
          title: 'Guard against undefined user',
          summary: 'Diagnosis ...',
          files: [
            { path: 'src/Home.tsx', mode: 'replace', content: 'export const Home = () => null;' },
          ],
          confidence: 80,
          classification: 'null-check',
          abstain: false,
        }),
      ),
    });
    const candidate = await llm.generateFix(ctx);
    expect(candidate.title).toBe('Guard against undefined user');
    expect(candidate.confidence).toBe(80);
    expect(candidate.classification).toBe('null-check');
    expect(candidate.files).toHaveLength(1);
    expect(candidate.abstain).toBe(false);
  });

  test('clamps confidence outside [0, 100]', async () => {
    const llm = new AnthropicLLM({
      apiKey: 'unused',
      client: makeFakeClient(
        JSON.stringify({
          title: 't',
          summary: 's',
          files: [],
          confidence: 250,
          classification: 'x',
          abstain: false,
        }),
      ),
    });
    expect((await llm.generateFix(ctx)).confidence).toBe(100);
  });

  test('strips a markdown code fence wrapper', async () => {
    const llm = new AnthropicLLM({
      apiKey: 'unused',
      client: makeFakeClient(
        '```json\n' +
          JSON.stringify({
            title: 'fenced',
            summary: '',
            files: [],
            confidence: 50,
            classification: 'x',
            abstain: false,
          }) +
          '\n```',
      ),
    });
    const c = await llm.generateFix(ctx);
    expect(c.title).toBe('fenced');
  });

  test('captures abstain reason when set', async () => {
    const llm = new AnthropicLLM({
      apiKey: 'unused',
      client: makeFakeClient(
        JSON.stringify({
          title: '',
          summary: '',
          files: [],
          confidence: 0,
          classification: 'unknown',
          abstain: true,
          abstainReason: 'no source file in stack',
        }),
      ),
    });
    const c = await llm.generateFix(ctx);
    expect(c.abstain).toBe(true);
    expect(c.abstainReason).toBe('no source file in stack');
  });

  test('throws on non-JSON output', async () => {
    const llm = new AnthropicLLM({
      apiKey: 'unused',
      client: makeFakeClient('not json'),
    });
    await expect(llm.generateFix(ctx)).rejects.toThrow(/valid JSON/);
  });

  test('truncates over-long titles to 72 chars', async () => {
    const longTitle = 'x'.repeat(120);
    const llm = new AnthropicLLM({
      apiKey: 'unused',
      client: makeFakeClient(
        JSON.stringify({
          title: longTitle,
          summary: '',
          files: [],
          confidence: 50,
          classification: 'x',
          abstain: false,
        }),
      ),
    });
    expect((await llm.generateFix(ctx)).title.length).toBe(72);
  });
});
