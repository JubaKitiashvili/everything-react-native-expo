// Task 117.70 — backup / restore CLI for the @erne/monitor dashboard store.
//
// `backupStore` serialises every user-data table to a single versioned JSON
// file. `restoreStore` reads it back in one of two modes:
//   - 'replace': wipe all user data first, then insert (exact mirror of the
//     backup).
//   - 'merge':   idempotent insert — only rows whose id is new are added,
//     existing rows are left untouched (safe to re-run).
//
// Both go through the `IMonitorStore` interface (`exportAllTables` /
// `importTable` / `resetAllUserData`) so the tooling is adapter-agnostic:
// the same code works against SQLite today and any future sync adapter.

import { readFileSync, writeFileSync } from 'node:fs';
import type { IMonitorStore } from '../storage/IMonitorStore.js';

/** Bump when the on-disk shape changes incompatibly. */
export const BACKUP_FORMAT_VERSION = 1 as const;

export type RestoreMode = 'merge' | 'replace';

export interface BackupFile {
  /** Format version of the serialised file. */
  version: number;
  /** ms timestamp the backup was taken. */
  createdAt: number;
  /** table name → raw rows (native column shape). */
  tables: Record<string, Array<Record<string, unknown>>>;
}

export interface BackupResult {
  /** Absolute/relative path the backup was written to. */
  path: string;
  /** Total rows serialised across all tables. */
  rowCount: number;
  /** Per-table row counts. */
  tables: Record<string, number>;
}

export interface RestoreResult {
  mode: RestoreMode;
  /** Total rows written into the store. */
  rowsWritten: number;
  /** Per-table rows written. */
  tables: Record<string, number>;
  /** Rows deleted by the pre-restore wipe (replace mode only). */
  deleted?: Record<string, number>;
}

/**
 * Serialise the entire store to a versioned JSON file at `outPath`.
 * Returns the row counts so a CLI can report what it captured.
 */
export function backupStore(store: IMonitorStore, outPath: string): BackupResult {
  const tables = store.exportAllTables();
  const perTable: Record<string, number> = {};
  let rowCount = 0;
  for (const [name, rows] of Object.entries(tables)) {
    perTable[name] = rows.length;
    rowCount += rows.length;
  }
  const file: BackupFile = {
    version: BACKUP_FORMAT_VERSION,
    createdAt: Date.now(),
    tables,
  };
  writeFileSync(outPath, JSON.stringify(file, null, 2), 'utf8');
  return { path: outPath, rowCount, tables: perTable };
}

/**
 * Read a backup file from `inPath` and load it into `store`.
 *   - replace: `resetAllUserData()` first, then INSERT OR REPLACE every row.
 *   - merge:   INSERT OR IGNORE every row (idempotent — re-running is a no-op
 *     once the rows already exist).
 */
export function restoreStore(
  store: IMonitorStore,
  inPath: string,
  options: { mode?: RestoreMode } = {},
): RestoreResult {
  const mode: RestoreMode = options.mode ?? 'merge';
  const raw = readFileSync(inPath, 'utf8');
  const parsed = parseBackupFile(raw);

  let deleted: Record<string, number> | undefined;
  if (mode === 'replace') {
    deleted = store.resetAllUserData();
  }

  const perTable: Record<string, number> = {};
  let rowsWritten = 0;
  for (const [name, rows] of Object.entries(parsed.tables)) {
    const written = store.importTable(name, rows, mode);
    perTable[name] = written;
    rowsWritten += written;
  }

  const result: RestoreResult = { mode, rowsWritten, tables: perTable };
  if (deleted) result.deleted = deleted;
  return result;
}

/**
 * Validate + parse a backup file body. Throws a descriptive error on a
 * malformed file rather than letting a downstream insert blow up.
 */
export function parseBackupFile(raw: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`[backup] invalid JSON: ${(err as Error).message}`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('[backup] file is not an object');
  }
  const obj = parsed as Partial<BackupFile>;
  if (typeof obj.version !== 'number') {
    throw new Error('[backup] missing or invalid "version"');
  }
  if (obj.version > BACKUP_FORMAT_VERSION) {
    throw new Error(
      `[backup] file version ${obj.version} is newer than supported ${BACKUP_FORMAT_VERSION}`,
    );
  }
  if (typeof obj.tables !== 'object' || obj.tables === null) {
    throw new Error('[backup] missing or invalid "tables"');
  }
  return {
    version: obj.version,
    createdAt: typeof obj.createdAt === 'number' ? obj.createdAt : 0,
    tables: obj.tables as Record<string, Array<Record<string, unknown>>>,
  };
}

export interface BackupCliResult {
  command: 'backup' | 'restore';
  ok: boolean;
  message: string;
  backup?: BackupResult;
  restore?: RestoreResult;
}

/**
 * Thin CLI dispatcher. Not a full arg parser — just enough to wire
 * `erne monitor backup <file>` / `erne monitor restore <file> [--replace]`
 * into a command runner. `argv` is the arg list AFTER the subcommand
 * (e.g. `['backup', 'out.json']`).
 */
export function runBackupCli(store: IMonitorStore, argv: string[]): BackupCliResult {
  const [command, path, ...rest] = argv;
  if (command === 'backup') {
    if (!path) {
      return { command: 'backup', ok: false, message: 'usage: backup <outPath>' };
    }
    const backup = backupStore(store, path);
    return {
      command: 'backup',
      ok: true,
      message: `wrote ${backup.rowCount} rows to ${backup.path}`,
      backup,
    };
  }
  if (command === 'restore') {
    if (!path) {
      return {
        command: 'restore',
        ok: false,
        message: 'usage: restore <inPath> [--replace]',
      };
    }
    const mode: RestoreMode = rest.includes('--replace') ? 'replace' : 'merge';
    const restore = restoreStore(store, path, { mode });
    return {
      command: 'restore',
      ok: true,
      message: `restored ${restore.rowsWritten} rows (${restore.mode}) from ${path}`,
      restore,
    };
  }
  return {
    command: 'backup',
    ok: false,
    message: `unknown command "${command ?? ''}" — expected "backup" or "restore"`,
  };
}
