---
description: Android-specific security practices for React Native apps
globs: "**/*.{kt,java,xml}"
alwaysApply: false
---

# Android Security

## Android Keystore
- Use Android Keystore for cryptographic key storage
- Never store keys in SharedPreferences or files
- Use `EncryptedSharedPreferences` for sensitive key-value data

```kotlin
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

fun getSecurePrefs(context: Context): SharedPreferences {
    val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    return EncryptedSharedPreferences.create(
        context,
        "secure_prefs",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
}
```

## R8 / ProGuard Rules for React Native
- Enable R8 for release builds (default in modern AGP)
- Add keep rules for React Native classes
- Keep native module classes and their methods
- Test release builds to verify no ProGuard issues

```proguard
# proguard-rules.pro
# React Native
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }

# Your native modules
-keep class com.myapp.modules.** { *; }
-keepclassmembers class com.myapp.modules.** {
    @com.facebook.react.bridge.ReactMethod <methods>;
}

# Hermes
-keep class com.facebook.jni.** { *; }
```

## Network Security Config
- Define `network_security_config.xml` for all projects
- Disable cleartext traffic globally in production
- Pin certificates for critical API endpoints
- Allow cleartext only for localhost in debug builds

```xml
<!-- res/xml/network_security_config.xml -->
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
    <debug-overrides>
        <trust-anchors>
            <certificates src="user" />
        </trust-anchors>
    </debug-overrides>
</network-security-config>
```

## Biometric Authentication
- Use `BiometricPrompt` API for fingerprint/face auth
- Always provide fallback to device credentials
- Store auth tokens in Keystore after biometric verification
