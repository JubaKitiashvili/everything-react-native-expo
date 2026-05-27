import { describe, expect, it } from 'vitest';
import { crashUrl, normalizeBaseUrl } from './dashboardUrl';

describe('crashUrl', () => {
  it('builds <base>/crashes/<fingerprint>', () => {
    expect(crashUrl('http://localhost:4174', 'abc123')).toBe(
      'http://localhost:4174/crashes/abc123',
    );
  });

  it('normalizes a single trailing slash on the base', () => {
    expect(crashUrl('http://localhost:4174/', 'abc123')).toBe(
      'http://localhost:4174/crashes/abc123',
    );
  });

  it('normalizes multiple trailing slashes on the base', () => {
    expect(crashUrl('https://erne.dev///', 'abc123')).toBe(
      'https://erne.dev/crashes/abc123',
    );
  });

  it('percent-encodes fingerprints containing slashes and spaces', () => {
    expect(crashUrl('https://erne.dev', 'screen/Home Crash')).toBe(
      'https://erne.dev/crashes/screen%2FHome%20Crash',
    );
  });

  it('encodes fingerprints with reserved characters', () => {
    expect(crashUrl('https://erne.dev', 'a?b#c&d=e')).toBe(
      'https://erne.dev/crashes/a%3Fb%23c%26d%3De',
    );
  });

  it('never throws on a nullish base — falls back to empty origin', () => {
    expect(crashUrl(null, 'abc123')).toBe('/crashes/abc123');
    expect(crashUrl(undefined, 'abc123')).toBe('/crashes/abc123');
  });

  it('never throws on a nullish fingerprint — treats as empty', () => {
    expect(crashUrl('https://erne.dev', null)).toBe('https://erne.dev/crashes/');
    expect(crashUrl('https://erne.dev', undefined)).toBe('https://erne.dev/crashes/');
  });
});

describe('normalizeBaseUrl', () => {
  it('strips trailing slashes', () => {
    expect(normalizeBaseUrl('http://x/')).toBe('http://x');
    expect(normalizeBaseUrl('http://x///')).toBe('http://x');
  });

  it('leaves a clean base untouched', () => {
    expect(normalizeBaseUrl('http://x')).toBe('http://x');
  });

  it('returns empty string for nullish', () => {
    expect(normalizeBaseUrl(null)).toBe('');
    expect(normalizeBaseUrl(undefined)).toBe('');
    expect(normalizeBaseUrl('')).toBe('');
  });
});
