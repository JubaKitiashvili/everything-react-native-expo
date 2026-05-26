export type PatternCategory = 'crash' | 'perf' | 'ux' | 'a11y' | 'lifecycle';

export interface BuiltInPattern {
  id: string;
  name: string;
  category: PatternCategory;
  description: string;
}

/**
 * The 20 built-in React Native patterns the SDK's PatternLibrary (Phase
 * 1c, Task 34) ships with. Kept in one place so the dashboard row list
 * and the merge-with-events aggregator both read the same authoritative
 * catalog.
 *
 * When the SDK adds a new pattern, append it here so it shows up in the
 * browser — even before it has matched any events.
 */
export const BUILT_IN_PATTERNS: readonly BuiltInPattern[] = Object.freeze([
  {
    id: 'cannot-read-property',
    name: 'Cannot read property of undefined',
    category: 'crash',
    description: 'Guard with optional chaining or a non-null fallback before dereferencing.',
  },
  {
    id: 'unhandled-rejection',
    name: 'Unhandled promise rejection',
    category: 'crash',
    description: 'Attach .catch() or an error boundary; rejections must not escape to the bridge.',
  },
  {
    id: 'server-5xx',
    name: '5xx server error',
    category: 'crash',
    description: 'Retry with backoff or surface a user-visible offline state.',
  },
  {
    id: 'network-timeout',
    name: 'Network request timeout',
    category: 'crash',
    description: 'Set a per-call timeout; show an inline error instead of a blank screen.',
  },
  {
    id: 'oversized-image',
    name: 'Oversized image',
    category: 'perf',
    description: 'Resize at the source; render at the layout size, not the intrinsic size.',
  },
  {
    id: 'render-storm',
    name: 'Re-render storm',
    category: 'perf',
    description: 'Memoize props + wrap the component; check Reanimated worklet dependencies.',
  },
  {
    id: 'wasted-activity-render',
    name: 'Wasted Activity render',
    category: 'perf',
    description:
      'Inactive screen re-rendered with identical props. Add React.memo or move state up.',
  },
  {
    id: 'long-js-task',
    name: 'Long JS task',
    category: 'perf',
    description: 'Break the work into InteractionManager batches or a worklet.',
  },
  {
    id: 'slow-fabric-commit',
    name: 'Slow Fabric commit',
    category: 'perf',
    description: 'Commit > 16ms; check layout thrashing + shadow-tree depth.',
  },
  {
    id: 'slow-suspense-fallback',
    name: 'Slow Suspense fallback',
    category: 'perf',
    description: 'Promote the skeleton into the cacheable fallback; preload the data upstream.',
  },
  {
    id: 'memory-pressure',
    name: 'Memory pressure',
    category: 'perf',
    description: 'Release image caches + unmount dev-only devtools on background.',
  },
  {
    id: 'asyncstorage-pressure',
    name: 'AsyncStorage pressure',
    category: 'perf',
    description: 'Batch writes + migrate to MMKV for hot-path keys.',
  },
  {
    id: 'rage-tap',
    name: 'Rage tap',
    category: 'ux',
    description: 'User tapped 3+ times on the same target with no state change.',
  },
  {
    id: 'dead-zone',
    name: 'Dead zone',
    category: 'ux',
    description: 'Tap fell into a non-interactive region that looks tappable.',
  },
  {
    id: 'frustration-scroll',
    name: 'Frustration scroll',
    category: 'ux',
    description: 'Rapid back-and-forth scroll within 2s — likely a layout surprise.',
  },
  {
    id: 'keyboard-covers-input',
    name: 'Keyboard covers input',
    category: 'ux',
    description: 'TextInput focused but partly under the keyboard. Add KeyboardAvoidingView.',
  },
  {
    id: 'missing-a11y-label',
    name: 'Missing a11y label',
    category: 'a11y',
    description: 'Tappable element without accessibilityLabel. VoiceOver reads nothing.',
  },
  {
    id: 'low-contrast',
    name: 'Low contrast text',
    category: 'a11y',
    description: 'Text/background contrast below WCAG AA 4.5:1.',
  },
  {
    id: 'background-activity-leak',
    name: 'Background activity leak',
    category: 'lifecycle',
    description:
      'Timer / subscription / observer survived unmount — schedule cleanup in useEffect.',
  },
  {
    id: 'startup-long-native-init',
    name: 'Slow native init',
    category: 'lifecycle',
    description: 'Native module took > 500ms during startup. Defer non-critical initialisers.',
  },
]);

export const CATEGORY_LABEL: Record<PatternCategory, string> = {
  crash: 'Crash',
  perf: 'Performance',
  ux: 'UX',
  a11y: 'Accessibility',
  lifecycle: 'Lifecycle',
};
