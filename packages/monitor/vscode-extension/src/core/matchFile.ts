/**
 * Pure file ↔ screen matching. No `vscode` import — fully unit-tested.
 */

/**
 * Given an open document path and the set of known screen names, return the
 * screen whose name matches the file's basename, or null when none match.
 *
 * Matching is:
 * - basename only (directories ignored),
 * - extension-stripped (`Home.tsx` → `Home`),
 * - case-insensitive (`home` matches `Home`).
 *
 * Handles both POSIX (`/`) and Windows (`\`) separators.
 */
export function screenForDocumentPath(
  path: string | null | undefined,
  screens: readonly string[],
): string | null {
  const stem = basenameStem(path);
  if (!stem) {
    return null;
  }

  const target = stem.toLowerCase();
  for (const screen of screens) {
    if (screenStem(screen).toLowerCase() === target) {
      return screen;
    }
  }
  return null;
}

/** Extract the extension-stripped basename from a file path. */
function basenameStem(path: string | null | undefined): string {
  if (!path) {
    return '';
  }
  const segments = path.split(/[\\/]/);
  const base = segments[segments.length - 1] ?? '';
  return stripExtension(base);
}

/**
 * A screen name may itself be a path or carry an extension (e.g. a route file
 * like `app/home.tsx` or just `Home`). Reduce it to a comparable stem.
 */
function screenStem(screen: string): string {
  return basenameStem(screen);
}

/** Strip a single trailing extension, preserving leading dots. */
function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  // Keep dotfiles like ".eslintrc" intact (dot at index 0).
  if (dot <= 0) {
    return name;
  }
  return name.slice(0, dot);
}
