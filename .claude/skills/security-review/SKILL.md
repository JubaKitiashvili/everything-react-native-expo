---
name: security-review
description: Mobile security audit for React Native applications
---

# Security Review

You are performing a security audit on a React Native application. This skill provides a systematic security checklist specific to mobile apps.

## When to Use This Skill

Invoke when:
- Before deploying to production
- After adding authentication or payment features
- During code review of sensitive features
- Periodically as a security health check

## Audit Categories

### 1. Data Storage Security

- [ ] Sensitive data uses `expo-secure-store` (Expo) or Keychain/Keystore (bare)
- [ ] No sensitive data in `AsyncStorage` (it's unencrypted)
- [ ] No secrets in source code or environment files committed to git
- [ ] `.env` is in `.gitignore`
- [ ] API keys use EAS Secrets for builds (not hardcoded)

### 2. Network Security

- [ ] All API calls use HTTPS
- [ ] Certificate pinning implemented for sensitive endpoints
- [ ] Auth tokens stored securely, not in plain AsyncStorage
- [ ] Token refresh logic handles expiration correctly
- [ ] No sensitive data in URL query parameters

### 3. Authentication & Authorization

- [ ] Passwords never stored locally
- [ ] Biometric auth uses platform APIs (FaceID, fingerprint)
- [ ] Session tokens have reasonable expiry
- [ ] Logout clears all sensitive cached data
- [ ] Deep links validate auth state before navigating

### 4. Code Security

- [ ] No `eval()` or dynamic code execution
- [ ] WebView `javaScriptEnabled` only when necessary
- [ ] Input validation on all user inputs
- [ ] SQL injection prevention (parameterized queries)
- [ ] No debug logging of sensitive data

### 5. Build Security

- [ ] ProGuard/R8 enabled for Android release builds
- [ ] iOS binary stripped in release
- [ ] Source maps not included in production bundles
- [ ] App Transport Security (ATS) properly configured (iOS)
- [ ] Android `networkSecurityConfig` restricts cleartext traffic

### 6. Platform-Specific

**iOS:**
- [ ] Privacy Manifest (iOS 17+) includes required reasons
- [ ] Keychain access group properly configured
- [ ] No private API usage
- [ ] Background fetch/processing doesn't leak data

**Android:**
- [ ] Exported components require permissions
- [ ] Content providers are not unnecessarily exported
- [ ] Backup rules exclude sensitive data (`android:allowBackup="false"`)
- [ ] Minimum SDK version is current (API 24+)

### 7. Third-Party Dependencies

- [ ] No known vulnerabilities (`npm audit`)
- [ ] Dependencies are up to date
- [ ] No abandoned packages with known issues
- [ ] Native dependencies reviewed for permissions

## Output

```
## Security Audit Report

### Risk Level: LOW / MEDIUM / HIGH / CRITICAL

### Findings
[Severity] [Category] — [Description]
  Location: [file:line]
  Recommendation: [fix]

### Summary
- Critical: N
- High: N
- Medium: N
- Low: N
- Passed: N checks
```
