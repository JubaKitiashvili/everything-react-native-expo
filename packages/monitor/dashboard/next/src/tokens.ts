/**
 * @erne/monitor dashboard — design tokens.
 *
 * Dark-first palette. Mirrors the CSS custom properties defined in
 * `tokens.css` (single source of truth for both TS consumers — like
 * Sparkline SVG stroke colors — and CSS modules that use `var(--*)`).
 *
 * If you change a value here, change the matching `:root` rule in
 * `tokens.css` as well. A unit test enforces the mirror.
 */

export const colors = {
  bg: {
    base: '#0a0b0d',
    surface: '#111317',
    surfaceHover: '#181b20',
    elevated: '#1a1d22',
  },
  border: {
    subtle: '#1c1f23',
    default: '#2a2f36',
    strong: '#3a4048',
  },
  text: {
    primary: '#f3f4f6',
    secondary: '#9ca3af',
    tertiary: '#6b7280',
    disabled: '#4b5563',
  },
  brand: {
    mint: '#5af0b1',
    mintSubtle: 'rgba(90, 240, 177, 0.16)',
  },
  severity: {
    critical: '#ff5a5f',
    criticalSubtle: 'rgba(255, 90, 95, 0.16)',
    warning: '#fbbf24',
    warningSubtle: 'rgba(251, 191, 36, 0.16)',
    info: '#60a5fa',
    infoSubtle: 'rgba(96, 165, 250, 0.16)',
    success: '#5af0b1',
    successSubtle: 'rgba(90, 240, 177, 0.16)',
    muted: '#6b7280',
    mutedSubtle: 'rgba(107, 114, 128, 0.16)',
  },
} as const;

export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 12,
  md: 13,
  base: 14,
  lg: 16,
  xl: 18,
  display: 22,
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
} as const;

export const duration = {
  fast: 120,
  base: 200,
  slow: 360,
} as const;

export const fontFamily = {
  sans: `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`,
  mono: `ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace`,
} as const;

export const SEVERITY_ORDER = ['critical', 'warning', 'info', 'success', 'muted'] as const;
export type Severity = (typeof SEVERITY_ORDER)[number];

export function severityColor(severity: Severity): string {
  switch (severity) {
    case 'critical':
      return colors.severity.critical;
    case 'warning':
      return colors.severity.warning;
    case 'info':
      return colors.severity.info;
    case 'success':
      return colors.severity.success;
    case 'muted':
      return colors.severity.muted;
  }
}

export function severityBackground(severity: Severity): string {
  switch (severity) {
    case 'critical':
      return colors.severity.criticalSubtle;
    case 'warning':
      return colors.severity.warningSubtle;
    case 'info':
      return colors.severity.infoSubtle;
    case 'success':
      return colors.severity.successSubtle;
    case 'muted':
      return colors.severity.mutedSubtle;
  }
}
