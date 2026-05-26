export interface ParsedStackFrame {
  symbol: string;
  location?: string;
  /** True if the parser matched a standard `at foo (loc)` or `at loc` line. */
  resolved: boolean;
}

export interface ParsedStack {
  /** The first line of the stack — typically `ErrorName: message`. */
  message: string;
  frames: ParsedStackFrame[];
}

const FRAME_WITH_SYMBOL = /^at\s+(.+?)\s+\((.+)\)$/;
const FRAME_LOCATION_ONLY = /^at\s+(.+)$/;

/**
 * Parse a standard JS stack string into a message + frame list. Tolerant
 * of Hermes, V8, and React Native frame formats — extra indentation is
 * trimmed, ANSI-free, and frames we can't categorise still appear as
 * unresolved rows so the user sees everything the SDK captured.
 *
 * Intentionally pure so the unit tests don't need a React environment.
 */
export function parseStack(stack: string): ParsedStack {
  if (typeof stack !== 'string' || stack.length === 0) {
    return { message: '', frames: [] };
  }
  const lines = stack.split(/\r?\n/).map((line) => line.trim());
  const message = lines[0] ?? '';
  const frames: ParsedStackFrame[] = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || raw.length === 0) continue;
    const withSymbol = raw.match(FRAME_WITH_SYMBOL);
    if (withSymbol) {
      frames.push({
        symbol: withSymbol[1]!.trim(),
        location: withSymbol[2]!.trim(),
        resolved: true,
      });
      continue;
    }
    const locationOnly = raw.match(FRAME_LOCATION_ONLY);
    if (locationOnly) {
      frames.push({
        symbol: '<anonymous>',
        location: locationOnly[1]!.trim(),
        resolved: true,
      });
      continue;
    }
    frames.push({ symbol: raw, resolved: false });
  }
  return { message, frames };
}
