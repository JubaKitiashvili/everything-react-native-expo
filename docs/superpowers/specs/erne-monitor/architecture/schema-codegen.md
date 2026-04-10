# Schema Codegen Architecture

> Single source of truth for event types, with automated generation of TypeScript runtime validators, Swift Codable structs, and Kotlin data classes. Follows the Callstack pattern used in react-native-brownfield.

---

## Motivation

@erne/monitor has three runtimes that must agree on event shapes:

1. **TypeScript** (JS thread) -- collectors emit events, processors transform them, transport serializes them
2. **Swift** (iOS native) -- crash handlers, ANR detectors, FPS monitors emit native events
3. **Kotlin** (Android native) -- same native collectors on Android

Without codegen, keeping these in sync requires manual updates across three languages every time an event type changes. This is error-prone and does not scale to 30+ event types.

---

## The Callstack Pattern

Inspired by Callstack's approach in their brownfield architecture: define types once in TypeScript, use AST parsing to generate platform-native equivalents.

```
schemas/events.monitor.ts          <- Single Source of Truth
         |
         | ts-morph AST parse
         |
         v
    +---------+---------+---------+
    |         |         |         |
    v         v         v         v
events.    EventTypes.  EventTypes.  Runtime
generated. generated.  generated.   validators
ts         swift       kt          (Zod schemas)
```

---

## Source Schema Definitions

All event types are defined in a single TypeScript file. This file uses standard TypeScript interfaces with JSDoc annotations for codegen metadata.

```typescript
// schemas/events.monitor.ts

/**
 * @priority CRITICAL
 * @category crashes
 */
export interface CrashEvent {
  /** Error message */
  message: string;
  /** Symbolicated stack trace */
  stack: string;
  /** React component stack (if available) */
  componentStack?: string;
  /** Whether the crash is fatal (unrecoverable) */
  isFatal: boolean;
  /** Last N actions before crash */
  breadcrumbs: Breadcrumb[];
  /** Normalized hash for deduplication */
  fingerprint: string;
}

/**
 * @priority HIGH
 * @category analytics
 */
export interface NetworkEvent {
  /** Request URL */
  url: string;
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Response status code */
  statusCode: number;
  /** Request duration in milliseconds */
  duration: number;
  /** Request body size in bytes */
  requestSize?: number;
  /** Response body size in bytes */
  responseSize?: number;
}

/**
 * @priority NORMAL
 * @category analytics
 * @unique true
 */
export interface FrameDropEvent {
  /** Number of frames dropped */
  droppedFrames: number;
  /** Expected frames in the interval */
  expectedFrames: number;
  /** JS thread frames per second */
  jsThreadFPS: number;
  /** Native thread frames per second */
  nativeThreadFPS: number;
  /** Screen/route where drops occurred */
  location: string;
}

/**
 * @priority NORMAL
 * @category analytics
 * @unique true
 */
export interface RenderEvent {
  /** Component display name */
  componentName: string;
  /** Number of renders in the observation window */
  renderCount: number;
  /** Total render duration in milliseconds */
  renderDuration: number;
  /** Whether the render was unnecessary (same output) */
  isUnnecessary: boolean;
  /** What triggered the render (state, props, context) */
  trigger: string;
}

/**
 * @priority NORMAL
 * @category analytics
 * @unique true
 */
export interface FrustrationEvent {
  /** Component path of the tapped element */
  tapTarget: string;
  /** Timestamp of the tap */
  tapTimestamp: number;
  /** Type of error that followed */
  errorType: string;
  /** Error message */
  errorMessage: string;
  /** Milliseconds between tap and error */
  delayMs: number;
}

/**
 * @priority CRITICAL
 * @category crashes
 */
export interface ANREvent {
  /** Duration of the main thread block in milliseconds */
  blockDuration: number;
  /** Stack trace of the blocked thread */
  mainThreadStack: string;
  /** JS thread stack at time of detection */
  jsThreadStack?: string;
  /** Screen where ANR was detected */
  screen: string;
}

/**
 * @priority NORMAL
 * @category analytics
 */
export interface StartupEvent {
  /** Startup type */
  type: 'cold' | 'warm' | 'hot';
  /** Total time to interactive in milliseconds */
  ttiMs: number;
  /** Time spent in native init */
  nativeInitMs: number;
  /** Time spent loading JS bundle */
  bundleLoadMs: number;
  /** Time spent in React render */
  firstRenderMs: number;
}

/**
 * @priority LOW
 * @category analytics
 */
export interface MemoryEvent {
  /** JS heap used in bytes */
  jsHeapUsed: number;
  /** JS heap total in bytes */
  jsHeapTotal: number;
  /** Native memory used in bytes */
  nativeMemory: number;
  /** Whether the OS issued a memory warning */
  isWarning: boolean;
}

/**
 * @priority LOW
 * @category analytics
 * @unique true
 */
export interface A11yViolationEvent {
  /** Component that violated */
  componentName: string;
  /** Violation rule ID */
  ruleId: string;
  /** Human-readable violation description */
  description: string;
  /** Severity: error, warning, info */
  severity: 'error' | 'warning' | 'info';
  /** Screen where violation was detected */
  screen: string;
}

// Shared types

export interface Breadcrumb {
  /** Breadcrumb type */
  type: 'navigation' | 'network' | 'state' | 'tap' | 'render' | 'custom';
  /** Category for filtering */
  category: string;
  /** Human-readable message */
  message: string;
  /** Timestamp */
  timestamp: number;
  /** Additional structured data */
  data?: Record<string, unknown>;
}

// ... all 30 event types defined in this file
```

