// @erne/monitor Babel auto-instrumentation plugin.
//
// Adds zero-overhead-when-disabled instrumentation to React components:
//
//   1. Anonymous arrow-function components get a displayName derived
//      from their variable identifier so RenderCollector / devtools
//      show a real name instead of "Anonymous".
//   2. Pressable / TouchableOpacity / TouchableHighlight usages in JSX
//      get an `onMonitorTouch` prop injected that calls
//      globalThis.__ERNE_MONITOR__?.runtime.collectors.touchBoundary
//      .record(...) with the component path.
//   3. Top-level `<Suspense>` elements are wrapped with a
//      `<MonitoredSuspense>` import from '@erne/monitor' so
//      SuspenseCollector can measure fallback duration.
//   4. Components marked with a `// @erne-monitor-ignore` leading
//      comment are skipped entirely.
//
// Options:
//   {
//     include?: RegExp[],    // file path allowlist
//     exclude?: RegExp[],    // file path blocklist (applied after include)
//     enableDisplayName?: boolean,
//     enableTouchBoundary?: boolean,
//     enableSuspenseWrap?: boolean,
//   }

import type { ConfigAPI, PluginObj, PluginPass, NodePath } from '@babel/core';
import type * as t from '@babel/types';

import { displayNameVisitor } from './visitors/component-visitor';
import { touchBoundaryVisitor } from './visitors/touch-visitor';
import { suspenseVisitor } from './visitors/suspense-visitor';

export interface ErneMonitorPluginOptions {
  include?: readonly (string | RegExp)[];
  exclude?: readonly (string | RegExp)[];
  enableDisplayName?: boolean;
  enableTouchBoundary?: boolean;
  enableSuspenseWrap?: boolean;
}

interface PluginState extends PluginPass {
  opts: ErneMonitorPluginOptions;
}

function shouldProcessFile(
  filename: string | undefined,
  opts: ErneMonitorPluginOptions,
): boolean {
  if (!filename) return false;
  const include = opts.include ?? [];
  const exclude = opts.exclude ?? [/node_modules/];
  if (include.length > 0) {
    const matched = include.some((p) =>
      typeof p === 'string' ? filename.includes(p) : p.test(filename),
    );
    if (!matched) return false;
  }
  for (const p of exclude) {
    if (typeof p === 'string' ? filename.includes(p) : p.test(filename)) {
      return false;
    }
  }
  return true;
}

function hasIgnoreComment(path: NodePath<t.Node>): boolean {
  // Walk up to the statement-level node whose leading comments include
  // the pragma. Variable declarators don't carry leading comments
  // themselves — they sit on the enclosing VariableDeclaration or on
  // the exporting declaration.
  let cur: NodePath<t.Node> | null = path;
  while (cur) {
    const comments = (cur.node.leadingComments ?? []) as Array<{
      value?: string;
    }>;
    if (comments.some((c) => /@erne-monitor-ignore/.test(c.value ?? ''))) {
      return true;
    }
    if (cur.isStatement() || cur.isProgram()) break;
    cur = cur.parentPath;
  }
  return false;
}

export default function ernePlugin(
  _api: ConfigAPI,
  _opts?: ErneMonitorPluginOptions,
): PluginObj<PluginState> {
  return {
    name: '@erne/monitor/babel-plugin',
    visitor: {
      Program(path, state) {
        const filename = state.file?.opts?.filename ?? undefined;
        const opts = state.opts ?? {};
        if (!shouldProcessFile(filename, opts)) {
          (state as unknown as { __erneSkip: boolean }).__erneSkip = true;
        }
      },
      VariableDeclarator(path, state) {
        if ((state as unknown as { __erneSkip?: boolean }).__erneSkip) return;
        if (state.opts?.enableDisplayName === false) return;
        if (hasIgnoreComment(path)) return;
        displayNameVisitor(path);
      },
      JSXOpeningElement(path, state) {
        if ((state as unknown as { __erneSkip?: boolean }).__erneSkip) return;
        const opts = state.opts ?? {};
        if (opts.enableTouchBoundary !== false) touchBoundaryVisitor(path);
      },
      JSXElement(path, state) {
        if ((state as unknown as { __erneSkip?: boolean }).__erneSkip) return;
        const opts = state.opts ?? {};
        if (opts.enableSuspenseWrap !== false) suspenseVisitor(path);
      },
    },
  };
}

export const _testing = {
  shouldProcessFile,
  hasIgnoreComment,
};
