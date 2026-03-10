---
name: debug
description: Systematic diagnosis of bugs using the performance-profiler agent
---

# /debug — Systematic Diagnosis

You are executing the `/debug` command. Use the **performance-profiler** agent for systematic bug diagnosis.

## Process

### Step 1: Reproduce
Define exact reproduction steps:
1. Starting state
2. Actions taken
3. Expected behavior
4. Actual behavior
5. Environment (device, OS, Expo SDK version)

### Step 2: Classify the Bug

| Category | Indicators | First Check |
|----------|-----------|-------------|
| **Crash** | App terminates | Check Metro logs, Hermes stack trace |
| **Render** | Visual glitch, wrong layout | Check component tree, re-render count |
| **State** | Wrong data displayed | Check Zustand store, TanStack Query cache |
| **Navigation** | Wrong screen, broken back | Check Expo Router history, params |
| **Performance** | Jank, slow response | Check FPS, bundle size, memory |
| **Network** | Failed API calls | Check request/response, auth tokens |
| **Native** | Platform-specific issue | Check native logs (Xcode/Logcat) |

### Step 3: Investigate

**JavaScript layer:**
```bash
# Check Metro bundler logs
# Search for errors/warnings in console output
# Add strategic console.log at suspected points
```

**React layer:**
- Component re-render tracking (React DevTools)
- Props/state inspection
- Effect dependency analysis

**Native layer (if agent-device available):**
- Screenshot current state
- Navigate through repro steps visually
- Capture native crash logs

### Step 4: Fix & Verify
1. Identify root cause
2. Implement minimal fix
3. Verify fix resolves the issue
4. Check for regression (run related tests)
5. Document what caused it and why

## Output
```
## Bug Report

### Summary
[One-line description]

### Root Cause
[Technical explanation]

### Fix Applied
[Files changed with explanation]

### Verification
[Steps taken to verify fix]
[Test results]
```
