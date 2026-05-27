import { BugReportChannel, type OperatorReply } from './BugReportChannel';

/** A scriptable fetch double recording calls + returning queued responses. */
function makeFetch() {
  const calls: Array<{ url: string; method: string; body: unknown; auth?: string }> = [];
  const responses: Array<{ ok: boolean; json: unknown }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(init.body as string) : undefined,
      auth: headers.authorization,
    });
    const next = responses.shift() ?? { ok: true, json: {} };
    return {
      ok: next.ok,
      status: next.ok ? 200 : 500,
      json: async () => next.json,
    } as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls, responses };
}

function opReply(over: Partial<OperatorReply>): OperatorReply {
  return {
    id: 'r1',
    reportId: 'rep1',
    author: 'op@acme.io',
    authorRole: 'operator',
    body: 'hello',
    createdAt: 1000,
    ...over,
  };
}

describe('BugReportChannel', () => {
  test('submit POSTs the session + returns the new report id', async () => {
    const { fetchImpl, calls, responses } = makeFetch();
    responses.push({ ok: true, json: { report: { id: 'rep-123' } } });
    const ch = new BugReportChannel({ baseUrl: 'https://dash.test/', sessionId: 'sess-1', apiKey: 'k', fetchImpl });

    const result = await ch.submit({ title: 'Crash', description: 'boom' });
    expect(result).toEqual({ id: 'rep-123' });
    expect(calls[0]?.url).toBe('https://dash.test/v1/bug-reports');
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.body).toMatchObject({ sessionId: 'sess-1', title: 'Crash', description: 'boom' });
    expect(calls[0]?.auth).toBe('Bearer k');
  });

  test('submit returns null on a non-ok response, never throws', async () => {
    const { fetchImpl, responses } = makeFetch();
    responses.push({ ok: false, json: {} });
    const ch = new BugReportChannel({ baseUrl: 'https://dash.test', sessionId: 's', fetchImpl });
    expect(await ch.submit()).toBeNull();
  });

  test('submit swallows a thrown fetch error', async () => {
    const fetchImpl = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const ch = new BugReportChannel({ baseUrl: 'https://dash.test', sessionId: 's', fetchImpl });
    expect(await ch.submit()).toBeNull();
  });

  test('reply POSTs to the report thread; rejects blank bodies locally', async () => {
    const { fetchImpl, calls, responses } = makeFetch();
    responses.push({ ok: true, json: { reply: {} } });
    const ch = new BugReportChannel({ baseUrl: 'https://dash.test', sessionId: 's', fetchImpl });

    expect(await ch.reply('rep-9', 'iOS 18.2')).toBe(true);
    expect(calls[0]?.url).toBe('https://dash.test/v1/bug-reports/rep-9/replies');
    expect(calls[0]?.body).toEqual({ body: 'iOS 18.2' });

    // Blank body short-circuits without a network call.
    const before = calls.length;
    expect(await ch.reply('rep-9', '   ')).toBe(false);
    expect(calls.length).toBe(before);
  });

  test('poll returns new operator replies, emits onReply, and advances the watermark', async () => {
    const { fetchImpl, calls, responses } = makeFetch();
    const seen: OperatorReply[] = [];
    const ch = new BugReportChannel({
      baseUrl: 'https://dash.test',
      sessionId: 'sess-1',
      fetchImpl,
      onReply: (r) => seen.push(r),
    });

    // First poll: two replies.
    responses.push({
      ok: true,
      json: { replies: [opReply({ id: 'a', createdAt: 1000 }), opReply({ id: 'b', createdAt: 2000 })] },
    });
    const first = await ch.poll();
    expect(first.map((r) => r.id)).toEqual(['a', 'b']);
    expect(seen.map((r) => r.id)).toEqual(['a', 'b']);
    // Watermark advanced to 2000 → request carried since=0 the first time.
    expect(calls[0]?.url).toContain('sessionId=sess-1');
    expect(calls[0]?.url).toContain('since=0');

    // Second poll: server returns the same 'b' (createdAt 2000) + a newer 'c'.
    responses.push({
      ok: true,
      json: { replies: [opReply({ id: 'b', createdAt: 2000 }), opReply({ id: 'c', createdAt: 3000 })] },
    });
    const second = await ch.poll();
    expect(second.map((r) => r.id)).toEqual(['c']); // only the newer one
    expect(calls[1]?.url).toContain('since=2000'); // watermark sent
    expect(seen.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  test('poll ignores non-operator entries + returns [] on error', async () => {
    const { fetchImpl, responses } = makeFetch();
    responses.push({
      ok: true,
      json: { replies: [{ ...opReply({ id: 'x', createdAt: 5 }), authorRole: 'reporter' }] },
    });
    const ch = new BugReportChannel({ baseUrl: 'https://dash.test', sessionId: 's', fetchImpl });
    expect(await ch.poll()).toEqual([]);

    responses.push({ ok: false, json: {} });
    expect(await ch.poll()).toEqual([]);
  });

  test('start/stop drive polling via the injected timer', async () => {
    const { fetchImpl, responses } = makeFetch();
    const timer: { fn: (() => void) | null } = { fn: null };
    const ch = new BugReportChannel({
      baseUrl: 'https://dash.test',
      sessionId: 's',
      fetchImpl,
      pollIntervalMs: 1000,
      setIntervalImpl: (fn) => {
        timer.fn = fn;
        return 1;
      },
      clearIntervalImpl: () => {
        timer.fn = null;
      },
    });
    expect(ch.isRunning()).toBe(false);
    ch.start();
    expect(ch.isRunning()).toBe(true);
    expect(typeof timer.fn).toBe('function');

    responses.push({ ok: true, json: { replies: [] } });
    timer.fn?.(); // simulate a timer fire → triggers poll
    ch.stop();
    expect(ch.isRunning()).toBe(false);
  });
});