### JSDoc Annotations for Codegen

| Annotation | Purpose | Values |
|-----------|---------|--------|
| `@priority` | Maps to EventStore priority queue | `CRITICAL`, `HIGH`, `NORMAL`, `LOW` |
| `@category` | Maps to ConsentGate consent category | `crashes`, `analytics`, `replay` |
| `@unique` | Whether this event type is unique to ERNE | `true` (for documentation) |

---

## Codegen Pipeline

### Step 1: AST Parsing (ts-morph)

The codegen script uses `ts-morph` to parse the TypeScript source file into an abstract syntax tree, then extracts structured metadata from each interface.

```typescript
// codegen/parse.ts
import { Project, InterfaceDeclaration, PropertySignature } from 'ts-morph';

interface ParsedInterface {
  name: string;
  properties: ParsedProperty[];
  jsdoc: Record<string, string>;
}

interface ParsedProperty {
  name: string;
  type: string;         // resolved TS type
  isOptional: boolean;
  jsdocComment: string;
  isArray: boolean;
  isUnion: boolean;
  unionValues?: string[];
}

function parseSchema(filePath: string): ParsedInterface[] {
  const project = new Project();
  const sourceFile = project.addSourceFileAtPath(filePath);
  const interfaces = sourceFile.getInterfaces();

  return interfaces.map((iface) => ({
    name: iface.getName(),
    properties: iface.getProperties().map(parseProperty),
    jsdoc: parseJSDocTags(iface),
  }));
}

function parseProperty(prop: PropertySignature): ParsedProperty {
  const typeText = prop.getType().getText();
  return {
    name: prop.getName(),
    type: typeText,
    isOptional: prop.hasQuestionToken(),
    jsdocComment: prop.getJsDocs()[0]?.getComment()?.toString() ?? '',
    isArray: typeText.endsWith('[]'),
    isUnion: typeText.includes('|'),
    unionValues: typeText.includes('|')
      ? typeText.split('|').map((v) => v.trim().replace(/'/g, ''))
      : undefined,
  };
}
```

### Step 2: TypeScript Output (Runtime Validators)

Generates runtime type validators alongside the static types. Uses a lightweight validation approach (not Zod, to avoid the dependency).

