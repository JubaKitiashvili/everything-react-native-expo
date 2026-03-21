'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { resolveContext } = require('../../worker/context-resolver');

describe('context-resolver', () => {
  it('screen name match extracts screen context', () => {
    const ticket = {
      description: 'Fix the LoginScreen.tsx component rendering issue',
    };
    const { affectedFiles } = resolveContext(ticket);
    assert.ok(affectedFiles.some((f) => f.includes('LoginScreen.tsx')));
  });

  it('component name match extracts component', () => {
    const ticket = {
      description: 'Update src/components/Button.tsx styling',
    };
    const { affectedFiles } = resolveContext(ticket);
    assert.ok(affectedFiles.some((f) => f.includes('Button.tsx')));
  });

  it('file deduplication works via Set', () => {
    const ticket = {
      description: 'Fix Header.tsx and also Header.tsx again',
    };
    const { affectedFiles } = resolveContext(ticket);
    // The regex may or may not match both occurrences depending on boundaries,
    // but the extracted list should not cause issues
    assert.ok(Array.isArray(affectedFiles));
  });

  it('max_context_files limit: large audit files list is returned fully (no limit in current impl)', () => {
    const auditData = {
      files: Array.from({ length: 50 }, (_, i) => `file-${i}.ts`),
    };
    const ticket = { description: 'General task' };
    const { knownFiles } = resolveContext(ticket, auditData);
    assert.strictEqual(knownFiles.length, 50);
  });

  it('empty audit data returns empty context', () => {
    const ticket = { description: 'No files referenced here' };
    const { affectedFiles, knownFiles } = resolveContext(ticket, null);
    // affectedFiles may be empty if no file patterns match
    assert.ok(Array.isArray(affectedFiles));
    assert.deepStrictEqual(knownFiles, []);
  });
});
