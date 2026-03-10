---
description: Mobile security rules for React Native applications
globs: "**/*.{ts,tsx,js,jsx}"
alwaysApply: false
---

# Security

## Secrets Management
- NEVER hardcode API keys, tokens, or secrets in JS code
- Use `expo-secure-store` for sensitive data (NOT AsyncStorage)
- Environment variables via `.env` files (excluded from git)
- Build-time secrets via EAS Secrets (for CI/CD)
- Runtime secrets via secure backend API

```tsx
// GOOD
import * as SecureStore from 'expo-secure-store';
const token = await SecureStore.getItemAsync('auth_token');

// BAD
const API_KEY = 'sk-1234567890abcdef';
await AsyncStorage.setItem('auth_token', token);
```

## Deep Linking
- Validate ALL incoming deep link URLs before navigation
- Whitelist allowed hosts and paths
- Never pass deep link params directly to sensitive operations
- Sanitize query parameters

```tsx
// GOOD
function handleDeepLink(url: string) {
  const parsed = Linking.parse(url);
  if (ALLOWED_HOSTS.includes(parsed.hostname)) {
    router.push(parsed.path);
  }
}
```

## Network Security
- HTTPS only — no HTTP requests
- Certificate pinning for critical API endpoints
- Timeout all network requests (15s default)
- Handle network errors gracefully (offline mode)

## WebView
- Always set `originWhitelist` (never `['*']` in production)
- Disable JavaScript if not needed
- Never load untrusted URLs
- Use `onShouldStartLoadWithRequest` to filter navigation

## Input Validation
- Sanitize all user input before display (XSS prevention)
- Validate form data on client AND server
- Use parameterized queries (never string concatenation for queries)
- Limit input lengths to prevent abuse

## Data Storage
- Sensitive data: `expo-secure-store` (Keychain/Keystore)
- Non-sensitive preferences: `AsyncStorage` or `expo-file-system`
- Never store PII in logs or crash reports
- Clear sensitive data on logout
