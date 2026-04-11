import type {
  SchemaInterface,
  SchemaTypeAlias,
  SchemaTypeExpr,
} from './schema-codegen';

/**
 * Renders a list of parsed SchemaInterfaces to Kotlin data classes with
 * `@Serializable` annotations (kotlinx.serialization). String literal
 * unions become `enum class ... { ... }` with `@SerialName` per value.
 */
export function renderKotlin(
  interfaces: readonly SchemaInterface[],
  aliases: readonly SchemaTypeAlias[],
): string {
  const lines: string[] = [];
  lines.push('package dev.erne.monitor.schema');
  lines.push('');
  lines.push('import kotlinx.serialization.Serializable');
  lines.push('import kotlinx.serialization.SerialName');
  lines.push('');

  for (const alias of aliases) {
    if (alias.docComment) {
      for (const line of alias.docComment.split('\n')) {
        lines.push(`/// ${line}`);
      }
    }
    lines.push('@Serializable');
    lines.push(`enum class ${alias.name} {`);
    const lastIndex = alias.values.length - 1;
    alias.values.forEach((value, i) => {
      const identifier = kotlinEnumName(value);
      const suffix = i === lastIndex ? '' : ',';
      lines.push(`    @SerialName("${value}") ${identifier}${suffix}`);
    });
    lines.push(`}`);
    lines.push('');
  }

  for (const iface of interfaces) {
    if (iface.docComment) {
      for (const line of iface.docComment.split('\n')) {
        lines.push(`/** ${line} */`);
      }
    }
    lines.push('@Serializable');
    if (iface.fields.length === 0) {
      lines.push(`data class ${iface.name}(val __empty: Boolean = true)`);
      lines.push('');
      continue;
    }
    lines.push(`data class ${iface.name}(`);
    const lastIndex = iface.fields.length - 1;
    iface.fields.forEach((field, i) => {
      if (field.docComment) {
        lines.push(`    /** ${field.docComment} */`);
      }
      const kotlinType = renderKotlinType(field.typeExpr);
      const optional = field.optional ? '? = null' : '';
      const suffix = i === lastIndex ? '' : ',';
      lines.push(`    val ${field.name}: ${kotlinType}${optional}${suffix}`);
    });
    lines.push(`)`);
    lines.push('');
  }

  return lines.join('\n');
}

function renderKotlinType(expr: SchemaTypeExpr): string {
  switch (expr.kind) {
    case 'primitive':
      return expr.primitive === 'string'
        ? 'String'
        : expr.primitive === 'number'
          ? 'Double'
          : 'Boolean';
    case 'array':
      return `List<${renderKotlinType(expr.inner)}>`;
    case 'ref':
      return expr.name;
    case 'literal':
      return typeof expr.value === 'number'
        ? 'Double'
        : typeof expr.value === 'boolean'
          ? 'Boolean'
          : 'String';
    case 'stringUnion':
      return 'String';
    case 'record':
      return `Map<String, ${renderKotlinType(expr.valueType)}>`;
    case 'nullable':
      return `${renderKotlinType(expr.inner)}?`;
    case 'jsonPrimitive':
      // string | number | boolean — kotlinx.serialization represents
      // this as JsonPrimitive inside its JSON tree API.
      return 'kotlinx.serialization.json.JsonPrimitive';
  }
}

function kotlinEnumName(raw: string): string {
  // Kotlin enum names: UPPER_SNAKE_CASE. Replace non-identifier chars
  // with underscores and prefix digits with `_`.
  let out = raw.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  if (/^[0-9]/.test(out)) out = `_${out}`;
  return out;
}
