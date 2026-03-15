'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { calculateRisk, classifyBump, parseSemver } = require('../dashboard/lib/upgrades/scanner');

describe('upgrades scanner', () => {
  describe('parseSemver', () => {
    it('parses clean semver', () => {
      assert.deepStrictEqual(parseSemver('1.2.3'), { major: 1, minor: 2, patch: 3 });
    });

    it('handles caret prefix', () => {
      assert.deepStrictEqual(parseSemver('^1.2.3'), { major: 1, minor: 2, patch: 3 });
    });

    it('handles tilde prefix', () => {
      assert.deepStrictEqual(parseSemver('~1.2.3'), { major: 1, minor: 2, patch: 3 });
    });

    it('returns null for invalid version', () => {
      assert.strictEqual(parseSemver('latest'), null);
    });
  });

  describe('classifyBump', () => {
    it('detects major bump', () => {
      assert.strictEqual(classifyBump('1.0.0', '2.0.0'), 'major');
    });

    it('detects minor bump', () => {
      assert.strictEqual(classifyBump('1.0.0', '1.1.0'), 'minor');
    });

    it('detects patch bump', () => {
      assert.strictEqual(classifyBump('1.0.0', '1.0.1'), 'patch');
    });
  });

  describe('calculateRisk', () => {
    it('scores patch bump as low risk', () => {
      var result = calculateRisk({ name: 'some-lib', bump: 'patch', isCore: false, hasBreaking: false });
      assert.ok(result.risk <= 2);
    });

    it('scores major core dependency as high risk', () => {
      var result = calculateRisk({ name: 'react-native', bump: 'major', isCore: true, hasBreaking: true });
      assert.ok(result.risk >= 4);
    });

    it('caps risk at 5', () => {
      var result = calculateRisk({ name: 'expo', bump: 'major', isCore: true, hasBreaking: true, lowAdoption: true });
      assert.ok(result.risk <= 5);
    });

    it('includes risk factors in result', () => {
      var result = calculateRisk({ name: 'expo', bump: 'major', isCore: true, hasBreaking: false });
      assert.ok(Array.isArray(result.riskFactors));
      assert.ok(result.riskFactors.length >= 2);
    });
  });
});
