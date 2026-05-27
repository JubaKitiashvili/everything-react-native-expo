// Task 117.9 — server-side AI fallback provider.
//
// The dashboard's local AI (browser WebLLM/WASM) needs a fallback for browsers
// without WebGPU + for server-side use: `POST /api/ai/complete` calls this
// provider. The provider is an injectable interface so the route is fully
// unit-testable with a stub (no live LLM); a default Anthropic adapter builds
// the request + parses the response (its request shape is unit-tested with a
// mocked fetch — the actual network call is operator-configured + live, 🟡).
//
// When no provider is configured (no API key), the route returns 501 — the
// dashboard then relies on in-browser WebLLM, or the feature is simply off.

export interface AiCompleteInput {
  prompt: string;
  /** Soft cap on output tokens. Default 512. */
  maxTokens?: number;
  /** Optional system instruction. */
  system?: string;
}

/** Injectable completion provider. */
export interface AiProvider {
  complete(input: AiCompleteInput): Promise<string>;
}

export interface AnthropicProviderOptions {
  apiKey: string;
  /** Model id. Default a current Claude model. */
  model?: string;
  /** Base URL override (default Anthropic). */
  baseUrl?: string;
  /** fetch injection for tests. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 512;
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Anthropic Messages API adapter. Pure request-building + response-parsing;
 * unit-tested with a mocked fetch. The live call is operator-configured.
 */
export function createAnthropicProvider(options: AnthropicProviderOptions): AiProvider {
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as typeof fetch);
  const baseUrl = (options.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
  const model = options.model ?? DEFAULT_MODEL;

  return {
    async complete(input) {
      const body: Record<string, unknown> = {
        model,
        max_tokens: clampTokens(input.maxTokens),
        messages: [{ role: 'user', content: input.prompt }],
      };
      if (input.system && input.system.length > 0) body.system = input.system;

      const res = await fetchImpl(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': options.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`ai_provider_error_${res.status}`);
      }
      const data = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
      const text = (data.content ?? [])
        .filter((block) => block?.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('')
        .trim();
      return text;
    },
  };
}

function clampTokens(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_MAX_TOKENS;
  return Math.min(4096, Math.max(1, Math.round(value)));
}

/**
 * Resolve a provider from explicit option → env (`ANTHROPIC_API_KEY`) → null.
 * `null` means the AI endpoint is unconfigured (responds 501).
 */
export function resolveAiProvider(
  explicit: AiProvider | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): AiProvider | null {
  if (explicit) return explicit;
  if (explicit === null) return null;
  const key = env.ANTHROPIC_API_KEY;
  if (typeof key === 'string' && key.length > 0) {
    return createAnthropicProvider({ apiKey: key });
  }
  return null;
}
