export interface ParsedLocation {
  file: string;
  line?: number;
  column?: number;
}

/**
 * Parse a "file:line:col" location string. Supports bare files and files
 * with optional line or line+col. Returns the raw string as `file` if no
 * numeric suffix matches so we never drop information we don't understand.
 * Tolerates Windows drive-letter prefixes (`C:\foo\bar.ts:10:5`).
 */
export function parseLocation(location: string): ParsedLocation {
  const match = location.match(/^(.*?)(?::(\d+)(?::(\d+))?)?$/);
  if (!match) return { file: location };
  const [, fileRaw, lineRaw, colRaw] = match;
  const file = fileRaw && fileRaw.length > 0 ? fileRaw : location;
  const out: ParsedLocation = { file };
  if (lineRaw !== undefined) out.line = Number(lineRaw);
  if (colRaw !== undefined) out.column = Number(colRaw);
  return out;
}
