# @erne/monitor — Project Bootstrap

> Execute this BEFORE Task 1. Sets up the package, workspace, tooling.

---

## Decision: Where Does The Code Live?

**Option A: Inside ERNE monorepo** (recommended)
```
ERNE/
├── packages/
│   └── monitor/          ← @erne/monitor lives here
│       ├── src/
│       ├── ios/
│       ├── android/
│       ├── plugin/
│       ├── schemas/
│       ├── package.json
│       └── tsconfig.json
├── agents/
├── dashboard/
├── ...
```

**Why:** ERNE already has dashboard, agents, hooks — monitor integrates with all of them. Shared tooling (TypeScript, Jest, ESLint). Single version strategy.

**Option B: Separate repo** (`@erne/monitor`)
- Independent versioning, releases, CI/CD
- Heavier integration testing
- More maintenance overhead

→ **Decision needed from Juba before Task 1.**

---

## Bootstrap Steps

### Step 0: Choose repo location (decision above)

### Step 1: Initialize package

```bash
mkdir -p packages/monitor
cd packages/monitor

# package.json
npm init -y --scope=@erne
# Set: name, version, main, types, exports
```

**package.json template:**
```json
{
  "name": "@erne/monitor",
  "version": "0.1.0",
  "description": "ERNE Runtime Intelligence SDK for React Native & Expo",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./performance": "./src/exports/performance.ts",
    "./network": "./src/exports/network.ts",
    "./ai": "./src/exports/ai.ts",
    "./replay": "./src/exports/replay.ts",
    "./dev": "./src/exports/dev.ts",
    "./testing": "./src/exports/testing.ts"
  },
  "peerDependencies": {
    "react": ">=18.2.0",
    "react-native": ">=0.74.0",
    "expo": ">=51.0.0"
  },
  "devDependencies": {
    "typescript": "~5.9.0",
    "jest": "^29.0.0",
    "@testing-library/react-native": "^12.0.0",
    "ts-morph": "^24.0.0"
  }
}
```

### Step 2: TypeScript config

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true,
    "paths": {
      "@erne/monitor/*": ["./src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### Step 3: Jest config

```javascript
// jest.config.js
module.exports = {
  preset: 'react-native',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/types/**',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
```

### Step 4: Directory structure

```bash
mkdir -p src/{core,collectors,processors,storage,transport,router,integrations,exports,types}
mkdir -p schemas
mkdir -p __mocks__
```

### Step 5: Create entry point stub

```typescript
// src/index.ts
export { MonitorClient } from './core/MonitorClient';
export { MonitorProvider } from './MonitorProvider';
export { defineMonitorConfig } from './core/Config';
export type { MonitorConfig, Collector, MonitorEvent } from './types';
```

### Step 6: Verify setup

```bash
npx tsc --noEmit         # TypeScript compiles
npx jest --passWithNoTests # Jest runs
```

---

## Verification Checklist

- [ ] Package directory exists at chosen location
- [ ] package.json with correct name, exports, peerDependencies
- [ ] tsconfig.json with strict mode
- [ ] jest.config.js with coverage thresholds
- [ ] Directory structure created
- [ ] Entry point stub compiles
- [ ] Jest runs (even with no tests)
- [ ] Decision logged in TRACKER.md Blockers & Decisions

After this, proceed to Phase 1a Task 1: MonitorClient.
