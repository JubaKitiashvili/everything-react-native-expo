/**
 * Pure dashboard URL helpers. No `vscode` import — fully unit-tested.
 */

/**
 * Build the dashboard URL for a single crash fingerprint.
 *
 * `<base>/crashes/<encoded-fingerprint>`
 *
 * - The base URL's trailing slash is normalized away so we never produce a
 *   double slash.
 * - The fingerprint is percent-encoded so arbitrary fingerprint strings
 *   (slashes, spaces, etc.) survive intact.
 * - Never throws: a nullish/empty base falls back to an empty origin and a
 *   nullish fingerprint is treated as an empty string.
 */
export function crashUrl(baseUrl: string | null | undefined, fingerprint: string | null | undefined): string {
  const base = normalizeBaseUrl(baseUrl);
  const fp = encodeURIComponent(fingerprint ?? '');
  return `${base}/crashes/${fp}`;
}

/**
 * Strip any trailing slash(es) from a base URL. Returns '' for nullish input.
 */
export function normalizeBaseUrl(baseUrl: string | null | undefined): string {
  if (!baseUrl) {
    return '';
  }
  return baseUrl.replace(/\/+$/, '');
}
