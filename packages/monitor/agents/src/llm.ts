// Task 117.6 — Anthropic SDK wrapper.
//
// One method: `generateFix(context)`. Returns a structured candidate
// fix that the orchestrator can route into a PR. Prompt caching is
// enabled on the system prompt so a CI run that processes 30 crashes
// in a row pays the prompt-cache fee once instead of 30 times.
//
// We deliberately ask Claude for a JSON envelope (no streaming, no
// tool calls). Tool calls would let Claude inspect the repo, but
// that's a Milestone-2 enhancement — for v1 we hand it the context
// pre-built and parse a structured response.

import Anthropic from '@anthropic-ai/sdk';
import type { Message } from '@anthropic-ai/sdk/resources/messages.js';
import type { FixContext } from './context.js';

/** A single file edit returned by the LLM. */
export interface FixFileEdit {
  /** Repository-relative path. */
  path: string;
  /**
   * One of:
   *   - `replace` — overwrite the file with `content`.
   *   - `patch`   — `content` is a unified diff to apply.
   * The orchestrator (github.ts) decides how to translate each onto
   * the GitHub Tree API.
   */
  mode: 'replace' | 'patch';
  content: string;
}

export interface FixCandidate {
  /** Short PR title (≤72 chars). */
  title: string;
  /** Markdown PR body — explains the diagnosis + fix rationale. */
  summary: string;
  /** File edits to apply on a fresh branch. */
  files: FixFileEdit[];
  /**
   * Self-reported confidence 0–100. The orchestrator combines this
   * with the historical confidence-decay store before deciding
   * whether to open the PR.
   */
  confidence: number;
  /**
   * Coarse classification used by the confidence store to bucket
   * outcomes (`null-check`, `type-cast`, `missing-await`, etc.).
   * Free-form string — keep stable so confidence buckets accumulate.
   */
  classification: string;
  /**
   * `true` when Claude couldn't produce a confident fix and explicitly
   * deferred. The orchestrator never opens a PR in that case.
   */
  abstain: boolean;
  /** Free-form reason when `abstain === true`. */
  abstainReason?: string;
}

export interface LLMOptions {
  apiKey: string;
  /** Anthropic model id. Defaults to the latest Sonnet. */
  model?: string;
  /** Max tokens for the response. Default 4096. */
  maxTokens?: number;
  /** Inject a fake Anthropic instance for tests. */
  client?: Pick<Anthropic, 'messages'>;
}

export interface LLM {
  generateFix(context: FixContext): Promise<FixCandidate>;
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 4096;

const SYSTEM_PROMPT = `You are an experienced React Native / Expo engineer. You receive a structured crash report from the @erne/monitor dashboard and produce a candidate code fix.

Output rules:
1. Reply with ONE JSON object, no prose, no markdown fence. The object must match this TypeScript shape:
   {
     "title": string,           // ≤72 chars, present-tense, e.g. "Guard against undefined user in HomeScreen"
     "summary": string,         // markdown PR body — diagnosis + rationale
     "files": Array<{
       "path": string,          // repo-relative file path
       "mode": "replace" | "patch",
       "content": string        // full file content (replace) or unified diff (patch)
     }>,
     "confidence": number,      // 0..100 self-reported confidence
     "classification": string,  // short bucket id, lowercase-kebab, e.g. "null-check"
     "abstain": boolean,        // true when you can't propose a credible fix
     "abstainReason": string    // omit when abstain === false
   }
2. Prefer minimal edits. Don't reformat, don't rename. One file when possible.
3. When the stack lacks the source file, set "abstain": true and explain why.
4. Never invent symbols. If the path or function name doesn't appear in the context, say so and abstain.
5. Confidence ≤ 60 means "ship it for review only" — don't auto-merge intent.

Stay terse. Reviewers read every PR you open.`;

export class AnthropicLLM implements LLM {
  private readonly client: Pick<Anthropic, 'messages'>;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(options: LLMOptions) {
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey });
    this.model = options.model ?? DEFAULT_MODEL;
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  async generateFix(context: FixContext): Promise<FixCandidate> {
    // The SDK at our installed version doesn't surface
    // `cache_control` in TS yet — the wire format accepts it just
    // fine, so we cast through `unknown` once. Tests inject a fake
    // `client.messages.create` so the cast stays scoped to the live
    // SDK call.
    const params = {
      model: this.model,
      max_tokens: this.maxTokens,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: renderContext(context),
        },
      ],
    } as unknown as Parameters<Anthropic['messages']['create']>[0];

    const response = (await this.client.messages.create(params)) as Message;
    return parseResponse(response);
  }
}

