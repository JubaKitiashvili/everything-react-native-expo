---
description: Reassure — performance regression testing, render measurement, CI integration
globs: '**/*.perf-test.{ts,tsx}'
alwaysApply: false
---

# Reassure (Performance Regression Testing)

Automated performance regression detection. Measures render duration/count, compares baseline vs current, generates reports.

## Setup

```bash
npm install --save-dev reassure
```

Test files use `.perf-test.tsx` extension.

## measureRenders — Component Performance

```tsx
import { measureRenders } from 'reassure';
import { screen, fireEvent } from '@testing-library/react-native';

// Mount only (no interaction)
test('ProfileCard mount perf', async () => {
  await measureRenders(<ProfileCard user={mockUser} />);
});

// With user interaction
test('TodoList add item perf', async () => {
  const scenario = async () => {
    fireEvent.press(screen.getByText('Add'));
    await screen.findByText('New Item');
  };

  await measureRenders(<TodoList />, { scenario });
});

// With providers and custom config
test('Dashboard render perf', async () => {
  await measureRenders(<Dashboard />, {
    runs: 20,
    warmupRuns: 3,
    wrapper: ({ children }) => (
      <ThemeProvider>
        <QueryProvider>{children}</QueryProvider>
      </ThemeProvider>
    ),
    scenario: async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Refresh' }));
      await screen.findByText('Updated');
    },
  });
});
```

### Options

| Option           | Default | Description                 |
| ---------------- | ------- | --------------------------- |
| `runs`           | 10      | Measurement iterations      |
| `warmupRuns`     | 1       | Discarded initial runs      |
| `removeOutliers` | true    | Filter statistical outliers |
| `wrapper`        | —       | Provider/context wrapper    |
| `scenario`       | —       | Async interaction function  |
| `beforeEach`     | —       | Setup before each run       |
| `afterEach`      | —       | Cleanup after each run      |

## measureFunction — JS Function Performance

```tsx
import { measureFunction } from 'reassure';

test('sorting 10k items perf', async () => {
  const data = generateLargeArray(10000);
  await measureFunction(() => {
    data.sort((a, b) => a.name.localeCompare(b.name));
  });
});
```

## measureAsyncFunction

```tsx
import { measureAsyncFunction } from 'reassure';

test('data processing perf', async () => {
  await measureAsyncFunction(async () => {
    await processAndTransformData(mockPayload);
  });
});
```

## Running

```bash
# Local
yarn reassure

# Generate baseline (CI)
yarn reassure --baseline

# Stability check (same code twice, expect <5% variance)
yarn reassure check-stability
```

## CI Integration (GitHub Actions)

```yaml
- name: Run performance tests
  run: |
    # Measure baseline
    git fetch origin
    git checkout ${{ github.base_ref }}
    yarn install && yarn reassure --baseline

    # Measure current
    git checkout ${{ github.sha }}
    yarn install && yarn reassure

- name: Comment PR with results
  run: yarn danger ci
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Danger.js plugin posts results as PR comment:

```tsx
// dangerfile.ts
import { dangerReassure } from 'reassure';
dangerReassure({ inputFilePath: '.reassure/output.md' });
```

## Output Categories

| Category                | Meaning                                       |
| ----------------------- | --------------------------------------------- |
| **Significant Changes** | Real regressions or improvements (actionable) |
| **Meaningless Changes** | Noise within statistical margin               |
| **Count Changes**       | Render count differences (extra re-renders)   |
| **Added/Removed**       | New or missing test scenarios                 |

## Configuration

```tsx
import { configure } from 'reassure';

configure({
  runs: 10,
  warmupRuns: 1,
  testingLibrary: 'react-native', // or 'react'
  verbose: false,
});
```

## Rules

- Run baseline and current on **identical hardware** (same CI agent)
- Use `.perf-test.tsx` extension — Jest auto-discovers them
- Mock external calls in `measureAsyncFunction` for stable results
- Use `findBy*` queries in scenarios (not `getBy*` + sleep)
- If variance >10%, increase `runs` to 20-50
- Add `.reassure/` to `.gitignore`
