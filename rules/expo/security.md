---
description: Security practices specific to Expo managed workflow
globs: "**/*.{ts,tsx,js,jsx}"
alwaysApply: false
---

# Expo Security

## EAS Secrets
- Store sensitive environment variables in EAS Secrets (not `.env` files in CI)
- Access via `process.env` in `app.config.ts` at build time
- Never expose build-time secrets to runtime JS bundle

```bash
# Set secret in EAS
eas secret:create --name API_KEY --value sk-xxx --scope project

# Use in app.config.ts (build-time only)
export default {
  extra: {
    apiUrl: process.env.API_URL, // OK — non-secret config
    // NEVER: apiKey: process.env.API_KEY (exposes to JS bundle)
  },
};
```

## Secure Storage
- `expo-secure-store` for tokens, credentials, sensitive user data
- `AsyncStorage` only for non-sensitive preferences
- Never store sensitive data in `expo-file-system` without encryption

## Update Signing
- Enable code signing for EAS Updates in production
- Verify update integrity before applying
- Use certificate pinning for update server communication
- Set `expo.updates.codeSigningCertificate` in app config

## Expo Go Limitations
- Expo Go shares a single container — sensitive data may persist between projects
- Always use development builds (`expo-dev-client`) for security-sensitive work
- Never test auth flows or store real credentials in Expo Go