```typescript
// codegen/generate-ts.ts

function generateTypeScript(interfaces: ParsedInterface[]): string {
  let output = '// AUTO-GENERATED by @erne/monitor codegen\n';
  output += '// Source: schemas/events.monitor.ts\n';
  output += '// DO NOT EDIT MANUALLY\n\n';

  for (const iface of interfaces) {
    // Re-export the type
    output += `export type { ${iface.name} } from '../schemas/events.monitor';\n\n`;

    // Generate runtime validator
    output += `export function validate${iface.name}(value: unknown): value is ${iface.name} {\n`;
    output += `  if (typeof value !== 'object' || value === null) return false;\n`;
    output += `  const obj = value as Record<string, unknown>;\n`;

    for (const prop of iface.properties) {
      if (!prop.isOptional) {
        output += `  if (${generateTypeCheck(prop)}) return false;\n`;
      }
    }

    output += `  return true;\n`;
    output += `}\n\n`;
  }

  return output;
}
```

**Generated output example:**

```typescript
// src/types/events.generated.ts
// AUTO-GENERATED by @erne/monitor codegen
// Source: schemas/events.monitor.ts
// DO NOT EDIT MANUALLY

export type { CrashEvent } from '../schemas/events.monitor';

export function validateCrashEvent(value: unknown): value is CrashEvent {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.message !== 'string') return false;
  if (typeof obj.stack !== 'string') return false;
  if (typeof obj.isFatal !== 'boolean') return false;
  if (!Array.isArray(obj.breadcrumbs)) return false;
  if (typeof obj.fingerprint !== 'string') return false;
  return true;
}

export type { NetworkEvent } from '../schemas/events.monitor';

export function validateNetworkEvent(value: unknown): value is NetworkEvent {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.url !== 'string') return false;
  if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(obj.method as string)) return false;
  if (typeof obj.statusCode !== 'number') return false;
  if (typeof obj.duration !== 'number') return false;
  return true;
}
```

### Step 3: Swift Output (Codable Structs)

Generates Swift structs conforming to `Codable` for native iOS code.

```typescript
// codegen/generate-swift.ts

const TS_TO_SWIFT: Record<string, string> = {
  string: 'String',
  number: 'Double',
  boolean: 'Bool',
  'Record<string, unknown>': '[String: AnyCodable]',
};

function generateSwift(interfaces: ParsedInterface[]): string {
  let output = '// AUTO-GENERATED by @erne/monitor codegen\n';
  output += '// Source: schemas/events.monitor.ts\n';
  output += '// DO NOT EDIT MANUALLY\n\n';
  output += 'import Foundation\n\n';

  for (const iface of interfaces) {
    output += `/// ${iface.jsdoc.priority ?? 'NORMAL'} priority event\n`;
    output += `struct ${iface.name}: Codable {\n`;

    for (const prop of iface.properties) {
      const swiftType = mapToSwiftType(prop);
      const optional = prop.isOptional ? '?' : '';
      output += `    /// ${prop.jsdocComment}\n`;
      output += `    let ${prop.name}: ${swiftType}${optional}\n`;
    }

    // Generate string union enums
    for (const prop of iface.properties) {
      if (prop.isUnion && prop.unionValues) {
        output += `\n    enum ${capitalize(prop.name)}Value: String, Codable {\n`;
        for (const val of prop.unionValues) {
          output += `        case ${camelCase(val)} = "${val}"\n`;
        }
        output += `    }\n`;
      }
    }

    output += `}\n\n`;
  }

  return output;
}
```

**Generated output example:**

```swift
// ios/EventTypes.generated.swift
// AUTO-GENERATED by @erne/monitor codegen
// Source: schemas/events.monitor.ts
// DO NOT EDIT MANUALLY

import Foundation

/// CRITICAL priority event
struct CrashEvent: Codable {
    /// Error message
    let message: String
    /// Symbolicated stack trace
    let stack: String
    /// React component stack (if available)
    let componentStack: String?
    /// Whether the crash is fatal (unrecoverable)
    let isFatal: Bool
    /// Last N actions before crash
    let breadcrumbs: [Breadcrumb]
    /// Normalized hash for deduplication
    let fingerprint: String
}

