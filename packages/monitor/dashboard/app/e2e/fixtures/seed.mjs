// Deterministic fixture loader for Playwright e2e. Populates every table
// the dashboard reads from so each panel has something non-trivial to
// render.
//
// Kept ESM + dependency-free so `start-server.mjs` can import it
// directly without a TS compile pass.

export function seedFixtures(store, now) {
  const userId = 'user_ab12';
  const sessions = [
    {
      id: 'sess-ios-1',
      userId,
      startedAt: now - 60_000,
      endedAt: now - 5_000,
      platform: 'ios',
      device: { model: 'iPhone 16 Pro', systemVersion: '18.4' },
      appVersion: '1.2.0',
      runtimeVersion: '55.0.0',
      channel: 'production',
      eventCount: 12,
      crashCount: 1,
    },
    {
      id: 'sess-ios-2',
      userId,
      startedAt: now - 40_000,
      endedAt: now - 20_000,
      platform: 'ios',
      device: { model: 'iPhone 16 Pro', systemVersion: '18.4' },
      appVersion: '1.2.0',
      runtimeVersion: '55.0.0',
      channel: 'production',
      eventCount: 4,
      crashCount: 0,
    },
    {
      id: 'sess-android-1',
      userId,
      startedAt: now - 30_000,
      endedAt: now - 2_000,
      platform: 'android',
      device: { model: 'Pixel 9', osVersion: '15' },
      appVersion: '1.2.0',
      channel: 'production',
      eventCount: 7,
      crashCount: 2,
    },
  ];
  for (const session of sessions) store.upsertSession(session);

  const events = [
    {
      id: 'evt-crash-1',
      type: 'crash',
      severity: 'critical',
      sessionId: 'sess-ios-1',
      fingerprint: 'fp-feed-root',
      timestamp: now - 45_000,
      receivedAt: now - 45_000,
      screen: 'FeedScreen',
      platform: 'ios',
      payload: {
        message: "TypeError: Cannot read property 'id' of undefined",
        stack:
          "TypeError: Cannot read property 'id' of undefined\n" +
          '    at FeedScreen.renderItem (FeedScreen.tsx:42)\n' +
          '    at FeedScreen.render (FeedScreen.tsx:18)\n' +
          '    at commitMount (react-reconciler:8121)\n',
        screen: 'FeedScreen',
      },
      userId,
    },
    {
      id: 'evt-anr-1',
      type: 'anr',
      severity: 'critical',
      sessionId: 'sess-android-1',
      fingerprint: 'fp-anr-checkout',
      timestamp: now - 20_000,
      receivedAt: now - 20_000,
      screen: 'CheckoutScreen',
      platform: 'android',
      payload: { durationMs: 9400, stackHead: 'com.example.checkout.CheckoutScreen.flush()' },
      userId,
    },
    {
      id: 'evt-net-slow',
      type: 'network',
      severity: 'warning',
      sessionId: 'sess-ios-1',
      timestamp: now - 38_000,
      receivedAt: now - 38_000,
      screen: 'FeedScreen',
      platform: 'ios',
      payload: {
        url: 'https://api.example.com/v2/feed',
        method: 'GET',
        status: 200,
        durationMs: 3_450,
        requestSize: 512,
        responseSize: 24_000,
      },
      userId,
    },
    {
      id: 'evt-breadcrumb-nav',
      type: 'breadcrumb',
      severity: 'info',
      sessionId: 'sess-ios-1',
      timestamp: now - 55_000,
      receivedAt: now - 55_000,
      payload: { category: 'nav', message: 'Navigated to /feed' },
      userId,
    },
    {
      id: 'evt-breadcrumb-touch',
      type: 'breadcrumb',
      severity: 'info',
      sessionId: 'sess-ios-1',
      timestamp: now - 50_000,
      receivedAt: now - 50_000,
      payload: { category: 'touch', message: 'Tapped Refresh' },
      userId,
    },
    {
      id: 'evt-perf-tti',
      type: 'performance',
      severity: 'info',
      sessionId: 'sess-ios-1',
      timestamp: now - 58_000,
      receivedAt: now - 58_000,
      payload: { metric: 'tti', durationMs: 1_240, phase: 'cold' },
      userId,
    },
    {
      id: 'evt-replay-1',
      type: 'replay_frame',
      severity: 'info',
      sessionId: 'sess-ios-1',
      timestamp: now - 52_000,
      receivedAt: now - 52_000,
      payload: {
        image:
          'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyIiBoZWlnaHQ9IjIiPjxyZWN0IHdpZHRoPSIyIiBoZWlnaHQ9IjIiIGZpbGw9IiM3MEU4QTQiLz48L3N2Zz4=',
        screen: 'FeedScreen',
        masks: [{ x: 20, y: 40, width: 180, height: 20, reason: 'secure-text-entry' }],
        // Captured (already-masked) UI hierarchy for this frame (Task 117.7).
        hierarchy: {
          id: 'screen-root',
          kind: 'container',
          role: 'FeedScreen',
          masked: false,
          children: [
            { id: 'header', kind: 'text', text: 'Your Feed', masked: false, children: [] },
            {
              id: 'list',
              kind: 'container',
              role: 'FlatList',
              masked: false,
              children: [
                { id: 'item-0', kind: 'text', text: 'Welcome back', masked: false, children: [] },
                { id: 'cardholder', kind: 'input', text: '[REDACTED]', masked: true, children: [] },
              ],
            },
          ],
        },
      },
      userId,
    },
    // Hermes CPU profile — folded stack samples for the flamegraph (Task 117.8).
    {
      id: 'evt-profile-1',
      type: 'profile',
      severity: 'info',
      sessionId: 'sess-ios-1',
      timestamp: now - 57_000,
      receivedAt: now - 57_000,
      screen: 'FeedScreen',
      platform: 'ios',
      payload: {
        samples: [
          { frames: ['App.render', 'FeedScreen.render', 'FeedList.render'], weight: 42 },
          { frames: ['App.render', 'FeedScreen.render', 'FeedList.render', 'FeedItem.render'], weight: 30 },
          { frames: ['App.render', 'FeedScreen.render', 'FeedHeader.render'], weight: 12 },
          { frames: ['App.render', 'TabBar.render'], weight: 8 },
        ],
      },
      userId,
    },
    // Distributed trace — span tree for the trace waterfall (Task 117.13).
    {
      id: 'evt-trace-1',
      type: 'trace',
      severity: 'info',
      sessionId: 'sess-ios-1',
      timestamp: now - 56_500,
      receivedAt: now - 56_500,
      screen: 'FeedScreen',
      platform: 'ios',
      payload: {
        traceId: 'trace-coldstart',
        name: 'AppStartup',
        spans: [
          {
            id: 'root',
            name: 'AppStartup',
            startMs: 0,
            durationMs: 1240,
            attributes: { phase: 'cold' },
            checkpoints: [{ label: 'first-frame', atMs: 900 }],
          },
          { id: 'js-init', name: 'JS bundle eval', startMs: 20, durationMs: 480, parentId: 'root' },
          {
            id: 'fetch-feed',
            name: 'GET /v2/feed',
            startMs: 520,
            durationMs: 420,
            parentId: 'root',
            attributes: { url: 'https://api.example.com/v2/feed', status: 200 },
          },
          { id: 'parse-feed', name: 'parse response', startMs: 950, durationMs: 60, parentId: 'fetch-feed' },
          { id: 'render-feed', name: 'FeedScreen render', startMs: 1010, durationMs: 210, parentId: 'root' },
        ],
      },
      userId,
    },
    // Navigation breadcrumbs across distinct screens → User Journeys transitions (Task 117.12).
    {
      id: 'evt-nav-home',
      type: 'breadcrumb',
      severity: 'info',
      sessionId: 'sess-ios-1',
      timestamp: now - 59_000,
      receivedAt: now - 59_000,
      screen: 'HomeScreen',
      platform: 'ios',
      payload: { category: 'nav', message: 'Navigated to /home' },
      userId,
    },
    {
      id: 'evt-nav-item',
      type: 'breadcrumb',
      severity: 'info',
      sessionId: 'sess-ios-1',
      timestamp: now - 47_000,
      receivedAt: now - 47_000,
      screen: 'ItemDetailScreen',
      platform: 'ios',
      payload: { category: 'nav', message: 'Navigated to /item/42' },
      userId,
    },
    // RSC boundary events — canonical shape: type 'rsc', RSC fields flattened
    // directly into payload (Task 117.26).
    {
      id: 'evt-rsc-render',
      type: 'rsc',
      severity: 'info',
      sessionId: 'sess-ios-1',
      timestamp: now - 56_000,
      receivedAt: now - 56_000,
      platform: 'ios',
      payload: { kind: 'server-render', routePath: '/feed', serverRenderTimeMs: 240 },
      userId,
    },
    {
      id: 'evt-rsc-payload',
      type: 'rsc',
      severity: 'info',
      sessionId: 'sess-ios-1',
      timestamp: now - 55_800,
      receivedAt: now - 55_800,
      platform: 'ios',
      payload: { kind: 'payload', routePath: '/feed', payloadSizeBytes: 18_240 },
      userId,
    },
    {
      id: 'evt-rsc-cache',
      type: 'rsc',
      severity: 'info',
      sessionId: 'sess-ios-1',
      timestamp: now - 55_600,
      receivedAt: now - 55_600,
      platform: 'ios',
      payload: { kind: 'cache-status', routePath: '/feed', cacheHit: true },
      userId,
    },
    // Suspense stalls — canonical shape: type 'suspense', flat payload (Task 117.25).
    {
      id: 'evt-suspense-slow',
      type: 'suspense',
      severity: 'warning',
      sessionId: 'sess-ios-1',
      timestamp: now - 54_000,
      receivedAt: now - 54_000,
      platform: 'ios',
      payload: { boundaryName: 'FeedScreen', fallbackDurationMs: 3200, depth: 1, outcome: 'resolved' },
      userId,
    },
    {
      id: 'evt-suspense-ok',
      type: 'suspense',
      severity: 'info',
      sessionId: 'sess-ios-1',
      timestamp: now - 53_800,
      receivedAt: now - 53_800,
      platform: 'ios',
      payload: { boundaryName: 'ProfileCard', fallbackDurationMs: 180, depth: 2, outcome: 'resolved' },
      userId,
    },
    {
      id: 'evt-suspense-error',
      type: 'suspense',
      severity: 'critical',
      sessionId: 'sess-android-1',
      timestamp: now - 53_600,
      receivedAt: now - 53_600,
      platform: 'android',
      payload: {
        boundaryName: 'CheckoutScreen',
        fallbackDurationMs: 5400,
        depth: 1,
        outcome: 'error',
        errorMessage: 'Suspense boundary timed out fetching cart',
      },
      userId,
    },
  ];
  for (const event of events) store.insertEvent(event);

  store.upsertCrashGroup({
    fingerprint: 'fp-feed-root',
    message: "TypeError: Cannot read property 'id' of undefined",
    firstSeen: now - 60 * 60_000,
    lastSeen: now - 45_000,
    eventCount: 23,
    sessionCount: 12,
    status: 'new',
    topScreen: 'FeedScreen',
    aiSuggestion: {
      summary: 'Guard the feed item before reading .id — API sometimes returns null items.',
      confidence: 0.82,
    },
  });
  store.upsertCrashGroup({
    fingerprint: 'fp-anr-checkout',
    message: 'ANR on CheckoutScreen.flush()',
    firstSeen: now - 30 * 60_000,
    lastSeen: now - 20_000,
    eventCount: 4,
    sessionCount: 3,
    status: 'investigating',
    topScreen: 'CheckoutScreen',
  });

  store.insertBugReport({
    id: 'bug-1',
    sessionId: 'sess-ios-1',
    submittedAt: now - 120_000,
    title: 'Scroll jumps after refresh',
    description: 'The list jumps to the top when the spinner disappears.',
    status: 'new',
    attachments: {
      screenshotUrl: 'data:image/png;base64,AAA',
      breadcrumbs: [{ category: 'nav', message: 'Navigated to /feed', timestamp: now - 60_000 }],
      device: { model: 'iPhone 16 Pro', os: 'iOS 18.4' },
    },
    eventIds: ['evt-breadcrumb-nav'],
  });

  store.saveAlertRule({
    id: 'rule-crash',
    name: 'Crash spike',
    metric: 'crash_count',
    threshold: 10,
    windowSeconds: 300,
    channels: ['slack'],
    cooldownSeconds: 600,
    enabled: true,
    createdAt: now - 86_400_000,
    updatedAt: now - 3_600_000,
  });
  store.insertAlertFiring({
    id: 'fire-1',
    ruleId: 'rule-crash',
    firedAt: now - 600_000,
    metricValue: 14,
    severity: 'critical',
    payload: { reason: 'threshold exceeded' },
  });

  store.saveSymbolFile({
    id: 'sym-android',
    platform: 'android',
    bundleId: 'com.example.app',
    version: '1.2.0',
    filename: 'mapping.txt',
    sizeBytes: 4_096,
    uploadedAt: now - 3_600_000,
    entryCount: 1,
    uuid: null,
    mappingText:
      'com.example.app.MainActivity -> a.b.c:\n    void onCreate(android.os.Bundle) -> e\n',
  });

  store.setSetting('retention_days', '30');
}
