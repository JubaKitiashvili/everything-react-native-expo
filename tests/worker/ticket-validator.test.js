'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { validateTicket } = require('../../worker/ticket-validator');

describe('ticket-validator', () => {
  it('rejects empty description', () => {
    const result = validateTicket({ title: 'Valid title here', description: '' });
    assert.strictEqual(result.valid, false);
    assert.ok(result.issues.some((i) => i.includes('Description')));
  });

  it('rejects description < 20 chars', () => {
    const result = validateTicket({ title: 'Valid title here', description: 'Too short' });
    assert.strictEqual(result.valid, false);
    assert.ok(result.issues.some((i) => i.includes('minimum 20')));
  });

  it('rejects vague title "Fix bug"', () => {
    const result = validateTicket({
      title: 'Fix bug',
      description: 'This is a sufficiently long description for the validator to accept',
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.issues.some((i) => i.includes('vague')));
  });

  it('accepts valid ticket with good description', () => {
    const result = validateTicket({
      title: 'Implement dark mode toggle in settings screen',
      description: 'Add a toggle switch in the settings screen that allows users to switch between light and dark themes.',
    });
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.issues.length, 0);
  });

  it('bug ticket without repro steps gets warning', () => {
    const result = validateTicket({
      title: 'Login screen crashes on Android',
      description: 'The login screen crashes when the user taps the submit button on Android devices.',
      type: 'bug',
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.issues.some((i) => i.includes('reproduction steps')));
  });

  it('bug ticket with repro steps passes', () => {
    const result = validateTicket({
      title: 'Login screen crashes on Android',
      description: 'Steps to reproduce: 1. Open app 2. Tap login 3. Enter credentials. Expected: success. Actual: crash.',
      type: 'bug',
    });
    assert.strictEqual(result.valid, true);
  });
});
