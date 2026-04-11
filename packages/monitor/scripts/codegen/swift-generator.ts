import type {
  SchemaInterface,
  SchemaTypeAlias,
  SchemaTypeExpr,
} from './schema-codegen';

/**
 * Renders a list of parsed SchemaInterfaces to Swift `struct ... : Codable`
 * declarations. String-literal type aliases become Swift enums with
 * `String` raw values so they remain Codable without custom decoders.
 */
export function renderSwift(
  interfaces: readonly SchemaInterface[],
  aliases: readonly SchemaTypeAlias[],
): string {
  const lines: string[] = [];
  lines.push('import Foundation');
  lines.push('');

  for (const alias of aliases) {
    if (alias.docComment) {
      for (const line of alias.docComment.split('\n')) {
        lines.push(`/// ${line}`);
      }
    }
    lines.push(`public enum ${alias.name}: String, Codable {`);
    for (const value of alias.values) {
      lines.push(`    case ${swiftCaseName(value)} = "${value}"`);
    }
    lines.push(`}`);
    lines.push('');
  }

  for (const iface of interfaces) {
    if (iface.docComment) {
      for (const line of iface.docComment.split('\n')) {
        lines.push(`/// ${line}`);
      }
    }
    lines.push(`public struct ${iface.name}: Codable, Equatable {`);
    for (const field of iface.fields) {
      if (field.docComment) {
        lines.push(`    /// ${field.docComment}`);
      }
      const swiftType = renderSwiftType(field.typeExpr);
      const optionalSuffix = field.optional ? '?' : '';
      lines.push(`    public let ${field.name}: ${swiftType}${optionalSuffix}`);
    }
    lines.push(`}`);
    lines.push('');
  }

  return lines.join('\n');
}

function renderSwiftType(expr: SchemaTypeExpr): string {
  switch (expr.kind) {
    case 'primitive':
      return expr.primitive === 'string'
        ? 'String'
        : expr.primitive === 'number'
          ? 'Double'
          : 'Bool';
    case 'array':
      return `[${renderSwiftType(expr.inner)}]`;
    case 'ref':
      return expr.name;
    case 'literal':
      // Swift doesn't have literal types — approximate with String.
      return typeof expr.value === 'number'
        ? 'Double'
        : typeof expr.value === 'boolean'
          ? 'Bool'
          : 'String';
    case 'stringUnion':
      // Without a named alias we emit a String here; code-gen will
      // replace this with a proper enum when the alias is declared.
      return 'String';
    case 'record':
      return `[String: ${renderSwiftType(expr.valueType)}]`;
    case 'nullable':
      return `${renderSwiftType(expr.inner)}?`;
    case 'jsonPrimitive':
      // string | number | boolean — Swift's closest idiom is
      // `AnyCodable` (a hand-rolled wrapper distributed with most
      // Codable apps). Consumers substitute their own if needed.
      return 'AnyCodable';
  }
}

function swiftCaseName(raw: string): string {
  // Convert dashes / dots / colons / spaces to camelCase. Prepend '_' if
  // the name starts with a digit. Swift reserved words are back-quoted.
  const parts = raw.split(/[-_.:\s]/g).filter(Boolean);
  const camel =
    (parts.shift() ?? '').toLowerCase() +
    parts.map((p) => p[0]?.toUpperCase() + p.slice(1).toLowerCase()).join('');
  const cleaned = /^[0-9]/.test(camel) ? `_${camel}` : camel;
  const reserved = new Set(['class', 'struct', 'enum', 'true', 'false', 'default']);
  return reserved.has(cleaned) ? `\`${cleaned}\`` : cleaned;
}
