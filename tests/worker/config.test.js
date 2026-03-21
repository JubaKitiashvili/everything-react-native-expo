'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { loadConfig, validateConfig } = require('../../worker/config');

describe('loadConfig', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-worker-config-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads a valid JSON config file', () => {
    const configPath = path.join(tmpDir, 'valid.json');
    fs.writeFileSync(configPath, JSON.stringify({
      provider: { type: 'github' },
      repo: { path: tmpDir },
    }));

    const { config, error } = loadConfig(configPath);
    assert.strictEqual(error, null);
    assert.ok(config);
    assert.strictEqual(config.provider.type, 'github');
    assert.strictEqual(config.repo.path, tmpDir);
  });

  it('returns error for non-existent file', () => {
    const { config, error } = loadConfig(path.join(tmpDir, 'nope.json'));
    assert.strictEqual(config, null);
    assert.ok(error.includes('not found'));
  });

  it('returns error for invalid JSON', () => {
    const configPath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(configPath, '{invalid json}');
    const { config, error } = loadConfig(configPath);
    assert.strictEqual(config, null);
    assert.ok(error.includes('Invalid JSON'));
  });
});

describe('validateConfig', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-worker-validate-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects missing provider.type', () => {
    const result = validateConfig({ repo: { path: tmpDir } });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('provider.type')));
  });

  it('rejects missing repo.path', () => {
    // Set env var so provider doesn't also fail on missing env key
    const origEnv = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = 'test-token';
    const result = validateConfig({ provider: { type: 'github' } });
    process.env.GITHUB_TOKEN = origEnv || '';
    if (!origEnv) delete process.env.GITHUB_TOKEN;

    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('repo.path')));
  });

  it('rejects unknown provider type', () => {
    const result = validateConfig({
      provider: { type: 'notion' },
      repo: { path: tmpDir },
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('must be one of')));
  });
});

describe('config defaults', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-worker-defaults-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('applies default timeout_seconds', () => {
    const configPath = path.join(tmpDir, 'minimal.json');
    fs.writeFileSync(configPath, JSON.stringify({
      provider: { type: 'github' },
      repo: { path: tmpDir },
    }));

    const { config } = loadConfig(configPath);
    assert.strictEqual(config.executor.timeout_seconds, 600);
  });

  it('applies default hook_profile', () => {
    const configPath = path.join(tmpDir, 'minimal2.json');
    fs.writeFileSync(configPath, JSON.stringify({
      provider: { type: 'github' },
      repo: { path: tmpDir },
    }));

    const { config } = loadConfig(configPath);
    assert.strictEqual(config.erne.hook_profile, 'standard');
  });

  it('applies default poll_interval_seconds', () => {
    const configPath = path.join(tmpDir, 'minimal3.json');
    fs.writeFileSync(configPath, JSON.stringify({
      provider: { type: 'github' },
      repo: { path: tmpDir },
    }));

    const { config } = loadConfig(configPath);
    assert.strictEqual(config.provider.poll_interval_seconds, 60);
  });
});
