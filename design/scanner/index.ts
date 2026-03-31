// design/scanner/index.ts
// HIG violation scanner — walks .tsx/.ts/.jsx/.js files and applies rules

import * as fs from 'fs';
import * as path from 'path';
import { rules, ScannerRule } from './rules';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Violation {
  ruleId: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  file: string;
  line: number;
  current: string;
  fix: string;
}

export interface ScanReport {
  violations: Violation[];
  summary: {
    total: number;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
    score: number;
    grade: string;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'build',
  'dist',
  '.expo',
  'android',
  'ios',
  'Pods',
]);

const SOURCE_EXTENSIONS = new Set(['.tsx', '.ts', '.jsx', '.js']);

// Severity penalty weights for score calculation
const SEVERITY_PENALTY: Record<string, number> = {
  critical: 5,
  high: 3,
  medium: 1,
  low: 0.5,
};

// Grade thresholds
const GRADE_THRESHOLDS: Array<{ min: number; grade: string }> = [
  { min: 90, grade: 'A' },
  { min: 75, grade: 'B' },
  { min: 60, grade: 'C' },
  { min: 45, grade: 'D' },
  { min: 0, grade: 'F' },
];

// ─── walkFiles ────────────────────────────────────────────────────────────────

/**
 * Recursively collect all .tsx/.ts/.jsx/.js files under `dir`,
 * skipping directories in SKIP_DIRS.
 */
export function walkFiles(dir: string): string[] {
  const result: string[] = [];

  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return result;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;

    const fullPath = path.join(dir, entry);

    let stat: fs.Stats;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      const nested = walkFiles(fullPath);
      for (const f of nested) result.push(f);
    } else if (stat.isFile()) {
      const ext = path.extname(entry).toLowerCase();
      if (SOURCE_EXTENSIONS.has(ext)) {
        result.push(fullPath);
      }
    }
  }

  return result;
}

// ─── scanFile ─────────────────────────────────────────────────────────────────

/**
 * Apply each rule against every line of the file.
 *
 * Special case — ANIM-003 (reduced motion):
 *   File-level check. If the file uses withSpring/withTiming but does NOT
 *   import useReducedMotion, emit one violation at the first animation line.
 */
export function scanFile(filePath: string, scanRules: ScannerRule[]): Violation[] {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  const lines = content.split('\n');
  const violations: Violation[] = [];

  // Pre-compute file-level flags for ANIM-003
  const hasAnimations = /withSpring\s*\(|withTiming\s*\(/.test(content);
  const hasReducedMotion = /useReducedMotion\b/.test(content);
  let anim003Emitted = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    const trimmed = line.trim();
    if (!trimmed) continue;

    for (const rule of scanRules) {
      // ANIM-003: file-level logic — emit at first animation match if no useReducedMotion
      if (rule.id === 'ANIM-003') {
        if (!anim003Emitted && hasAnimations && !hasReducedMotion) {
          for (const pattern of rule.patterns) {
            if (pattern.test(line)) {
              violations.push({
                ruleId: rule.id,
                category: rule.category,
                severity: rule.severity,
                description: rule.description,
                file: filePath,
                line: lineNumber,
                current: trimmed.length > 120 ? trimmed.slice(0, 117) + '...' : trimmed,
                fix: rule.fix,
              });
              anim003Emitted = true;
              break;
            }
          }
        }
        continue; // handled above, skip normal pattern check
      }

      // Standard line-by-line check
      for (const pattern of rule.patterns) {
        if (pattern.test(line)) {
          violations.push({
            ruleId: rule.id,
            category: rule.category,
            severity: rule.severity,
            description: rule.description,
            file: filePath,
            line: lineNumber,
            current: trimmed.length > 120 ? trimmed.slice(0, 117) + '...' : trimmed,
            fix: rule.fix,
          });
          break; // one violation per rule per line is enough
        }
      }
    }
  }

  return violations;
}

// ─── calculateScore ───────────────────────────────────────────────────────────

/**
 * Compute a 0–100 quality score and letter grade from violations.
 * Penalty per violation: critical = −5, high = −3, medium = −1, low = −0.5
 */
export function calculateScore(violations: Violation[]): { score: number; grade: string } {
  let penalty = 0;
  for (const v of violations) {
    penalty += SEVERITY_PENALTY[v.severity] ?? 1;
  }

  const raw = 100 - penalty;
  const score = Math.max(0, Math.min(100, Math.round(raw * 10) / 10));

  const grade =
    GRADE_THRESHOLDS.find((t) => score >= t.min)?.grade ?? 'F';

  return { score, grade };
}

// ─── scan ─────────────────────────────────────────────────────────────────────

/**
 * Main entry point. Accepts a file path or directory path.
 * Returns a full ScanReport including all violations and a summary.
 */
export function scan(targetPath: string): ScanReport {
  let files: string[];

  let stat: fs.Stats;
  try {
    stat = fs.statSync(targetPath);
  } catch {
    return buildReport([]);
  }

  if (stat.isFile()) {
    const ext = path.extname(targetPath).toLowerCase();
    files = SOURCE_EXTENSIONS.has(ext) ? [targetPath] : [];
  } else {
    files = walkFiles(targetPath);
  }

  const allViolations: Violation[] = [];
  for (const file of files) {
    const fileViolations = scanFile(file, rules);
    for (const v of fileViolations) allViolations.push(v);
  }

  return buildReport(allViolations);
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildReport(violations: Violation[]): ScanReport {
  const bySeverity: Record<string, number> = {};
  const byCategory: Record<string, number> = {};

  for (const v of violations) {
    bySeverity[v.severity] = (bySeverity[v.severity] ?? 0) + 1;
    byCategory[v.category] = (byCategory[v.category] ?? 0) + 1;
  }

  const { score, grade } = calculateScore(violations);

  return {
    violations,
    summary: {
      total: violations.length,
      bySeverity,
      byCategory,
      score,
      grade,
    },
  };
}
