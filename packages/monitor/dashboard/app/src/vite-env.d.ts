/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Plausible site domain for the dashboard's own self-analytics. When unset,
   * the in-app analytics module (`@/shared/analytics`) is a silent no-op —
   * analytics is OFF BY DEFAULT.
   */
  readonly VITE_ANALYTICS_DOMAIN?: string;
  /**
   * Plausible-compatible ingest host. Defaults to `https://plausible.io` when
   * unset. Only used when `VITE_ANALYTICS_DOMAIN` is also set.
   */
  readonly VITE_ANALYTICS_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
