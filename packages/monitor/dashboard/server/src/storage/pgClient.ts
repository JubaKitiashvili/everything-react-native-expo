// Task 117.4 — minimal pg client wrapper.
//
// We intentionally avoid importing `pg` at the top level so the package
// can install + tree-shake without it. Consumers who want the
// PostgreSQL adapter add `pg` to their own deps; everyone else gets a
// clean SQLite-only build.
//
// The interface is small enough that tests can supply a stub directly
// — see `postgresStore.test.ts`.

export interface PgQueryResult<R extends Record<string, unknown> = Record<string, unknown>> {
  rows: R[];
  /** Affected-row count for INSERT/UPDATE/DELETE. */
  rowCount?: number | null;
}

export interface PgClient {
  /**
   * Run a parameterized query. `text` uses `$1`, `$2`, ... placeholders;
   * `params` array indexes match. Always returns a typed `rows` array
   * even for write queries (Postgres responds with [] for non-RETURNING
   * writes — this makes the call site uniform).
   */
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<PgQueryResult<R>>;
  /** Acquire a transactional executor. The callback is run inside BEGIN..COMMIT. */
  withTransaction<T>(fn: (tx: PgClient) => Promise<T>): Promise<T>;
  /** Release pooled resources. Idempotent. */
  end(): Promise<void>;
}

export interface PoolPgClientOptions {
  /** Postgres connection string (e.g. `postgres://user:pass@host:5432/db`). */
  connectionString?: string;
  /**
   * Pre-built `pg.Pool` instance. When provided, `connectionString` is
   * ignored. Lets consumers supply their own connection management.
   */
  pool?: PgPoolLike;
  /** Override the dynamic `pg` import — used by tests to inject a stub. */
  loadPg?: () => Promise<PgModuleLike>;
}

/** Subset of node-postgres' `Pool` we depend on. */
export interface PgPoolLike {
  query: PgPoolQueryFn;
  connect: () => Promise<PgPoolClientLike>;
  end: () => Promise<void>;
}

export interface PgPoolClientLike {
  query: PgPoolQueryFn;
  release: (err?: Error) => void;
}

type PgPoolQueryFn = (text: string, params?: ReadonlyArray<unknown>) => Promise<PgQueryResult>;

/** Subset of `import('pg')` we need. */
export interface PgModuleLike {
  Pool: new (config: { connectionString?: string }) => PgPoolLike;
}

/**
 * Build a PgClient backed by a pg.Pool. Imports the `pg` package
 * dynamically so the dependency stays opt-in.
 */
export async function createPoolPgClient(options: PoolPgClientOptions = {}): Promise<PgClient> {
  let pool: PgPoolLike;
  if (options.pool) {
    pool = options.pool;
  } else {
    const load =
      options.loadPg ??
      (async () => {
        // `pg` is an optional peer dependency. We import it dynamically
        // so consumers without Postgres can install + tree-shake the
        // dashboard server without touching node-postgres.
        // @ts-expect-error — runtime resolution of optional peer.
        const mod = await import('pg');
        return mod as unknown as PgModuleLike;
      });
    const pg = await load();
    pool = new pg.Pool(
      options.connectionString !== undefined ? { connectionString: options.connectionString } : {},
    );
  }
  return wrapPool(pool);
}

/**
 * Synchronous version of `createPoolPgClient` for callers who already
 * own a pool instance and don't want to pay the dynamic-import cost.
 */
export function fromPool(pool: PgPoolLike): PgClient {
  return wrapPool(pool);
}

function wrapPool(pool: PgPoolLike): PgClient {
  const root: PgClient = {
    async query<R extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
      params?: ReadonlyArray<unknown>,
    ): Promise<PgQueryResult<R>> {
      const result = await pool.query(text, params);
      return result as PgQueryResult<R>;
    },
    async withTransaction(fn) {
      const conn = await pool.connect();
      try {
        await conn.query('BEGIN');
        const result = await fn(wrapClient(conn));
        await conn.query('COMMIT');
        return result;
      } catch (err) {
        try {
          await conn.query('ROLLBACK');
        } catch {
          // Swallow secondary failure; surface the original error.
        }
        throw err;
      } finally {
        conn.release();
      }
    },
    async end() {
      await pool.end();
    },
  };
  return root;
}

function wrapClient(client: PgPoolClientLike): PgClient {
  // Inside an open transaction, `withTransaction` is a no-op — nesting
  // would require SAVEPOINT, which the storage layer doesn't need.
  return {
    async query<R extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
      params?: ReadonlyArray<unknown>,
    ): Promise<PgQueryResult<R>> {
      const result = await client.query(text, params);
      return result as PgQueryResult<R>;
    },
    async withTransaction(fn) {
      return fn(wrapClient(client));
    },
    async end() {
      // Inside a transaction, releasing the connection is the
      // outer caller's job — make end() a no-op here.
    },
  };
}
