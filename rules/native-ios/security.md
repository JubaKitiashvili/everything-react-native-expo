---
description: iOS-specific security practices for React Native apps
globs: "**/*.{swift,m,mm,h}"
alwaysApply: false
---

# iOS Security

## Keychain Services API
- Use Keychain for tokens, passwords, and sensitive credentials
- Set appropriate `kSecAttrAccessible` level
- Use `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` for most cases

```swift
import Security

func saveToKeychain(key: String, data: Data) -> Bool {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: key,
        kSecValueData as String: data,
        kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
    ]
    SecItemDelete(query as CFDictionary)
    let status = SecItemAdd(query as CFDictionary, nil)
    return status == errSecSuccess
}
```

## App Transport Security (ATS)
- Keep ATS enabled in production (never disable globally)
- Use exception domains only for known third-party services that require HTTP
- Document all ATS exceptions in code review

```xml
<!-- Info.plist — ONLY if absolutely necessary -->
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSExceptionDomains</key>
    <dict>
        <key>legacy-api.example.com</key>
        <dict>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
    </dict>
</dict>
```

## Code Signing
- Use automatic code signing with Xcode managed profiles
- For CI/CD, use EAS Build (managed) or match (bare RN)
- Never commit provisioning profiles or certificates to git
- Use App Groups for sharing data between app and extensions

## Privacy Manifest (iOS 17+)
- Declare privacy-sensitive API usage in `PrivacyInfo.xcprivacy`
- Required for App Store submission
- Document reasons for UserDefaults, file timestamp, system boot time APIs