/// HIGH priority event
struct NetworkEvent: Codable {
    /// Request URL
    let url: String
    /// HTTP method
    let method: MethodValue
    /// Response status code
    let statusCode: Double
    /// Request duration in milliseconds
    let duration: Double
    /// Request body size in bytes
    let requestSize: Double?
    /// Response body size in bytes
    let responseSize: Double?

    enum MethodValue: String, Codable {
        case get = "GET"
        case post = "POST"
        case put = "PUT"
        case delete = "DELETE"
        case patch = "PATCH"
    }
}

/// NORMAL priority event
struct FrameDropEvent: Codable {
    /// Number of frames dropped
    let droppedFrames: Double
    /// Expected frames in the interval
    let expectedFrames: Double
    /// JS thread frames per second
    let jsThreadFPS: Double
    /// Native thread frames per second
    let nativeThreadFPS: Double
    /// Screen/route where drops occurred
    let location: String
}

struct Breadcrumb: Codable {
    let type: TypeValue
    let category: String
    let message: String
    let timestamp: Double
    let data: [String: AnyCodable]?

    enum TypeValue: String, Codable {
        case navigation
        case network
        case state
        case tap
        case render
        case custom
    }
}
```

### Step 4: Kotlin Output (Data Classes)

Generates Kotlin data classes with `@Serializable` annotations for Android native code.

```typescript
// codegen/generate-kotlin.ts

const TS_TO_KOTLIN: Record<string, string> = {
  string: 'String',
  number: 'Double',
  boolean: 'Boolean',
  'Record<string, unknown>': 'Map<String, Any?>',
};

function generateKotlin(interfaces: ParsedInterface[]): string {
  let output = '// AUTO-GENERATED by @erne/monitor codegen\n';
  output += '// Source: schemas/events.monitor.ts\n';
  output += '// DO NOT EDIT MANUALLY\n\n';
  output += 'package com.erne.monitor.events\n\n';
  output += 'import kotlinx.serialization.Serializable\n\n';

  for (const iface of interfaces) {
    output += `/** ${iface.jsdoc.priority ?? 'NORMAL'} priority event */\n`;
    output += `@Serializable\n`;
    output += `data class ${iface.name}(\n`;

    const props = iface.properties.map((prop) => {
      const kotlinType = mapToKotlinType(prop);
      const default_ = prop.isOptional ? ' = null' : '';
      return `    /** ${prop.jsdocComment} */\n    val ${prop.name}: ${kotlinType}${default_}`;
    });

    output += props.join(',\n');
    output += `\n)\n\n`;
  }

  return output;
}
```

**Generated output example:**

```kotlin
// android/EventTypes.generated.kt
// AUTO-GENERATED by @erne/monitor codegen
// Source: schemas/events.monitor.ts
// DO NOT EDIT MANUALLY

package com.erne.monitor.events

import kotlinx.serialization.Serializable

/** CRITICAL priority event */
@Serializable
data class CrashEvent(
    /** Error message */
    val message: String,
    /** Symbolicated stack trace */
    val stack: String,
    /** React component stack (if available) */
    val componentStack: String? = null,
    /** Whether the crash is fatal (unrecoverable) */
    val isFatal: Boolean,
    /** Last N actions before crash */
    val breadcrumbs: List<Breadcrumb>,
    /** Normalized hash for deduplication */
    val fingerprint: String
)

/** HIGH priority event */
@Serializable
data class NetworkEvent(
    /** Request URL */
    val url: String,
    /** HTTP method */
    val method: String,
    /** Response status code */
    val statusCode: Double,
    /** Request duration in milliseconds */
    val duration: Double,
    /** Request body size in bytes */
    val requestSize: Double? = null,
    /** Response body size in bytes */
    val responseSize: Double? = null
)

