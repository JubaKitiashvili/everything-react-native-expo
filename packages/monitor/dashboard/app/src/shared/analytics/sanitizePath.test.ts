import { describe, expect, test } from 'vitest';
import { sanitizePath } from './analytics';

describe('sanitizePath', () => {
  test('collapses crash fingerprints to /crashes/:id', () => {
    expect(sanitizePath('/crashes/abc123def')).toBe('/crashes/:id');
  });

  test('collapses session ids to /sessions/:id', () => {
    expect(sanitizePath('/sessions/42')).toBe('/sessions/:id');
  });

  test('collapses user ids to /users/:id', () => {
    expect(sanitizePath('/users/u_99')).toBe('/users/:id');
  });

  test('strips query strings entirely', () => {
    expect(sanitizePath('/sessions/42?tab=logs&q=secret')).toBe('/sessions/:id');
    expect(sanitizePath('/performance?range=7d')).toBe('/performance');
  });

  test('strips hash fragments', () => {
    expect(sanitizePath('/users/u_99#frames')).toBe('/users/:id');
  });

  test('leaves plain routes unchanged', () => {
    expect(sanitizePath('/performance')).toBe('/performance');
    expect(sanitizePath('/quality')).toBe('/quality');
    expect(sanitizePath('/settings')).toBe('/settings');
  });

  test('leaves the index route unchanged', () => {
    expect(sanitizePath('/')).toBe('/');
  });

  test('does not collapse list routes that have no id segment', () => {
    expect(sanitizePath('/crashes')).toBe('/crashes');
    expect(sanitizePath('/sessions')).toBe('/sessions');
    expect(sanitizePath('/users')).toBe('/users');
  });

  test('treats an empty path as the root', () => {
    expect(sanitizePath('')).toBe('/');
  });

  test('does not collapse unrelated nested routes', () => {
    expect(sanitizePath('/settings/team')).toBe('/settings/team');
  });
});
