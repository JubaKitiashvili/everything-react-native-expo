// Task 117.91 — symbolication accuracy benchmark.
//
// Subjects ship a fixture stack + ground-truth resolution. The harness
// scores how many frames the subject's resolver returns correctly.

import type {
  BenchmarkContext,
  BenchmarkResult,
  Subject,
  SymbolicationMeasurement,
} from '../types.js';
import { runBenchmark } from './runBenchmark.js';

export async function runSymbolicationAccuracy(
  subject: Subject,
  ctx: BenchmarkContext,
): Promise<BenchmarkResult> {
  return runBenchmark({
    benchmark: 'symbolication_accuracy',
    subject,
    ctx,
    measure: async (s, c) => s.measureSymbolicationAccuracy(c),
  });
}

export interface FrameVerdict {
  category: string;
  correct: boolean;
}

/**
 * Aggregate per-frame correct/incorrect decisions into the full
 * SymbolicationMeasurement shape. Subjects collect verdicts; we own the
 * accuracy + per-category roll-up so every subject reports the same way.
 */
export function summariseVerdicts(verdicts: FrameVerdict[]): SymbolicationMeasurement {
  const byCategory = new Map<string, { correct: number; total: number }>();
  let correctFrames = 0;
  for (const v of verdicts) {
    if (v.correct) correctFrames += 1;
    const slot = byCategory.get(v.category) ?? { correct: 0, total: 0 };
    slot.total += 1;
    if (v.correct) slot.correct += 1;
    byCategory.set(v.category, slot);
  }
  return {
    accuracy: verdicts.length === 0 ? 0 : correctFrames / verdicts.length,
    frameCount: verdicts.length,
    correctFrames,
    byCategory: Array.from(byCategory.entries()).map(([category, slot]) => ({
      category,
      ...slot,
    })),
  };
}
