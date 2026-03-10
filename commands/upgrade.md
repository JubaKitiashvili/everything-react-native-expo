---
name: upgrade
description: Version migration for Expo SDK and React Native using the upgrade-assistant agent
---

# /upgrade — Version Migration

You are executing the `/upgrade` command. Use the **upgrade-assistant** agent for guided version migration.

## 5-Step Upgrade Process

### Step 1: Pre-Assessment
- Identify current versions (Expo SDK, React Native, key dependencies)
- Identify target versions
- Check release notes and breaking changes
- Backup current state (`git stash` or commit)

### Step 2: Dependency Compatibility Matrix
Generate a compatibility table:

```
| Package | Current | Target | Compatible? | Notes |
|---------|---------|--------|-------------|-------|
| expo | 51.0.0 | 52.0.0 | ✅ | Major upgrade |
| react-native | 0.74 | 0.76 | ✅ | Via Expo SDK |
| @react-navigation | 6.x | 7.x | ⚠️ | Breaking changes |
```

### Step 3: Breaking Change Detection
- Scan codebase for deprecated APIs being used
- Identify removed features
- Check for changed behavior in dependencies
- Flag native module compatibility issues

### Step 4: Migration Steps
Execute the upgrade:

**Expo projects:**
```bash
npx expo install expo@latest
npx expo install --fix  # Fix peer dependency issues
npx expo prebuild --clean  # Regenerate native projects
```

**Bare RN projects:**
```bash
npx react-native upgrade
# Or use upgrade-helper: https://react-native-community.github.io/upgrade-helper/
```

- Apply codemods when available
- Update deprecated API calls
- Fix TypeScript type changes
- Update config files

### Step 5: Post-Upgrade Verification
- [ ] TypeScript compiles without errors
- [ ] ESLint passes
- [ ] All tests pass
- [ ] iOS build succeeds
- [ ] Android build succeeds
- [ ] Manual smoke test on both platforms

## Output Format
```
## Upgrade Summary
From: [current versions]
To: [target versions]

## Breaking Changes Found
[List with file locations]

## Changes Applied
[Files modified with descriptions]

## Verification Checklist
[Status of each verification step]
```
