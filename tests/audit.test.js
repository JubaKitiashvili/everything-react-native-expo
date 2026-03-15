// tests/audit.test.js — Project Audit Engine tests
'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { runAudit, collectFindings, generateMarkdownReport, generateJsonReport } = require('../lib/audit');

describe('audit', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-audit-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('collectFindings', () => {
    it('returns empty for non-RN project', () => {
      const dir = path.join(tmpDir, 'empty');
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'test', dependencies: {} }));
      const { detectProject } = require('../lib/detect');
      const detection = detectProject(dir);
      const { findings, strengths, score } = collectFindings(dir, detection);
      assert.ok(Array.isArray(findings));
      assert.ok(Array.isArray(strengths));
      assert.ok(typeof score === 'number');
    });

    it('detects missing tests in RN project', () => {
      const dir = path.join(tmpDir, 'no-tests');
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
        name: 'test-app',
        dependencies: { 'react-native': '0.76.0', 'expo': '~52.0.0' }
      }));
      const { detectProject } = require('../lib/detect');
      const detection = detectProject(dir);
      const { findings } = collectFindings(dir, detection);
      const testFinding = findings.find(f => f.title.includes('test'));
      assert.ok(testFinding, 'Should find missing tests');
    });

    it('detects .env not in gitignore', () => {
      const dir = path.join(tmpDir, 'env-exposed');
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
        name: 'test-app',
        dependencies: { 'react-native': '0.76.0' }
      }));
      fs.writeFileSync(path.join(dir, '.env'), 'SECRET=abc123');
      fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n');
      const { detectProject } = require('../lib/detect');
      const detection = detectProject(dir);
      const { findings } = collectFindings(dir, detection);
      const envFinding = findings.find(f => f.title.includes('.env'));
      assert.ok(envFinding, 'Should detect .env not gitignored');
      assert.equal(envFinding.severity, 'critical');
    });

    it('gives strength for secure storage', () => {
      const dir = path.join(tmpDir, 'secure');
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
        name: 'test-app',
        dependencies: { 'react-native': '0.76.0', 'expo-secure-store': '~13.0.0' }
      }));
      const { detectProject } = require('../lib/detect');
      const detection = detectProject(dir);
      const { strengths } = collectFindings(dir, detection);
      const secureStrength = strengths.find(s => s.title.includes('Secure'));
      assert.ok(secureStrength, 'Should give strength for secure storage');
    });
  });

  describe('runAudit', () => {
    it('generates audit files', () => {
      const dir = path.join(tmpDir, 'full-audit');
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
        name: 'my-app',
        dependencies: { 'react-native': '0.76.0', 'expo': '~52.0.0', '@shopify/flash-list': '2.0.0' }
      }));

      const result = runAudit(dir);
      assert.ok(result.score >= 0 && result.score <= 100);
      assert.ok(result.mdReport.includes('ERNE Project Audit'));
      assert.ok(result.jsonReport.project === 'my-app');

      // Check files were written
      assert.ok(fs.existsSync(path.join(dir, '.erne', 'audit.md')));
      assert.ok(fs.existsSync(path.join(dir, '.erne', 'audit.json')));
    });
  });

  describe('generateMarkdownReport', () => {
    it('includes score and sections', () => {
      const { detectProject } = require('../lib/detect');
      const dir = path.join(tmpDir, 'md-report');
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'test', dependencies: { 'react-native': '0.76.0' } }));
      const detection = detectProject(dir);
      const findings = [{ severity: 'critical', category: 'Security', title: 'Test Issue', detail: 'Details', fix: 'fix it' }];
      const strengths = [{ category: 'Performance', title: 'Good thing' }];
      const md = generateMarkdownReport(dir, detection, findings, strengths, 85);
      assert.ok(md.includes('85/100'));
      assert.ok(md.includes('Test Issue'));
      assert.ok(md.includes('Good thing'));
    });
  });

  describe('generateJsonReport', () => {
    it('produces valid JSON structure', () => {
      const { detectProject } = require('../lib/detect');
      const dir = path.join(tmpDir, 'json-report');
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'test', dependencies: { 'react-native': '0.76.0' } }));
      const detection = detectProject(dir);
      const json = generateJsonReport(dir, detection, [], [], 90);
      assert.equal(json.version, 1);
      assert.equal(json.score, 90);
      assert.ok(json.stack);
      assert.ok(json.meta);
    });
  });
});
