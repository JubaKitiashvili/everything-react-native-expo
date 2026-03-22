---
name: upgrade-workflow
description: Guided version migration for React Native and Expo SDK upgrades
---

# Upgrade Workflow

You are performing a version upgrade on a React Native or Expo project. This skill provides a systematic migration process.

## When to Use This Skill

Invoke when:
- Upgrading Expo SDK version (e.g., SDK 51 → 52)
- Upgrading React Native version (e.g., 0.75 → 0.76)
- Upgrading major dependencies (React Navigation, Reanimated, etc.)
- Migrating from Expo managed to bare workflow

## 5-Step Upgrade Process

### Step 1: Pre-Assessment

Before changing anything:

1. **Document current state:**
   ```bash
   npx expo-doctor  # Expo projects
   npx react-native info  # All RN projects
   ```

2. **Check compatibility matrix:**
   - Expo SDK → React Native version mapping
   - React Native → React version mapping
   - Key dependency version requirements

3. **Identify breaking changes:**
   - Read the official changelog/migration guide
   - Check each major dependency's changelog
   - List all breaking changes that affect this project

4. **Ensure clean state:**
   ```bash
   git status  # Must be clean
   git checkout -b upgrade/[target-version]
   ```

### Step 2: Core Upgrade

**Expo managed:**
```bash
npx expo install expo@latest
npx expo install --fix  # Fix peer dependency issues
```

**Bare React Native:**
```bash
npx react-native upgrade [version]
# Or use the upgrade helper:
# https://react-native-community.github.io/upgrade-helper/
```

### Step 3: Dependency Updates

Update dependencies in order of importance:
1. React and React Native core
2. Navigation (expo-router or React Navigation)
3. State management (zustand, tanstack-query)
4. UI libraries (nativewind, reanimated, gesture-handler)
5. Native modules and Expo packages
6. Dev dependencies (jest, typescript, eslint)

```bash
# Check for outdated packages
npx npm-check-updates

# Update with Expo compatibility
npx expo install [package]@latest
```

### Step 4: Migration Steps

Apply breaking changes systematically:

1. **API changes** — Update deprecated API calls
2. **Import changes** — Fix moved/renamed imports
3. **Config changes** — Update app.config.ts, babel.config.js, metro.config.js
4. **Native changes** — Update Podfile, build.gradle if bare workflow
5. **Type changes** — Fix TypeScript type errors from updated types

For each change:
```bash
# Make change
# Run: npx tsc --noEmit  (type check)
# Run: npm test  (unit tests)
# Fix any failures before moving to next change
```

### Step 5: Verification

Complete verification checklist:

- [ ] `npx tsc --noEmit` passes (no type errors)
- [ ] `npm test` passes (all unit tests)
- [ ] `npx expo start` launches dev server (Expo)
- [ ] iOS build succeeds
- [ ] Android build succeeds
- [ ] Critical user flows work on both platforms
- [ ] No new console warnings related to deprecation
- [ ] Bundle size hasn't increased significantly

## Output

```
## Upgrade Report

### Versions
From: [previous versions]
To: [new versions]

### Breaking Changes Applied
[List with file locations and descriptions]

### Dependencies Updated
[Package] [old] → [new]

### Verification
[Status of each check]

### Known Issues
[Any remaining warnings or known issues with notes]
```

## Rollback

If upgrade fails:
```bash
git checkout main
git branch -D upgrade/[target-version]
```

Never force through a broken upgrade. It's better to wait for fixes.
