/**
 * Pure ProGuard mapping parser + frame resolver.
 *
 * ProGuard/R8 emits `mapping.txt` in the well-known format:
 *
 *     com.example.MyClass -> a.b.c:
 *         int myField -> d
 *         12:15:void myMethod(com.example.Other) -> e
 *
 * This module builds an index `{ obfuscatedClass → ProGuardClass }` so the
 * dashboard can take a stack frame like `a.b.c.e` and surface the original
 * `com.example.MyClass.myMethod`. iOS dSYMs are binary and not parsed here;
 * resolve() simply echoes the input with `resolved: false` on that path.
 */

import type {
  SymbolFileRecord,
  SymbolPlatform,
  SymbolResolveInput,
} from '../storage/types.js';

export interface ProGuardMember {
  /** Deobfuscated name (method name or field name). */
  original: string;
  /** Best-effort method signature; undefined for fields. */
  signature?: string;
}

export interface ProGuardClass {
  /** Original fully-qualified class name. */
  original: string;
  /** Obfuscated fully-qualified class name (map key). */
  obfuscated: string;
  /** `obfuscatedMember → original`. */
  members: Map<string, ProGuardMember>;
}

export interface ProGuardMapping {
  classes: Map<string, ProGuardClass>;
  entryCount: number;
}

const CLASS_LINE = /^(?<original>[^\s][\w$.]+)\s+->\s+(?<obfuscated>[\w$.]+):\s*$/;
// Example member lines:
//   "    int myField -> d"
//   "    12:15:void myMethod(com.example.Other) -> e"
const MEMBER_LINE = /^\s+(?:\d+:\d+:)?(?<type>[\w$.[\]]+)\s+(?<name>[\w$<>]+)\s*(?<args>\([^)]*\))?\s+->\s+(?<obfuscated>[\w$<>]+)\s*$/;

export function parseProGuardMapping(text: string): ProGuardMapping {
  const classes = new Map<string, ProGuardClass>();
  let current: ProGuardClass | null = null;
  let entryCount = 0;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.length === 0 || line.startsWith('#')) continue;

    if (!line.startsWith(' ') && !line.startsWith('\t')) {
      const cls = CLASS_LINE.exec(line);
      if (!cls?.groups) {
        current = null;
        continue;
      }
      const { original, obfuscated } = cls.groups;
      if (!original || !obfuscated) continue;
      current = {
        original,
        obfuscated,
        members: new Map<string, ProGuardMember>(),
      };
      classes.set(obfuscated, current);
      entryCount += 1;
      continue;
    }

    if (!current) continue;
    const m = MEMBER_LINE.exec(line);
    if (!m?.groups) continue;
    const { name, args, obfuscated } = m.groups;
    if (!name || !obfuscated) continue;
    const member: ProGuardMember = { original: name };
    if (args) member.signature = args;
    current.members.set(obfuscated, member);
    entryCount += 1;
  }

  return { classes, entryCount };
}

export interface ResolvedFrame {
  input: SymbolResolveInput;
  resolved: boolean;
  symbol: string;
  note?: string;
  source?: {
    fileId: string;
    platform: SymbolPlatform;
    version: string;
  };
}

/**
 * Given a stack symbol and an artefact, produce the deobfuscated form.
 *
 * - `a.b.c.e` with a ProGuard mapping → `com.example.MyClass.myMethod`
 * - `a.b.c`           with a ProGuard mapping → `com.example.MyClass`
 * - iOS dSYM input    → input echoed with `note: 'ios-not-parsed'`
 * - No mapping found  → input echoed with `note: 'no-mapping'`
 */
export function resolveFrame(
  input: SymbolResolveInput,
  artefact: SymbolFileRecord | null,
): ResolvedFrame {
  if (!artefact) {
    return { input, resolved: false, symbol: input.symbol, note: 'no-mapping' };
  }

  if (artefact.platform === 'ios' || artefact.mappingText === null) {
    return {
      input,
      resolved: false,
      symbol: input.symbol,
      note: 'ios-not-parsed',
      source: { fileId: artefact.id, platform: artefact.platform, version: artefact.version },
    };
  }

  const mapping = parseProGuardMapping(artefact.mappingText);
  const source = {
    fileId: artefact.id,
    platform: artefact.platform,
    version: artefact.version,
  };

  // Try longest class prefix match — `a.b.c.e` where `a.b.c` is a class and
  // `e` is a member. Fall back to class-only lookup for `a.b.c`.
  const symbol = input.symbol.trim();
  const parts = symbol.split('.');
  for (let cut = parts.length - 1; cut >= 1; cut--) {
    const classKey = parts.slice(0, cut).join('.');
    const memberKey = parts.slice(cut).join('.');
    const cls = mapping.classes.get(classKey);
    if (!cls) continue;
    const member = cls.members.get(memberKey);
    if (member) {
      return {
        input,
        resolved: true,
        symbol: `${cls.original}.${member.original}${member.signature ?? ''}`,
        source,
      };
    }
    // Class matched but member did not — return class at least.
    return {
      input,
      resolved: true,
      symbol: cls.original,
      note: 'member-not-found',
      source,
    };
  }

  const cls = mapping.classes.get(symbol);
  if (cls) {
    return { input, resolved: true, symbol: cls.original, source };
  }

  return { input, resolved: false, symbol, note: 'no-match', source };
}
