// Task 117.91 — subject registry.

import { erneSubject } from './erne.js';
import { sentrySubject } from './sentry.js';
import { bitdriftSubject } from './bitdrift.js';
import { measureShSubject } from './measureSh.js';
import type { Subject } from '../types.js';

export const SUBJECTS: Subject[] = [
  erneSubject,
  sentrySubject,
  bitdriftSubject,
  measureShSubject,
];

export const SUBJECTS_BY_ID: Record<string, Subject> = Object.fromEntries(
  SUBJECTS.map((s) => [s.id, s]),
);
