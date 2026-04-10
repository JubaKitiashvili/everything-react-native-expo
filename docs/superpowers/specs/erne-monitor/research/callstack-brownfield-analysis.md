# Callstack react-native-brownfield Analysis

Research summary from analyzing the Callstack react-native-brownfield repository and its architecture patterns.

## Core Architecture

react-native-brownfield is a **CLI-based toolchain** for integrating React Native into existing native iOS/Android apps. It consists of three command groups:

| Command Group  | Purpose                                                    |
| -------------- | ---------------------------------------------------------- |
| `brownfield`   | Project setup, native module linking, build configuration  |
| `brownie`      | Shared state bridge between native and RN (BrownieStore)   |
| `navigation`   | Cross-boundary navigation between native and RN screens    |

## Single Source of Truth Pattern

The most architecturally interesting pattern is the **codegen pipeline**:

```
*.brownie.ts  -->  ts-morph parse  -->  quicktype  -->  Swift/Kotlin codegen
```

1. Developer defines shared state types in TypeScript (`*.brownie.ts` files)
2. `ts-morph` performs AST analysis to extract type definitions
3. `quicktype` generates platform-native data classes from the extracted types
4. Generated Swift structs and Kotlin data classes are written to the native projects

This means the TypeScript type definition is the single source of truth. Native code never drifts because it is always regenerated from the TS types. If a developer changes the shared state shape in TypeScript, the next codegen run produces matching native types.

### AST-Based Code Analysis

The use of `ts-morph` (a TypeScript AST wrapper) for code analysis is significant:

- It reads TypeScript source files and extracts interface/type definitions programmatically
- No runtime reflection needed -- everything is compile-time
- Can validate that brownie files conform to expected patterns before codegen
- Enables error messages that reference specific source locations

## Brownie JSI Bridge

The BrownieStore is a **C++ JSI HostObject** that provides shared mutable state between native and JS:

### Implementation Stack

| Layer      | Implementation                                              |
| ---------- | ----------------------------------------------------------- |
| C++        | `BrownieStore` class using `folly::dynamic` + `std::mutex`  |
| JS         | JSI HostObject -- synchronous get/set from JavaScript       |
| iOS        | NSDictionary bridge -- Objective-C reads/writes via C++ API |
| Android    | JSON serialization + JNI -- Java/Kotlin access via JNI calls |

### Data Flow

```
JS (SharedValue-like API)
    |
    v
C++ BrownieStore (folly::dynamic, mutex-protected)
    |
    +---> iOS: NSDictionary conversion, KVO notifications
    |
    +---> Android: JSON string serialization, JNI callback
```

### Full-Copy Semantics

The store uses **full-copy semantics** for correctness:

- When native code reads from BrownieStore, it gets a complete copy of the data
- Mutations on the native side do not affect the store until explicitly written back
- This prevents race conditions between JS and native threads
- The mutex in C++ ensures atomic read/write operations

This is a deliberate trade-off: slightly higher memory overhead for guaranteed correctness in a multi-threaded, multi-runtime environment.

## Convention-Based Discovery

The project uses file naming conventions for automatic detection:

- `*.brownie.ts` files are automatically discovered and processed by the codegen pipeline
- No explicit registration or configuration needed
- The CLI scans the project directory for matching file patterns
- Convention over configuration reduces boilerplate

## Conditional Pipeline

The codebase uses `*IfApplicable` helper functions throughout:

```
configureCocoaPodsIfApplicable()
linkAndroidModuleIfApplicable()
generateSwiftTypesIfApplicable()
```

Each helper:
1. Checks whether the operation is relevant (e.g., does the project have a Podfile?)
2. Executes if applicable, skips silently if not
3. Returns a status indicating what happened

This pattern makes the pipeline resilient to partial project configurations -- a project that only has iOS native code will skip all Android steps without errors.

## Monorepo Structure

| Tool        | Purpose                                      |
| ----------- | -------------------------------------------- |
| Yarn 4      | Package management with workspaces           |
| Turborepo   | Build orchestration, caching, task pipelines |
| Lefthook    | Git hooks (lint, typecheck on pre-commit)    |
| Changesets  | Version management and changelog generation  |

The monorepo contains:

- `packages/cli` -- the main CLI tool
- `packages/brownie-jsi` -- the C++ JSI bridge
- `packages/react-native-brownfield` -- the RN-side library
- `apps/example-*` -- example integration projects for iOS and Android

## Key Lessons for ERNE Monitor

1. **AST-based code analysis** -- ts-morph enables reading and understanding project code without executing it. ERNE Monitor could use this for auto-detecting navigation structure, state management patterns, and component hierarchy.

2. **Single source of truth codegen** -- defining types once in TypeScript and generating native counterparts eliminates drift. Monitor SDK could define event schemas in TS and generate native event structs.

3. **Platform-idiomatic APIs** -- the native bridge uses NSDictionary on iOS and JSON+JNI on Android, matching what native developers expect on each platform. Monitor's native SDK layer should follow the same principle.

4. **Full-copy semantics for correctness** -- in a multi-threaded environment (JS thread, UI thread, native main thread), copying data is safer than sharing references. Monitor's event buffer should use similar isolation.

5. **Convention-based discovery** -- file naming patterns for auto-detection reduce configuration overhead. Monitor could discover screens, navigation routes, and API endpoints by convention.

6. **Conditional pipelines** -- `*IfApplicable` helpers make the system resilient to partial configurations. Monitor's setup should gracefully handle projects that only target one platform or lack certain dependencies.
