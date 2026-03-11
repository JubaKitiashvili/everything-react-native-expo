---
description: Mobile security rules for React Native applications — AsyncStorage (non-encrypted)
globs: "**/*.{ts,tsx,js,jsx}"
alwaysApply: false
---

# Security

## ⚠️ AsyncStorage Warning

**AsyncStorage is NOT encrypted.** Data is stored in plain text on the device. Do NOT store tokens, passwords, API keys, or any sensitive data in AsyncStorage. Consider migrating to `expo-secure-store` or `react-native-keychain` for sensitive data.

## Secrets Management
- NEVER hardcode API keys, tokens, or secrets in JS code
- Environment variables via `.env` files (excluded from git)
- Build-time secrets via CI/CD environment variables
- Runtime secrets via secure backend API
- **Sensitive tokens**: Must use a secure store (not AsyncStorage) — see migration note below

```tsx
// AsyncStorage — for NON-SENSITIVE data only
import AsyncStorage from '@react-native-async-storage/async-storage';

// Store non-sensitive preferences
await AsyncStorage.setItem('theme_preference', 'dark');
await AsyncStorage.setItem('onboarding_complete', 'true');
await AsyncStorage.setItem('last_sync_timestamp', String(Date.now()));

// Retrieve
const theme = await AsyncStorage.getItem('theme_preference');

// Remove
await AsyncStorage.removeItem('theme_preference');

// Multi-get for batch reads
const values = await AsyncStorage.multiGet(['theme_preference', 'locale']);

// BAD — NEVER store sensitive data in AsyncStorage
await AsyncStorage.setItem('auth_token', token);       // ❌ NOT SECURE
await AsyncStorage.setItem('api_key', apiKey);          // ❌ NOT SECURE
await AsyncStorage.setItem('user_password', password);  // ❌ NOT SECURE
```

## Migration Path for Sensitive Data

If your project currently stores sensitive data in AsyncStorage, migrate to a secure solution:

```tsx
// Migrate tokens from AsyncStorage to a secure store
async function migrateSecureData() {
  const token = await AsyncStorage.getItem('auth_token');
  if (token) {
    // Move to expo-secure-store or react-native-keychain
    await SecureStore.setItemAsync('auth_token', token);
    await AsyncStorage.removeItem('auth_token');
  }
}
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
- Sensitive data: **DO NOT use AsyncStorage** — use `expo-secure-store` or `react-native-keychain`
- Non-sensitive preferences: `AsyncStorage` (theme, locale, onboarding flags)
- Never store PII in logs or crash reports
- Clear user-specific data on logout: `AsyncStorage.clear()`
