import type { BreadcrumbCategory } from './extract';

/**
 * ASCII/Unicode glyphs per category so the timeline doesn't need an icon
 * font. Each glyph has a matching severity colour mapped by the CSS
 * module via `[data-category]`.
 */
export const CATEGORY_GLYPH: Record<BreadcrumbCategory, string> = {
  nav: '→',
  net: '⇅',
  touch: '◉',
  state: '⟲',
  render: '◍',
  custom: '✎',
  other: '•',
};

export const CATEGORY_LABEL: Record<BreadcrumbCategory, string> = {
  nav: 'Navigation',
  net: 'Network',
  touch: 'Touch',
  state: 'State',
  render: 'Render',
  custom: 'Custom',
  other: 'Other',
};
