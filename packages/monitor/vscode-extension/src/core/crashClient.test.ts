import { describe, expect, it, vi } from 'vitest';
import { fetchCrashGroups, type FetchImpl } from './crashClient';
import type { CrashGroup } from './types';

const SAMPLE: CrashGroup[] = [
  { fingerprint: 'fp1', message: 'TypeError', eventCount: 12, status: 'open', topScreen: 'Home' },
  { fingerprint: 'fp2', message: 'Boom', eventCount: 3, status: 'resolved', topScreen: 'Profile' },
];

function okFetch(body: unknown): FetchImpl {
  return vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));
}

describe('fetchCrashGroups', () => {
  it('GETs <base>/api/crash-groups and returns the parsed array', async () => {
    const fetchImpl = okFetch(SAMPLE);
    const groups = await fetchCrashGroups('http://localhost:4174', { fetchImpl });

    expect(groups).toEqual(SAMPLE);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:4174/api/crash-groups',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('normalizes the base trailing slash in the request URL', async () => {
    const fetchImpl = okFetch(SAMPLE);
    await fetchCrashGroups('http://localhost:4174/', { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:4174/api/crash-groups',
      expect.anything(),
    );
  });

  it('accepts a { groups: [...] } envelope', async () => {
    const fetchImpl = okFetch({ groups: SAMPLE });
    const groups = await fetchCrashGroups('http://x', { fetchImpl });
    expect(groups).toEqual(SAMPLE);
  });

  it('sends Authorization: Bearer when apiKey is set', async () => {
    const fetchImpl = okFetch(SAMPLE);
    await fetchCrashGroups('http://x', { fetchImpl, apiKey: 'secret-key' });

    const init = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(init.headers.Authorization).toBe('Bearer secret-key');
  });

  it('omits Authorization when no apiKey is provided', async () => {
    const fetchImpl = okFetch(SAMPLE);
    await fetchCrashGroups('http://x', { fetchImpl });

    const init = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('returns [] on a non-ok response', async () => {
    const fetchImpl: FetchImpl = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'boom' }),
    }));
    const groups = await fetchCrashGroups('http://x', { fetchImpl });
    expect(groups).toEqual([]);
  });

  it('returns [] when fetch throws (network error)', async () => {
    const fetchImpl: FetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const groups = await fetchCrashGroups('http://x', { fetchImpl });
    expect(groups).toEqual([]);
  });

  it('drops malformed group entries from the payload', async () => {
    const fetchImpl = okFetch([
      { fingerprint: 'good', message: 'ok', eventCount: 5, status: 'open' },
      { fingerprint: 'no-count', message: 'bad' }, // missing eventCount
      { eventCount: 2 }, // missing fingerprint
      null,
      'nope',
    ]);
    const groups = await fetchCrashGroups('http://x', { fetchImpl });
    expect(groups).toEqual([
      { fingerprint: 'good', message: 'ok', eventCount: 5, status: 'open', topScreen: undefined },
    ]);
  });

  it('returns [] when the body is not an array or envelope', async () => {
    const fetchImpl = okFetch({ unexpected: true });
    const groups = await fetchCrashGroups('http://x', { fetchImpl });
    expect(groups).toEqual([]);
  });
});
