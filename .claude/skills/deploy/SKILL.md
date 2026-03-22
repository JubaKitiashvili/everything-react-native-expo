---
name: deploy
description: Validate and submit app builds using parallel expo-config-resolver and code-reviewer agents
---

# /deploy — Validate & Submit

You are executing the `/deploy` command. Run **expo-config-resolver** and **code-reviewer** in parallel. One validates build/deploy config, the other reviews code quality.

## Parallel Execution

### Agent 1: expo-config-resolver — Build & Deploy Validation

Check all deployment prerequisites:

**EAS Configuration:**
- `eas.json` profiles are correct for target channel (preview/production)
- `app.config.ts` version and build numbers are bumped
- Runtime version policy is set correctly for OTA updates
- Environment variables and secrets are configured in EAS

**Platform-Specific Checks:**

*iOS:*
- Bundle identifier matches Apple Developer account
- Provisioning profiles are valid (not expired)
- Capabilities (push, sign-in, etc.) match entitlements
- Privacy descriptions (NSCameraUsageDescription, etc.) are present
- App Store Connect metadata is ready

*Android:*
- Package name matches Play Console listing
- Signing key is configured in EAS credentials
- `google-services.json` is current (if using Firebase)
- Target SDK meets Play Store requirements
- Content rating questionnaire is completed

**OTA Update Validation:**
- Check if OTA update is sufficient vs new native build needed
- Verify runtime version compatibility
- Test update on preview channel first

### Agent 2: code-reviewer — Pre-Submit Code Review

Focus on production readiness:
- No `console.log` statements
- No debug flags (`__DEV__` guards are correct)
- Error boundaries are in place
- Crash reporting is configured
- Analytics events are correct
- No hardcoded API URLs (use environment config)
- Feature flags for staged rollout

## Output

```
## Deploy Readiness Report

### Build Configuration
[✓] EAS profile: production
[✓] Version: 2.1.0 (build 42)
[✓] Runtime version: 2.1.0

### iOS Readiness
[✓] Provisioning: valid (expires 2027-01-15)
[✓] Capabilities match entitlements
[!] Missing NSMicrophoneUsageDescription (add if using audio)

### Android Readiness
[✓] Signing key configured
[✓] Target SDK: 34 (meets requirement)
[✓] google-services.json is current

### Code Review
[✓] No console.log in production paths
[!] 2 TODO comments in checkout flow
[✓] Error boundaries present

### Recommended Deploy Command
eas build --platform all --profile production
eas submit --platform all
```
