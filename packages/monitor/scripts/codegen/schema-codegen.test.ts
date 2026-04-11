import * as path from 'path';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'fs';
import * as os from 'os';
import {
  generateSchemas,
  parseSchemaFromFile,
} from './schema-codegen';

function writeFixture(content: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'erne-codegen-'));
  const file = path.join(dir, 'events.ts');
  writeFileSync(file, content, 'utf8');
  return file;
}

describe('schema-codegen parse', () => {
  it('reads a simple interface with primitives and optionals', () => {
    const file = writeFixture(`
      export interface SamplePayload {
        name: string;
        count: number;
        ok: boolean;
        note?: string;
      }
    `);
    const { interfaces } = parseSchemaFromFile(file);
    expect(interfaces).toHaveLength(1);
    const i = interfaces[0]!;
    expect(i.name).toBe('SamplePayload');
    expect(i.fields).toHaveLength(4);
    expect(i.fields[0]).toMatchObject({
      name: 'name',
      typeExpr: { kind: 'primitive', primitive: 'string' },
      optional: false,
    });
    expect(i.fields[3]).toMatchObject({ name: 'note', optional: true });
    rmSync(path.dirname(file), { recursive: true });
  });

  it('reads arrays and nested interface references', () => {
    const file = writeFixture(`
      export interface InnerPayload { id: string; }
      export interface OuterPayload {
        items: InnerPayload[];
        tags: string[];
      }
    `);
    const { interfaces } = parseSchemaFromFile(file);
    const outer = interfaces.find((i) => i.name === 'OuterPayload')!;
    expect(outer.fields[0]).toMatchObject({
      name: 'items',
      typeExpr: {
        kind: 'array',
        inner: { kind: 'ref', name: 'InnerPayload' },
      },
    });
    expect(outer.fields[1]).toMatchObject({
      name: 'tags',
      typeExpr: {
        kind: 'array',
        inner: { kind: 'primitive', primitive: 'string' },
      },
    });
    rmSync(path.dirname(file), { recursive: true });
  });

  it('reads X | null as nullable', () => {
    const file = writeFixture(`
      export interface NullablePayload {
        stack: string | null;
      }
    `);
    const { interfaces } = parseSchemaFromFile(file);
    expect(interfaces[0]?.fields[0]?.typeExpr).toMatchObject({
      kind: 'nullable',
      inner: { kind: 'primitive', primitive: 'string' },
    });
    rmSync(path.dirname(file), { recursive: true });
  });

  it('reads string literal unions as stringUnion', () => {
    const file = writeFixture(`
      export interface KindPayload {
        kind: 'a' | 'b' | 'c';
      }
    `);
    const { interfaces } = parseSchemaFromFile(file);
    expect(interfaces[0]?.fields[0]?.typeExpr).toMatchObject({
      kind: 'stringUnion',
      values: ['a', 'b', 'c'],
    });
    rmSync(path.dirname(file), { recursive: true });
  });

  it('reads string literal type aliases as enums', () => {
    const file = writeFixture(`
      export type Severity = 'info' | 'warn' | 'error';
      export interface Nothing { foo: string; }
    `);
    const { aliases } = parseSchemaFromFile(file);
    const sev = aliases.find((a) => a.name === 'Severity');
    expect(sev?.values).toEqual(['error', 'info', 'warn']);
    rmSync(path.dirname(file), { recursive: true });
  });

  it('reads Record<string, primitive> as record', () => {
    const file = writeFixture(`
      export interface BagPayload {
        attrs: Record<string, string>;
      }
    `);
    const { interfaces } = parseSchemaFromFile(file);
    expect(interfaces[0]?.fields[0]?.typeExpr).toMatchObject({
      kind: 'record',
      valueType: { kind: 'primitive', primitive: 'string' },
    });
    rmSync(path.dirname(file), { recursive: true });
  });

  it('only discovers auto-included naming patterns by default', () => {
    const file = writeFixture(`
      export interface Skipped { x: string; }
      export interface GoodPayload { y: string; }
    `);
    const { interfaces } = parseSchemaFromFile(file);
    expect(interfaces.map((i) => i.name)).toEqual(['GoodPayload']);
    rmSync(path.dirname(file), { recursive: true });
  });
});

