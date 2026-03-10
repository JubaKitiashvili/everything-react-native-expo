'use strict';
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

  beforeAll(() => {
    config = JSON.parse(fs.readFileSync(HOOKS_PATH, 'utf8'));
  });

  test('has hooks array', () => {
    expect(Array.isArray(config.hooks)).toBe(true);
    expect(config.hooks.length).toBeGreaterThan(0);
  });

  test('each hook has required fields', () => {
    for (const hook of config.hooks) {
      expect(hook).toHaveProperty('event');
      expect(hook).toHaveProperty('script');
      expect(hook).toHaveProperty('command');
      expect(hook).toHaveProperty('profiles');
      expect(VALID_EVENTS).toContain(hook.event);
      expect(Array.isArray(hook.profiles)).toBe(true);
      hook.profiles.forEach(p => expect(VALID_PROFILES).toContain(p));
    }
  });

  test('has exactly 16 hooks', () => {
    expect(config.hooks.length).toBe(16);
  });

  test('each command routes through run-with-flags.js', () => {
    for (const hook of config.hooks) {
      expect(hook.command).toMatch(
        /^node scripts\/hooks\/run-with-flags\.js /
      );
      expect(hook.command).toContain(hook.script);
    }
  });
});

describe('profile definitions', () => {
  test('minimal is subset of standard', () => {
    const minimal = JSON.parse(
      fs.readFileSync(path.join(PROFILES_DIR, 'minimal.json'), 'utf8')
    );
    const standard = JSON.parse(
      fs.readFileSync(path.join(PROFILES_DIR, 'standard.json'), 'utf8')
    );
    for (const script of minimal.hooks) {
      expect(standard.hooks).toContain(script);
    }
  });

  test('standard is subset of strict', () => {
    const standard = JSON.parse(
      fs.readFileSync(path.join(PROFILES_DIR, 'standard.json'), 'utf8')
    );
    const strict = JSON.parse(
      fs.readFileSync(path.join(PROFILES_DIR, 'strict.json'), 'utf8')
    );
    for (const script of standard.hooks) {
      expect(strict.hooks).toContain(script);
    }
  });

  test('minimal has exactly 3 hooks', () => {
    const minimal = JSON.parse(
      fs.readFileSync(path.join(PROFILES_DIR, 'minimal.json'), 'utf8')
    );
    expect(minimal.hooks.length).toBe(3);
  });

  test('standard has exactly 11 hooks', () => {
    const standard = JSON.parse(
      fs.readFileSync(path.join(PROFILES_DIR, 'standard.json'), 'utf8')
    );
    expect(standard.hooks.length).toBe(11);
  });

  test('strict has exactly 16 hooks', () => {
    const strict = JSON.parse(
      fs.readFileSync(path.join(PROFILES_DIR, 'strict.json'), 'utf8')
    );
    expect(strict.hooks.length).toBe(16);
  });

  test('profile files match hooks.json profiles', () => {
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
      expect(profile.hooks.sort()).toEqual(fromConfig.sort());
    }
  });
});
