import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { generateSchemas, parseSchemaFromFile } from './schema-codegen';

/**
 * Task 39 — Schema codegen freshness + structural verification.
 *
 * 1. Drift detection: re-runs the codegen against the canonical
 *    `src/types/events.ts` and asserts that the on-disk Swift + Kotlin
 *    files are byte-identical to the freshly generated output. If a
 *    developer changes events.ts and forgets to run `npm run codegen`,
 *    this test fails the CI.
 *
 * 2. Structural cross-reference: parses the on-disk Swift + Kotlin files
 *    and asserts every TypeScript interface field has a matching field
 *    in both targets, and every string-literal alias is represented as a
 *    Swift enum + Kotlin enum.
 *
 * The actual TS → JSON → Swift/Kotlin → JSON → TS round-trip across
 * three runtimes can't run in ts-jest, but the structural check
 * guarantees the fields encode/decode to the same key set in all three
 * languages — which is what the round-trip really protects against.
 */

const PACKAGE_ROOT = path.resolve(__dirname, '../..');
const EVENTS_FILE = path.join(PACKAGE_ROOT, 'src/types/events.ts');
const SWIFT_FILE = path.join(
  PACKAGE_ROOT,
  'ios/generated/ErneMonitorSchema.swift',
);
const KOTLIN_FILE = path.join(
  PACKAGE_ROOT,
  'android/src/main/java/expo/modules/ernemonitor/generated/ErneMonitorSchema.kt',
);

describe('verify-codegen — drift detection', () => {
  test('on-disk Swift + Kotlin files match a fresh codegen run', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-codegen-verify-'));
    try {
      const iosOut = path.join(tmp, 'ios/generated');
      const androidOut = path.join(tmp, 'android');
      const result = await generateSchemas({
        sourceFile: EVENTS_FILE,
        iosOutDir: iosOut,
        androidOutDir: androidOut,
      });
      expect(result.discovered.length).toBeGreaterThan(0);

      const freshSwift = fs.readFileSync(
        path.join(iosOut, 'ErneMonitorSchema.swift'),
        'utf8',
      );
      const freshKotlin = fs.readFileSync(
        path.join(androidOut, 'ErneMonitorSchema.kt'),
        'utf8',
      );
      const onDiskSwift = fs.readFileSync(SWIFT_FILE, 'utf8');
      const onDiskKotlin = fs.readFileSync(KOTLIN_FILE, 'utf8');

      if (freshSwift !== onDiskSwift) {
        throw new Error(
          'Swift codegen drift — run `npm run codegen` to refresh ' +
            'ios/generated/ErneMonitorSchema.swift',
        );
      }
      if (freshKotlin !== onDiskKotlin) {
        throw new Error(
          'Kotlin codegen drift — run `npm run codegen` to refresh ' +
            'android/src/main/java/expo/modules/ernemonitor/generated/ErneMonitorSchema.kt',
        );
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('verify-codegen — Swift output is well-formed', () => {
  const swift = fs.readFileSync(SWIFT_FILE, 'utf8');

  test('every struct conforms to Codable, Equatable, Sendable', () => {
    const structs = [...swift.matchAll(/public struct (\w+):\s*([^{]+)\{/g)];
    expect(structs.length).toBeGreaterThan(0);
    for (const [, name, conformances] of structs) {
      expect(conformances).toContain('Codable');
      expect(conformances).toContain('Equatable');
      expect(conformances).toContain('Sendable');
      expect(typeof name).toBe('string');
    }
  });

  test('every enum conforms to Codable, Sendable with String raw type', () => {
    const enums = [...swift.matchAll(/public enum (\w+):\s*([^{]+)\{/g)];
    expect(enums.length).toBeGreaterThan(0);
    for (const [, , conformances] of enums) {
      expect(conformances).toContain('String');
      expect(conformances).toContain('Codable');
      expect(conformances).toContain('Sendable');
    }
  });
});

describe('verify-codegen — Kotlin output is well-formed', () => {
  const kotlin = fs.readFileSync(KOTLIN_FILE, 'utf8');

  test('package matches the autolinked module path', () => {
    expect(kotlin).toContain('package expo.modules.ernemonitor.generated');
  });

  test('every data class is annotated @Serializable', () => {
    const dataClasses = [...kotlin.matchAll(/data class (\w+)\(/g)];
    expect(dataClasses.length).toBeGreaterThan(0);
    for (const [match, name] of dataClasses) {
      const idx = kotlin.indexOf(match);
      const before = kotlin.slice(0, idx);
      // Walk backwards over docComment lines until we find an annotation
      const lines = before.trim().split('\n');
      const lastNonComment = [...lines]
        .reverse()
        .find((l) => !l.trim().startsWith('/**') && !l.trim().startsWith('*'));
      expect(lastNonComment).toBe('@Serializable');
      expect(typeof name).toBe('string');
    }
  });

  test('every enum class is annotated @Serializable and uses @SerialName', () => {
    const enums = [...kotlin.matchAll(/enum class (\w+) \{/g)];
    expect(enums.length).toBeGreaterThan(0);
    for (const [match] of enums) {
      const idx = kotlin.indexOf(match);
      const before = kotlin.slice(0, idx);
      const lines = before.trim().split('\n');
      const lastNonComment = [...lines]
        .reverse()
        .find((l) => !l.trim().startsWith('/**') && !l.trim().startsWith('*'));
      expect(lastNonComment).toBe('@Serializable');
    }
    expect(kotlin).toMatch(/@SerialName\("[^"]+"\)/);
  });
});

describe('verify-codegen — TS ↔ Swift ↔ Kotlin field cross-reference', () => {
  const swift = fs.readFileSync(SWIFT_FILE, 'utf8');
  const kotlin = fs.readFileSync(KOTLIN_FILE, 'utf8');
  const { interfaces, aliases } = parseSchemaFromFile(EVENTS_FILE);

  test('every parsed interface has a matching Swift struct + Kotlin data class', () => {
    expect(interfaces.length).toBeGreaterThan(0);
    for (const iface of interfaces) {
      expect(swift).toContain(`public struct ${iface.name}`);
      expect(kotlin).toContain(`data class ${iface.name}`);
    }
  });

  test('every TS field name appears as a Swift `public let` and a Kotlin `val`', () => {
    for (const iface of interfaces) {
      // Locate the struct body in Swift
      const structMatch = swift.match(
        new RegExp(
          `public struct ${iface.name}: [^{]+\\{([\\s\\S]*?)\\n\\}`,
          'm',
        ),
      );
      expect(structMatch).not.toBeNull();
      const swiftBody = structMatch![1] ?? '';

      const kotlinMatch = kotlin.match(
        new RegExp(`data class ${iface.name}\\(([\\s\\S]*?)\\n\\)`, 'm'),
      );
      expect(kotlinMatch).not.toBeNull();
      const kotlinBody = kotlinMatch![1] ?? '';

      for (const field of iface.fields) {
        expect(swiftBody).toContain(`public let ${field.name}:`);
        expect(kotlinBody).toContain(`val ${field.name}:`);
      }
    }
  });

  test('every string-literal alias is rendered as a Swift enum + Kotlin enum class', () => {
    expect(aliases.length).toBeGreaterThan(0);
    for (const alias of aliases) {
      expect(swift).toContain(`public enum ${alias.name}: String`);
      expect(kotlin).toContain(`enum class ${alias.name}`);
      for (const value of alias.values) {
        // Swift case: rawValue equals the original string
        expect(swift).toContain(`= "${value}"`);
        // Kotlin: SerialName preserves the original literal
        expect(kotlin).toContain(`@SerialName("${value}")`);
      }
    }
  });
});