/**
 * Render a structured FixContext into a deterministic plaintext
 * payload Claude can consume. Deterministic ordering is critical for
 * prompt caching — same context → same prompt → cache hit.
 */
export function renderContext(context: FixContext): string {
  const lines: string[] = [];
  lines.push(`Crash fingerprint: ${context.fingerprint}`);
  lines.push(`Message: ${context.message}`);
  lines.push(`Event count: ${context.eventCount} (in ${context.sessionCount} sessions)`);
  lines.push(`First seen: ${new Date(context.firstSeen).toISOString()}`);
  lines.push(`Last seen: ${new Date(context.lastSeen).toISOString()}`);
  if (context.platform) lines.push(`Platform: ${context.platform}`);
  if (context.appVersion) lines.push(`App version: ${context.appVersion}`);
  if (context.topScreen) lines.push(`Top screen: ${context.topScreen}`);

  lines.push('', 'Stack:');
  for (const f of context.stack) {
    let row = `  - ${f.symbol}`;
    if (f.file) {
      row += ` (${f.file}`;
      if (f.line !== undefined) {
        row += `:${f.line}`;
        if (f.column !== undefined) row += `:${f.column}`;
      }
      row += ')';
    } else if (f.raw) {
      row += `  [raw: ${f.raw}]`;
    }
    lines.push(row);
  }

  if (context.breadcrumbs.length > 0) {
    lines.push('', 'Breadcrumbs (relative ms before crash):');
    for (const b of context.breadcrumbs) {
      let row = `  ${b.offsetMs.toString().padStart(7)}ms  [${b.severity}] ${b.type}`;
      if (b.message) row += ` — ${b.message}`;
      lines.push(row);
    }
  }
  return lines.join('\n');
}

interface RawCandidate {
  title?: unknown;
  summary?: unknown;
  files?: unknown;
  confidence?: unknown;
  classification?: unknown;
  abstain?: unknown;
  abstainReason?: unknown;
}

function parseResponse(response: Message): FixCandidate {
  // Find the first text block.
  const textBlock = response.content.find((c) => c.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('LLM returned no text content');
  }
  const text = textBlock.text.trim();
  // Tolerate models that wrap their JSON in a fenced code block — the
  // system prompt forbids it but defence in depth is cheap here.
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)```$/m.exec(text);
  const payload = fenced?.[1] ?? text;
  let raw: RawCandidate;
  try {
    raw = JSON.parse(payload) as RawCandidate;
  } catch (err) {
    throw new Error(`LLM did not return valid JSON: ${(err as Error).message}`);
  }

  const abstain = raw.abstain === true;
  const candidate: FixCandidate = {
    title: typeof raw.title === 'string' ? raw.title.slice(0, 72) : '',
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    files: Array.isArray(raw.files) ? raw.files.map(coerceFile) : [],
    confidence: clampConfidence(raw.confidence),
    classification:
      typeof raw.classification === 'string' && raw.classification.length > 0
        ? raw.classification
        : 'unknown',
    abstain,
  };
  if (abstain && typeof raw.abstainReason === 'string') {
    candidate.abstainReason = raw.abstainReason;
  }
  return candidate;
}

function clampConfidence(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

function coerceFile(raw: unknown): FixFileEdit {
  const r = (raw ?? {}) as { path?: unknown; mode?: unknown; content?: unknown };
  const mode: FixFileEdit['mode'] = r.mode === 'patch' ? 'patch' : 'replace';
  return {
    path: typeof r.path === 'string' ? r.path : '',
    mode,
    content: typeof r.content === 'string' ? r.content : '',
  };
}
