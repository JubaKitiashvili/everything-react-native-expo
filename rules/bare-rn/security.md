---
description: Security practices for bare React Native projects
globs: "**/*.{ts,tsx,js,jsx}"
alwaysApply: false
---

# Bare React Native Security

## ProGuard / R8 Configuration
- Enable ProGuard for release builds to obfuscate code
- Add keep rules for React Native and native modules
- Test release builds thoroughly (ProGuard can break reflection)

```proguard
# proguard-rules.pro
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }
# Keep your native module classes
-keep class com.myapp.modules.** { *; }
```

## iOS Keychain Direct Usage
- Use `react-native-keychain` or direct Keychain API for sensitive storage
- Set appropriate accessibility level (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`)
- Enable biometric protection for high-security items

## Certificate Pinning (Native)
- Implement SSL pinning in native networking layer
- Pin certificate public keys (not certificates themselves — they expire)
- Use `TrustKit` (iOS) or `OkHttp CertificatePinner` (Android)

```kotlin
// Android — OkHttp certificate pinning
val client = OkHttpClient.Builder()
    .certificatePinner(
        CertificatePinner.Builder()
            .add("api.myapp.com", "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
            .build()
    )
    .build()
```

## Network Security Config (Android)
- Define `network_security_config.xml` for Android
- Disable cleartext traffic in production
- Configure certificate pinning at OS level

```xml
<!-- android/app/src/main/res/xml/network_security_config.xml -->
<network-security-config>
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="true">api.myapp.com</domain>
        <pin-set>
            <pin digest="SHA-256">base64EncodedPin=</pin>
        </pin-set>
    </domain-config>
</network-security-config>
```
