// Task 117.75 — webhook entry point.
//
// `handleWebhook` is the single function a hosting layer (Express, a
// serverless function, etc.) calls per delivery. It:
//   1. verifies the HMAC-SHA256 signature against the raw body
//   2. routes by the `X-GitHub-Event` name to the matching handler
//   3. returns a structured { ok, status, ... } result
//
// It never throws: malformed payloads, handler errors, and bad
// signatures all map to a structured result so the host can always
// respond with a clean HTTP status.

import {
  handleCrashRegressionCheck,
  handleDeployment,
  handleIssueCrashLink,
} from './handlers.js';
import type { HandlerDeps, WebhookResult } from './types.js';
import { verifySignature } from './verify.js';

export interface HandleWebhookArgs {
  /** GitHub event name from the `X-GitHub-Event` header. */
  event: string;
  /** Parsed JSON payload. */
  payload: unknown;
  /** Value of the `X-Hub-Signature-256` header. */
  signatureHeader: string | null | undefined;
  /** Exact raw request body the signature was computed over. */
  rawBody: string | Buffer;
  /** The App's webhook secret. */
  secret: string;
  /** Injected GitHub + monitor clients. */
  deps: HandlerDeps;
}

/**
 * Verify, route, and run a single webhook delivery.
 *
 * Returns:
 *   - { ok: false, status: 401 }            invalid signature
 *   - { ok: true, status: 200, ignored }    unknown / unhandled event
 *   - { ok: true, status: 200, result }     handler ran
 *   - { ok: false, status: 500, error }     handler threw (still no throw)
 */
export async function handleWebhook(args: HandleWebhookArgs): Promise<WebhookResult> {
  const { event, payload, signatureHeader, rawBody, secret, deps } = args;

  if (!verifySignature(rawBody, signatureHeader, secret)) {
    return { ok: false, status: 401, error: 'invalid_signature' };
  }

  try {
    switch (event) {
      case 'deployment': {
        const result = await handleDeployment(payload, deps);
        return { ok: true, status: 200, event, result };
      }
      case 'pull_request':
      case 'check_suite': {
        const result = await handleCrashRegressionCheck(payload, deps);
        return { ok: true, status: 200, event, result };
      }
      case 'issues': {
        const result = await handleIssueCrashLink(payload, deps);
        return { ok: true, status: 200, event, result };
      }
      // `ping` is sent by GitHub when the webhook is first configured.
      case 'ping':
        return { ok: true, status: 200, event, ignored: true };
      default:
        return { ok: true, status: 200, event, ignored: true };
    }
  } catch (err) {
    return {
      ok: false,
      status: 500,
      event,
      error: err instanceof Error ? err.message : 'handler_error',
    };
  }
}
