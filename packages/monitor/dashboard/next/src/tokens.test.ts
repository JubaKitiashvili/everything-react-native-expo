import { describe, expect, test } from 'vitest';
import cssSource from './tokens.css?raw';
import { SEVERITY_ORDER, colors, duration, fontSize, radius, severityColor, space } from './tokens';

function cssVar(name: string): string {
  const match = cssSource.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`CSS token --${name} missing from tokens.css`);
  return match[1]!.trim();
}

describe('tokens.ts <-> tokens.css mirror', () => {
  test('color palette matches CSS custom properties byte-for-byte', () => {
    expect(cssVar('color-bg-base')).toBe(colors.bg.base);
    expect(cssVar('color-bg-surface')).toBe(colors.bg.surface);
    expect(cssVar('color-bg-surface-hover')).toBe(colors.bg.surfaceHover);
    expect(cssVar('color-bg-elevated')).toBe(colors.bg.elevated);

    expect(cssVar('color-border-subtle')).toBe(colors.border.subtle);
    expect(cssVar('color-border-default')).toBe(colors.border.default);
    expect(cssVar('color-border-strong')).toBe(colors.border.strong);

    expect(cssVar('color-text-primary')).toBe(colors.text.primary);
    expect(cssVar('color-text-secondary')).toBe(colors.text.secondary);
    expect(cssVar('color-text-tertiary')).toBe(colors.text.tertiary);
    expect(cssVar('color-text-disabled')).toBe(colors.text.disabled);

    expect(cssVar('color-brand-mint')).toBe(colors.brand.mint);
    expect(cssVar('color-brand-mint-subtle')).toBe(colors.brand.mintSubtle);

    expect(cssVar('color-severity-critical')).toBe(colors.severity.critical);
    expect(cssVar('color-severity-warning')).toBe(colors.severity.warning);
    expect(cssVar('color-severity-info')).toBe(colors.severity.info);
    expect(cssVar('color-severity-success')).toBe(colors.severity.success);
    expect(cssVar('color-severity-muted')).toBe(colors.severity.muted);
  });

  test('space scale matches (px-suffixed CSS values)', () => {
    expect(cssVar('space-1')).toBe(`${space[1]}px`);
    expect(cssVar('space-4')).toBe(`${space[4]}px`);
    expect(cssVar('space-8')).toBe(`${space[8]}px`);
  });

  test('radius scale matches (px-suffixed CSS values)', () => {
    expect(cssVar('radius-md')).toBe(`${radius.md}px`);
    expect(cssVar('radius-pill')).toBe(`${radius.pill}px`);
  });

  test('font sizes + motion match', () => {
    expect(cssVar('font-size-base')).toBe(`${fontSize.base}px`);
    expect(cssVar('font-size-display')).toBe(`${fontSize.display}px`);
    expect(cssVar('duration-base')).toBe(`${duration.base}ms`);
  });
});

describe('severity helpers', () => {
  test('SEVERITY_ORDER covers exactly the five supported severities in priority order', () => {
    expect([...SEVERITY_ORDER]).toEqual(['critical', 'warning', 'info', 'success', 'muted']);
  });

  test('severityColor returns the brand/severity hex for each severity', () => {
    expect(severityColor('critical')).toBe(colors.severity.critical);
    expect(severityColor('warning')).toBe(colors.severity.warning);
    expect(severityColor('info')).toBe(colors.severity.info);
    expect(severityColor('success')).toBe(colors.severity.success);
    expect(severityColor('muted')).toBe(colors.severity.muted);
  });
});
