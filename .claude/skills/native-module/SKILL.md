---
name: native-module
description: Create native modules with sequential native-bridge-builder then code-reviewer agents
---

# /native-module — Create Native Module

You are executing the `/native-module` command. Run **native-bridge-builder** first (create the module), then **code-reviewer** (review it). This is sequential, not parallel.

## Phase 1: native-bridge-builder — Scaffold & Implement

### Determine Module Type
Ask the user or detect from project:
1. **Expo Modules API** — For Expo managed projects (recommended)
2. **Turbo Module** — For bare React Native projects (New Architecture)
3. **Fabric Component** — For custom native views

### Scaffold the Module
Generate all required files based on module type:

**Expo Module (6 files):**
```
modules/[module-name]/
  expo-module.config.json     # Module configuration
  src/[ModuleName]Module.ts   # TypeScript API definition
  ios/[ModuleName]Module.swift # Swift implementation
  android/src/main/java/.../[ModuleName]Module.kt  # Kotlin implementation
  src/__tests__/[ModuleName].test.ts  # Unit tests
  README.md                   # Usage documentation
```

### Implementation Guidelines
- Define clear TypeScript interface first (contract)
- Implement Swift and Kotlin to match the contract
- Handle errors consistently (reject Promises with error codes)
- Use `async/await` in Swift, coroutines in Kotlin
- Include JSDoc comments on the TypeScript API

## Phase 2: code-reviewer — Review the Module

After module creation, automatically run code review:
- Verify TypeScript types match native implementations
- Check error handling on both platforms
- Validate threading (no main thread blocking)
- Review memory management (cleanup, listeners)
- Check platform parity (same behavior iOS/Android)

## Output
- Scaffolded module files with implementation
- Code review results
- Usage example in React Native
