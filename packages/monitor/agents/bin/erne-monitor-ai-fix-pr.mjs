#!/usr/bin/env node
// Task 117.6 — AI Fix PR CLI.
//
//   erne-monitor-ai-fix-pr <fingerprint>
//
// Reads everything else from environment so secrets never appear in
// shell history. Designed to be invoked from CI (a GitHub Actions
// step that triggers on a dashboard webhook) or by an operator
// pasting a fingerprint into the terminal.
//
// Environment:
//   ERNE_DASHBOARD_URL   dashboard base URL  (default http://127.0.0.1:3333)
//   ERNE_API_KEY         dashboard API key   (optional)
//   ANTHROPIC_API_KEY    Anthropic API key   (required)
//   GITHUB_TOKEN         PAT or App token    (required)
//   ERNE_REPO_OWNER      target repo owner   (required)
//   ERNE_REPO_NAME       target repo name    (required)
//   ERNE_REPO_BRANCH     base branch         (default main)
//   ERNE_DASHBOARD_LINK  public dashboard URL for PR backlink
//                        (defaults to ERNE_DASHBOARD_URL)
//   ERNE_MIN_CONFIDENCE  hard floor          (default 50)
//   ERNE_MAX_FILES       per-PR file cap     (default 5)

import { DashboardClient } from '@erne/monitor-mcp/client';
import { AIFixPR } from '../dist/AIFixPR.js';
import { AnthropicLLM } from '../dist/llm.js';
import { GitHubAdapter } from '../dist/github.js';
import {
  ConfidenceStore,
  InMemoryConfidenceStorage,
} from '../dist/confidence.js';
import { safeFormatError } from '../dist/validate.js';

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[erne-monitor-ai-fix-pr] missing env: ${name}`);
    process.exit(2);
  }
  return value;
}

function optional(name, fallback) {
  const v = process.env[name];
  return v !== undefined && v.length > 0 ? v : fallback;
}

async function main() {
  const fingerprint = process.argv[2];
  if (!fingerprint) {
    console.error('usage: erne-monitor-ai-fix-pr <fingerprint>');
    process.exit(2);
  }

  const dashboardClient = new DashboardClient({
    dashboardUrl: optional('ERNE_DASHBOARD_URL', 'http://127.0.0.1:3333'),
    apiKey: process.env.ERNE_API_KEY ?? null,
  });
  const llm = new AnthropicLLM({ apiKey: required('ANTHROPIC_API_KEY') });
  const github = new GitHubAdapter({
    owner: required('ERNE_REPO_OWNER'),
    repo: required('ERNE_REPO_NAME'),
    token: required('GITHUB_TOKEN'),
    defaultBranch: optional('ERNE_REPO_BRANCH', 'main'),
  });
  const confidence = new ConfidenceStore({
    storage: new InMemoryConfidenceStorage(),
  });
  const orchestrator = new AIFixPR({
    dashboardClient,
    llm,
    github,
    confidence,
    dashboardUrl: optional('ERNE_DASHBOARD_LINK', optional('ERNE_DASHBOARD_URL', '')),
    minConfidence: Number.parseInt(optional('ERNE_MIN_CONFIDENCE', '50'), 10),
    maxFiles: Number.parseInt(optional('ERNE_MAX_FILES', '5'), 10),
  });

  const result = await orchestrator.propose(fingerprint);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === 'proposed' ? 0 : 1);
}

main().catch((err) => {
  // Redact tokens before stderr — CI log readers shouldn't be able to
  // recover the GITHUB_TOKEN / ANTHROPIC_API_KEY just because Octokit
  // happened to embed them in an error URL.
  console.error('[erne-monitor-ai-fix-pr] fatal:', safeFormatError(err));
  process.exit(1);
});
