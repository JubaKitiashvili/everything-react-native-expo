---
description: Mobile security rules for React Native applications — react-native-keychain
globs: "**/*.{ts,tsx,js,jsx}"
alwaysApply: false
---

# Security

## Secrets Management
- NEVER hardcode API keys, tokens, or secrets in JS code
- Use `react-native-keychain` for sensitive data (NOT AsyncStorage)
- Environment variables via `.env` files (excluded from git)
- Build-time secrets via CI/CD environment variables
- Runtime secrets via secure backend API

```tsx
// GOOD
import * as Keychain from 'react-native-keychain';

// Store credentials
await Keychain.setGenericPassword('auth_token', tokenValue, {
  service: 'com.myapp.auth',
  accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
});

// Retrieve credentials
const credentials = await Keychain.getGenericPassword({ service: 'com.myapp.auth' });
if (credentials) {
  const token = credentials.password;
}

// Clear credentials on logout
await Keychain.resetGenericPassword({ service: 'com.myapp.auth' });

// BAD
const API_KEY = 'sk-1234567890abcdef';
await AsyncStorage.setItem('auth_token', token);
```

## Keychain Best Practices
- Use `service` parameter to namespace different credentials
- Use `accessControl` for biometric-protected entries
- Use `Keychain.ACCESSIBLE.WHEN_UNLOCKED` for access control timing
- Always handle the case where `getGenericPassword` returns `false`
- Use `setInternetCredentials` / `getInternetCredentials` for server-specific auth

```tsx
// Internet credentials (server-specific)
await Keychain.setInternetCredentials('api.myapp.com', username, password);
const creds = await Keychain.getInternetCredentials('api.myapp.com');
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
    navigation.navigate(parsed.path);
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
- Sensitive data: `react-native-keychain` (iOS Keychain / Android Keystore)
- Non-sensitive preferences: `AsyncStorage` or filesystem
- Never store PII in logs or crash reports
- Clear sensitive data on logout with `Keychain.resetGenericPassword()`
