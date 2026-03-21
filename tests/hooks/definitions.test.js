'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const HOOKS_PATH = path.resolve(__dirname, '../../hooks/hooks.json');
const PROFILES_DIR = path.resolve(__dirname, '../../hooks/profiles');
const VALID_EVENTS = [
  'PreToolUse', 'PostToolUse', 'Stop',
  'PreCompact', 'SessionStart', 'SessionEnd',
];
const VALID_PROFILES = ['minimal', 'standard', 'strict'];

describe('hooks.json definitions', () => {
  let config;

  before(() => {
    config = JSON.parse(fs.readFileSync(HOOKS_PATH, 'utf8'));
  });

  it('has hooks array', () => {
    assert.ok(Array.isArray(config.hooks));
    assert.ok(config.hooks.length > 0);
  });

  it('each hook has required fields', () => {
    for (const hook of config.hooks) {
      assert.ok(hook.event !== undefined, 'hook should have event');
      assert.ok(hook.script !== undefined, 'hook should have script');
      assert.ok(hook.command !== undefined, 'hook should have command');
      assert.ok(hook.profiles !== undefined, 'hook should have profiles');
      assert.ok(VALID_EVENTS.includes(hook.event), `event "${hook.event}" should be valid`);
      assert.ok(Array.isArray(hook.profiles));
      hook.profiles.forEach(p => assert.ok(VALID_PROFILES.includes(p), `profile "${p}" should be valid`));
    }
  });

  it('has exactly 18 hooks', () => {
    assert.strictEqual(config.hooks.length, 18);
  });

  it('each command routes through run-with-flags.js', () => {
    for (const hook of config.hooks) {
      assert.match(
        hook.command,
        /^node scripts\/hooks\/run-with-flags\.js /
      );
      assert.ok(hook.command.includes(hook.script));
    }
  });
});

describe('profile definitions', () => {
  it('minimal is subset of standard', () => {
    const minimal = JSON.parse(
      fs.readFileSync(path.join(PROFILES_DIR, 'minimal.json'), 'utf8')
    );
    const standard = JSON.parse(
      fs.readFileSync(path.join(PROFILES_DIR, 'standard.json'), 'utf8')
    );
    for (const script of minimal.hooks) {
      assert.ok(standard.hooks.includes(script), `standard should include ${script}`);
    }
  });

  it('standard is subset of strict', () => {
    const standard = JSON.parse(
      fs.readFileSync(path.join(PROFILES_DIR, 'standard.json'), 'utf8')
    );
    const strict = JSON.parse(
      fs.readFileSync(path.join(PROFILES_DIR, 'strict.json'), 'utf8')
    );
    for (const script of standard.hooks) {
      assert.ok(strict.hooks.includes(script), `strict should include ${script}`);
    }
  });

  it('minimal has exactly 4 hooks', () => {
    const minimal = JSON.parse(
      fs.readFileSync(path.join(PROFILES_DIR, 'minimal.json'), 'utf8')
    );
    assert.strictEqual(minimal.hooks.length, 4);
  });

  it('standard has exactly 13 hooks', () => {
    const standard = JSON.parse(
      fs.readFileSync(path.join(PROFILES_DIR, 'standard.json'), 'utf8')
    );
    assert.strictEqual(standard.hooks.length, 13);
  });

  it('strict has exactly 17 hooks', () => {
    const strict = JSON.parse(
      fs.readFileSync(path.join(PROFILES_DIR, 'strict.json'), 'utf8')
    );
    assert.strictEqual(strict.hooks.length, 17);
  });

  it('profile files match hooks.json profiles', () => {
    const config = JSON.parse(fs.readFileSync(HOOKS_PATH, 'utf8'));
    for (const profileName of VALID_PROFILES) {
      const profile = JSON.parse(
        fs.readFileSync(
          path.join(PROFILES_DIR, `${profileName}.json`),
          'utf8'
        )
      );
      const fromConfig = config.hooks
        .filter(h => h.profiles.includes(profileName))
        .map(h => h.script);
      // Remove duplicates (dashboard-event.js appears twice in hooks.json)
      const uniqueFromConfig = [...new Set(fromConfig)];
      assert.deepStrictEqual(profile.hooks.sort(), uniqueFromConfig.sort());
    }
  });
});