describe('schema-codegen render', () => {
  const fixtureSource = `
    export type Severity = 'info' | 'warn' | 'error';
    export interface LogPayload {
      severity: Severity;
      message: string;
      ts: number;
      tags?: string[];
    }
  `;

  it('renders Swift structs with Codable + enum aliases', async () => {
    const file = writeFixture(fixtureSource);
    const result = await generateSchemas({ sourceFile: file, dryRun: true });
    const swift = result.swift['ErneMonitorSchema.swift']!;
    expect(swift).toContain('import Foundation');
    expect(swift).toContain('public enum Severity: String, Codable');
    expect(swift).toContain('case info = "info"');
    expect(swift).toContain('public struct LogPayload: Codable');
    expect(swift).toContain('public let message: String');
    expect(swift).toContain('public let ts: Double');
    expect(swift).toContain('public let tags: [String]?');
    expect(swift).toContain('Auto-generated by @erne/monitor');
    rmSync(path.dirname(file), { recursive: true });
  });

  it('renders Kotlin data classes with @Serializable + @SerialName', async () => {
    const file = writeFixture(fixtureSource);
    const result = await generateSchemas({ sourceFile: file, dryRun: true });
    const kotlin = result.kotlin['ErneMonitorSchema.kt']!;
    expect(kotlin).toContain('package dev.erne.monitor.schema');
    expect(kotlin).toContain('@Serializable');
    expect(kotlin).toContain('enum class Severity');
    expect(kotlin).toContain('@SerialName("info") INFO');
    expect(kotlin).toContain('data class LogPayload(');
    expect(kotlin).toContain('val message: String');
    expect(kotlin).toContain('val ts: Double');
    expect(kotlin).toContain('val tags: List<String>? = null');
    rmSync(path.dirname(file), { recursive: true });
  });

  it('is idempotent — twice produces identical output', async () => {
    const file = writeFixture(fixtureSource);
    const a = await generateSchemas({ sourceFile: file, dryRun: true });
    const b = await generateSchemas({ sourceFile: file, dryRun: true });
    expect(a.swift).toEqual(b.swift);
    expect(a.kotlin).toEqual(b.kotlin);
    rmSync(path.dirname(file), { recursive: true });
  });

  it('writes files to disk when not dryRun', async () => {
    const file = writeFixture(fixtureSource);
    const outDir = path.join(path.dirname(file), 'out-ios');
    const kotlinDir = path.join(path.dirname(file), 'out-android');
    await generateSchemas({
      sourceFile: file,
      iosOutDir: outDir,
      androidOutDir: kotlinDir,
    });
    const swiftPath = path.join(outDir, 'ErneMonitorSchema.swift');
    const kotlinPath = path.join(kotlinDir, 'ErneMonitorSchema.kt');
    expect(existsSync(swiftPath)).toBe(true);
    expect(existsSync(kotlinPath)).toBe(true);
    expect(readFileSync(swiftPath, 'utf8')).toContain('public struct LogPayload');
    expect(readFileSync(kotlinPath, 'utf8')).toContain('data class LogPayload');
    rmSync(path.dirname(file), { recursive: true });
  });

  it('parses the canonical src/types/events.ts without throwing', async () => {
    const canonical = path.resolve(__dirname, '../../src/types/events.ts');
    const { interfaces, aliases } = parseSchemaFromFile(canonical);
    // Sanity: we expect the Crash / Network / Navigation / Custom /
    // Render payload interfaces and the context envelope.
    const names = interfaces.map((i) => i.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'CrashEventPayload',
        'NetworkEventPayload',
        'NavigationEventPayload',
        'CustomEventPayload',
        'RenderEventPayload',
        'EventContext',
        'EventDevice',
        'EventApp',
        'EventSession',
        'EventMemory',
      ]),
    );
    // MonitorEventKind is a string-literal alias.
    expect(aliases.find((a) => a.name === 'MonitorEventKind')).toBeDefined();
    const result = await generateSchemas({
      sourceFile: canonical,
      dryRun: true,
    });
    expect(result.swift['ErneMonitorSchema.swift']).toBeTruthy();
    expect(result.kotlin['ErneMonitorSchema.kt']).toBeTruthy();
  });
});
