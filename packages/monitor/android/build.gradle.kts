/*
 * Task 38 — Android build config for @erne/monitor.
 *
 * Tasks 40+ will add:
 *   - externalNativeBuild { cmake { ... } } for the NDK signal handler
 *   - kotlinx.serialization plugin for generated @Serializable data classes
 *   - ProGuard consumer rules
 *
 * For the Task 38 shell we only wire the Kotlin module compilation so
 * autolinking can discover the class named in expo-module.config.json.
 */
import groovy.json.JsonSlurper

fun readPackageJson(): Map<*, *> {
    val file = file("../package.json")
    @Suppress("UNCHECKED_CAST")
    return JsonSlurper().parse(file) as Map<*, *>
}

val packageJson = readPackageJson()

group = "expo.modules.ernemonitor"
version = packageJson["version"]?.toString() ?: "0.0.0"

buildscript {
    // Picks up the Expo module gradle plugin from the host app.
    if (project == rootProject) {
        repositories {
            mavenCentral()
            google()
        }
        dependencies {
            classpath("com.android.tools.build:gradle:8.6.0")
            classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.24")
        }
    }
}

apply(plugin = "com.android.library")
apply(plugin = "kotlin-android")
apply(from = "${rootProject.projectDir}/../node_modules/expo-modules-core/android-plugin/ExpoModulesCorePlugin.gradle")

android {
    namespace = "expo.modules.ernemonitor"
    compileSdk = 35
    ndkVersion = "27.0.11718014"

    defaultConfig {
        minSdk = 24
        targetSdk = 35
        versionName = packageJson["version"]?.toString() ?: "0.0.0"
        externalNativeBuild {
            cmake {
                cppFlags("-std=c++17", "-fno-exceptions", "-fno-rtti")
                arguments("-DANDROID_STL=c++_static")
            }
        }
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    packagingOptions {
        jniLibs {
            useLegacyPackaging = true
        }
    }

    sourceSets["main"].java.srcDirs("src/main/java")
}

dependencies {
    // ExpoModulesCore is injected by the host app's autolinking.
    // Tasks 40-42 will add kotlinx-serialization-json and coroutines.
}
