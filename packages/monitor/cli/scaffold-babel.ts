/**
 * Idempotently adds @erne/monitor to the plugins array in babel.config.js
 * (or babel.config.cjs). Returns the new content and a flag.
 *
 * Because babel configs vary widely (function, object, JSON, etc.) we
 * only handle two common shapes:
 *
 *   module.exports = function (api) { return { presets: [...], plugins: [...] } };
 *   module.exports = { presets: [...], plugins: [...] };
 *
 * For anything else we return `changed: false` with a reason so the
 * wizard can print a manual-setup hint.
 */
export interface BabelPatchResult {
  content: string;
  changed: boolean;
  reason?: string;
}

const PLUGIN_LITERAL = "'@erne/monitor/babel-plugin'";

export function patchBabelConfig(source: string): BabelPatchResult {
  if (source.includes(PLUGIN_LITERAL)) {
    return {
      content: source,
      changed: false,
      reason: '@erne/monitor/babel-plugin already present',
    };
  }

  // Case 1: existing `plugins: [ ... ]` array — append to it.
  const pluginsArrayRegex = /plugins\s*:\s*\[([^\]]*)\]/;
  if (pluginsArrayRegex.test(source)) {
    const patched = source.replace(pluginsArrayRegex, (_full, inner: string) => {
      const trimmed = inner.trim();
      const separator = trimmed.length === 0 ? '' : ',';
      return `plugins: [${inner}${separator} ${PLUGIN_LITERAL}]`;
    });
    return { content: patched, changed: true };
  }

  // Case 2: existing `presets: [ ... ]` but no plugins — add a plugins
  // field right after presets.
  const presetsRegex = /presets\s*:\s*\[[^\]]*\]/;
  if (presetsRegex.test(source)) {
    const patched = source.replace(
      presetsRegex,
      (full) => `${full},\n    plugins: [${PLUGIN_LITERAL}]`,
    );
    return { content: patched, changed: true };
  }

  return {
    content: source,
    changed: false,
    reason:
      'could not find a presets or plugins array — add @erne/monitor/babel-plugin by hand',
  };
}