/** NORMAL priority event */
@Serializable
data class FrameDropEvent(
    /** Number of frames dropped */
    val droppedFrames: Double,
    /** Expected frames in the interval */
    val expectedFrames: Double,
    /** JS thread frames per second */
    val jsThreadFPS: Double,
    /** Native thread frames per second */
    val nativeThreadFPS: Double,
    /** Screen/route where drops occurred */
    val location: String
)

@Serializable
data class Breadcrumb(
    val type: String,
    val category: String,
    val message: String,
    val timestamp: Double,
    val data: Map<String, String>? = null
)
```

---

## Running Codegen

### CLI Command

```bash
# Run codegen manually
npx @erne/monitor codegen

# Watch mode (re-runs on schema file change)
npx @erne/monitor codegen --watch
```

### Build Integration

Codegen runs automatically as a `prebuild` step. The generated files are checked into git (not `.gitignore`d) so that:

1. CI builds don't require codegen as a build step
2. PRs show diffs in generated files (catches accidental schema changes)
3. Native builds work without Node.js tooling

```json
// package.json
{
  "scripts": {
    "codegen": "tsx codegen/run.ts",
    "prebuild": "npm run codegen",
    "pretest": "npm run codegen"
  }
}
```

### Codegen Runner

```typescript
// codegen/run.ts
import { parseSchema } from './parse';
import { generateTypeScript } from './generate-ts';
import { generateSwift } from './generate-swift';
import { generateKotlin } from './generate-kotlin';
import { writeFileSync } from 'node:fs';

const SCHEMA_PATH = 'schemas/events.monitor.ts';

const interfaces = parseSchema(SCHEMA_PATH);

writeFileSync(
  'src/types/events.generated.ts',
  generateTypeScript(interfaces),
);

writeFileSync(
  'ios/EventTypes.generated.swift',
  generateSwift(interfaces),
);

writeFileSync(
  'android/EventTypes.generated.kt',
  generateKotlin(interfaces),
);

console.log(`Generated types for ${interfaces.length} event interfaces`);
```

---

## Type Safety Guarantees

The codegen pipeline enforces these guarantees:

1. **Source is always TypeScript.** Developers only edit `schemas/events.monitor.ts`. Swift and Kotlin files are generated, never hand-edited.

2. **Schema changes are validated.** The codegen script fails if it encounters unsupported TypeScript constructs (generics, mapped types, conditional types). Only simple interfaces with primitive, array, union, and nested interface types are supported.

3. **Generated files are deterministic.** Same input always produces same output. No timestamps, no random values. Clean diffs in PRs.

4. **Bidirectional serialization.** Every event can be serialized to JSON in any runtime and deserialized in any other runtime. The codegen ensures JSON field names match across all three languages.

5. **Validation at boundaries.** Runtime validators (generated TypeScript functions) are used at the native-to-JS bridge boundary to catch shape mismatches early.

---

## Supported Type Mappings

| TypeScript | Swift | Kotlin | JSON |
|-----------|-------|--------|------|
| `string` | `String` | `String` | `string` |
| `number` | `Double` | `Double` | `number` |
| `boolean` | `Bool` | `Boolean` | `boolean` |
| `string[]` | `[String]` | `List<String>` | `array` |
| `T[]` | `[T]` | `List<T>` | `array` |
| `T?` (optional) | `T?` | `T? = null` | `null` or absent |
| `'a' \| 'b' \| 'c'` | `enum: String, Codable` | `String` (validated) | `string` |
| `Record<string, unknown>` | `[String: AnyCodable]` | `Map<String, Any?>` | `object` |
| nested interface | nested struct | nested data class | nested object |

### Unsupported (Codegen Error)

- Generic types (`T<U>`)
- Mapped types (`Pick<T, K>`)
- Conditional types (`T extends U ? X : Y`)
- Index signatures (`[key: string]: T`)
- Function types (`() => void`)

These restrictions keep the codegen simple and the generated code predictable across all three target languages.
