/**
 * Patches the app entry file to wrap its root element with
 * <MonitorProvider>. Idempotent — if the wrap already exists it's a
 * no-op. Returns the new file content (or null if already patched).
 *
 * The transformation is intentionally text-based, not AST-based: the
 * wizard must survive running against user code it's never seen and
 * must produce minimal, reviewable diffs. An AST pass would be more
 * correct but would also make it harder for the user to eyeball what
 * changed.
 */
export interface PatchResult {
  content: string;
  changed: boolean;
  reason?: string;
}

export function patchAppEntryWithMonitorProvider(
  source: string,
): PatchResult {
  if (source.includes('MonitorProvider')) {
    return {
      content: source,
      changed: false,
      reason: 'MonitorProvider already present',
    };
  }

  const importRegex =
    /^(import[\s\S]*?from\s+['"][^'"]+['"];?\s*\n)+/m;
  const importsMatch = source.match(importRegex);
  const monitorImport = `import { MonitorProvider } from '@erne/monitor';\n`;
  let withImport: string;
  if (importsMatch) {
    // Append after the last existing import.
    withImport = source.replace(
      importRegex,
      (block) => block + monitorImport,
    );
  } else {
    withImport = monitorImport + source;
  }

  // Wrap the first top-level JSX element returned by the component.
  // Heuristic: find `return (` followed by `<` within the body.
  const returnRegex = /return\s*\(\s*(<[^>\s]+)/;
  const match = withImport.match(returnRegex);
  if (!match) {
    return {
      content: withImport,
      changed: true,
      reason: 'added import but could not locate return (<...) — wrap manually',
    };
  }
  const fullMatch = match[0];
  const indent = '      ';
  const wrappedReturn =
    'return (\n' + indent + '<MonitorProvider>\n' + indent + '  ' + match[1];
  const patched = withImport.replace(fullMatch, wrappedReturn);

  // Close the wrap before the final `)`. Walk from the match to find
  // the matching close paren.
  const closeRegex = /\n\s*\)\s*;\s*\n?\s*}/;
  const closeMatch = patched.match(closeRegex);
  if (!closeMatch) {
    return {
      content: patched,
      changed: true,
      reason: 'could not find matching close paren — wrap manually',
    };
  }
  const closed = patched.replace(
    closeRegex,
    `\n${indent}</MonitorProvider>\n    );\n  }`,
  );

  return { content: closed, changed: true };
}
