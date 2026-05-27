/**
 * VS Code glue for the ERNE Monitor extension.
 *
 * 🟡 This file imports `vscode` and exercises the extension host. It is NOT
 * covered by the unit tests — it is a thin shell that delegates all decisions
 * to the pure logic in `./core`, which IS unit-tested. Verifying the live
 * behavior (CodeLens rendering, command execution, openExternal) requires
 * `@vscode/test-electron` + a display.
 */
import * as vscode from 'vscode';

import { crashUrl } from './core/dashboardUrl';
import { fetchCrashGroups } from './core/crashClient';
import { buildCrashIndex, codeLensText } from './core/crashIndex';
import { screenForDocumentPath } from './core/matchFile';
import type { CrashIndex } from './core/types';

const OPEN_CRASH_COMMAND = 'erne-monitor.openCrash';
const CONFIG_SECTION = 'erne-monitor';

interface ExtensionConfig {
  dashboardUrl: string;
  apiKey?: string;
}

function readConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    dashboardUrl: config.get<string>('dashboardUrl', 'http://localhost:4174'),
    apiKey: config.get<string>('apiKey') || undefined,
  };
}

/**
 * Provides a single crash-count CodeLens at the top of any open file whose
 * basename matches a known crash screen.
 */
class CrashCodeLensProvider implements vscode.CodeLensProvider {
  private index: CrashIndex = new Map();

  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.onDidChangeEmitter.event;

  setIndex(index: CrashIndex): void {
    this.index = index;
    this.onDidChangeEmitter.fire();
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const screens = [...this.index.keys()];
    const screen = screenForDocumentPath(document.uri.fsPath, screens);
    if (!screen) {
      return [];
    }

    const entry = this.index.get(screen);
    if (!entry) {
      return [];
    }

    const range = new vscode.Range(0, 0, 0, 0);
    const lens = new vscode.CodeLens(range, {
      title: codeLensText(entry),
      command: OPEN_CRASH_COMMAND,
      arguments: [entry.topFingerprint],
    });
    return [lens];
  }
}

/** Pull crash groups from the dashboard and rebuild the lens index. */
async function refreshCrashIndex(provider: CrashCodeLensProvider): Promise<void> {
  const { dashboardUrl, apiKey } = readConfig();
  const groups = await fetchCrashGroups(dashboardUrl, { fetchImpl: globalThis.fetch, apiKey });
  provider.setIndex(buildCrashIndex(groups));
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new CrashCodeLensProvider();
  context.subscriptions.push(provider);

  // Attach lenses to common React Native / Expo source file types.
  const selector: vscode.DocumentSelector = [
    { scheme: 'file', language: 'typescriptreact' },
    { scheme: 'file', language: 'javascriptreact' },
    { scheme: 'file', language: 'typescript' },
    { scheme: 'file', language: 'javascript' },
  ];
  context.subscriptions.push(vscode.languages.registerCodeLensProvider(selector, provider));

  // Command: open the dashboard crash URL for a given fingerprint.
  context.subscriptions.push(
    vscode.commands.registerCommand(OPEN_CRASH_COMMAND, async (fingerprint?: string) => {
      const { dashboardUrl } = readConfig();
      const target = crashUrl(dashboardUrl, fingerprint ?? '');
      await vscode.env.openExternal(vscode.Uri.parse(target));
    }),
  );

  // Refresh when the relevant config changes.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(CONFIG_SECTION)) {
        void refreshCrashIndex(provider);
      }
    }),
  );

  // Initial load (errors are swallowed by the pure client).
  void refreshCrashIndex(provider);
}

export function deactivate(): void {
  // Nothing to tear down beyond the disposables registered in `activate`.
}
