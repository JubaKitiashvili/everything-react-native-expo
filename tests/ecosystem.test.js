'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseGitHubRelease, parseNpmPackage, classifyTag, buildFeedItem } = require('../dashboard/lib/ecosystem/fetcher');
const { analyzeRelevance } = require('../dashboard/lib/ecosystem/analyzer');

describe('ecosystem fetcher', () => {
  describe('parseGitHubRelease', () => {
    it('extracts release info from GitHub API response', () => {
      const release = { tag_name: 'v53.0.0', name: 'Expo SDK 53', body: 'RSC support', published_at: '2026-03-14T10:00:00Z', html_url: 'https://example.com' };
      const result = parseGitHubRelease('expo/expo', 'expo', release);
      assert.strictEqual(result.package, 'expo');
      assert.strictEqual(result.version.latest, '53.0.0');
      assert.strictEqual(result.type, 'release');
    });
    it('strips v prefix from version tags', () => {
      const release = { tag_name: 'v1.2.3', name: 'test', body: '', published_at: '2026-01-01T00:00:00Z', html_url: '' };
      assert.strictEqual(parseGitHubRelease('t/t', 'test', release).version.latest, '1.2.3');
    });
  });

  describe('classifyTag', () => {
    it('tags security releases as SEC', () => { assert.strictEqual(classifyTag({ type: 'release', body: 'Fixes a security vulnerability' }), 'SEC'); });
    it('tags breaking changes as BREAK', () => { assert.strictEqual(classifyTag({ type: 'release', body: 'BREAKING CHANGE: removed old API' }), 'BREAK'); });
    it('tags trending repos as HOT', () => { assert.strictEqual(classifyTag({ type: 'trending', starsThisWeek: 150 }), 'HOT'); });
    it('tags regular releases as NEW', () => { assert.strictEqual(classifyTag({ type: 'release', body: 'Bug fixes' }), 'NEW'); });
    it('tags tips as TIP', () => { assert.strictEqual(classifyTag({ type: 'tip' }), 'TIP'); });
  });

  describe('buildFeedItem', () => {
    it('constructs a complete feed item', () => {
      const item = buildFeedItem({ type: 'release', package: 'zustand', title: 'zustand@5.1.0', summary: 'New', version: { current: '5.0.0', latest: '5.1.0' }, url: 'https://x.com', body: 'improvements', timestamp: '2026-03-15T00:00:00Z' });
      assert.strictEqual(item.tag, 'NEW');
      assert.strictEqual(item.package, 'zustand');
    });
  });
});

describe('ecosystem analyzer', () => {
  it('scores direct dependency matches higher', () => {
    var items = [{ package: 'zustand', tag: 'NEW', relevance: 0 }, { package: 'unknown-lib', tag: 'NEW', relevance: 0 }];
    var scored = analyzeRelevance(items, { dependencies: { zustand: '5.0.0' } });
    assert.ok(scored[0].relevance > scored[1].relevance);
    assert.ok(scored[0].relevance >= 50);
  });
  it('gives security items a bonus', () => {
    var items = [{ package: 'unknown', tag: 'SEC', relevance: 0 }, { package: 'unknown', tag: 'NEW', relevance: 0 }];
    var scored = analyzeRelevance(items, { dependencies: {} });
    assert.ok(scored[0].relevance > scored[1].relevance);
  });
  it('sorts by relevance desc then timestamp desc', () => {
    var items = [{ package: 'a', tag: 'NEW', relevance: 0, timestamp: '2026-03-15T00:00:00Z' }, { package: 'zustand', tag: 'NEW', relevance: 0, timestamp: '2026-03-14T00:00:00Z' }];
    var scored = analyzeRelevance(items, { dependencies: { zustand: '5.0.0' } });
    assert.strictEqual(scored[0].package, 'zustand');
  });
  it('returns empty array for empty input', () => { assert.deepStrictEqual(analyzeRelevance([], { dependencies: {} }), []); });
});
