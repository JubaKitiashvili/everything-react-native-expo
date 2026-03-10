---
name: build-fix
description: Diagnose and fix build failures using the expo-config-resolver agent
---

# /build-fix — Fix Build Failures

You are executing the `/build-fix` command. Use the **expo-config-resolver** agent to diagnose and fix build errors.

## Diagnostic Process

1. **Identify the error** — Read build logs, identify the failure point
2. **Classify the error type**:
   - EAS Build failure (cloud build)
   - Local `expo prebuild` failure
   - iOS build failure (CocoaPods, Xcode, provisioning)
   - Android build failure (Gradle, ProGuard, multidex)
   - Metro bundler error
   - Config plugin error
3. **Diagnose root cause** — Check common causes per error type
4. **Apply fix** — Make targeted changes
5. **Verify** — Rebuild and confirm fix

## Common Fixes

### EAS Build
- Validate `eas.json` build profiles
- Check `app.json` / `app.config.ts` for typos
- Verify Expo SDK compatibility with dependencies
- Check EAS Build logs for native compilation errors

### iOS
- `pod install` issues → delete `Podfile.lock` + `pod install --repo-update`
- Provisioning → verify Apple Developer account + certificates
- Privacy manifest → add `PrivacyInfo.xcprivacy` declarations
- Module not found → check header search paths

### Android
- Gradle sync → check `minSdkVersion` alignment
- ProGuard → add keep rules for broken classes
- Multidex → enable in `build.gradle`
- NDK → verify Hermes / JSC compatibility

## Output Format
```
## Error Analysis
[Error message and classification]

## Root Cause
[Why the build failed]

## Fix Applied
[Changes made with file paths]

## Verification
[Build command to run, expected result]
```
