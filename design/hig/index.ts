// design/hig/index.ts
import colorsData from './data/colors.json';
import typographyData from './data/typography.json';
import spacingData from './data/spacing.json';
import controlsData from './data/controls.json';
import checklistData from './data/checklist.json';

// Types
export interface HigColor {
  keyword: string;
  name?: string;
  light: string;
  dark: string;
  usage?: string;
  role?: string;
}

export interface HigTypographyStyle {
  keyword: string;
  name: string;
  size: number;
  weight: string;
  tracking: number;
  lineHeight: number;
  font: string;
}

export interface HigSpacingValue {
  keyword: string;
  value: number;
  usage: string;
}

export interface HigControl {
  keyword: string;
  component: string;
  variant: string;
  height: number;
  cornerRadius: number;
  fontWeight: string;
  fontSize: number;
  paddingH: number;
  states: string[];
}

export interface HigChecklistRule {
  id: string;
  category: string;
  description: string;
  check: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  weight: number;
}

// Data exports
export const colors = colorsData as {
  system: HigColor[];
  grays: HigColor[];
  labels: HigColor[];
  backgrounds: HigColor[];
  fills: HigColor[];
  separators: HigColor[];
};

export const typography = typographyData as {
  styles: HigTypographyStyle[];
  weights: Record<string, string>;
};

export const spacing = spacingData as {
  scale: HigSpacingValue[];
  semantic: HigSpacingValue[];
  gridUnit: number;
  validValues: number[];
};

export const controls = controlsData as {
  components: HigControl[];
  minTouchTarget: number;
};

export const checklist = checklistData as {
  rules: HigChecklistRule[];
};

// Spring presets (from craft.md, programmatic access)
export const springPresets = {
  smooth: { damping: 20, stiffness: 300, mass: 1 },
  snappy: { damping: 25, stiffness: 400, mass: 0.8 },
  bouncy: { damping: 18, stiffness: 350, mass: 1 },
  gentle: { damping: 20, stiffness: 100, mass: 1 },
} as const;

// Haptic pairing guide
export const hapticPairing = {
  buttonPress: 'impactLight',
  toggleSwitch: 'impactMedium',
  destructiveAction: 'notificationWarning',
  successConfirmation: 'notificationSuccess',
  errorFeedback: 'notificationError',
  selectionChange: 'selection',
  longPress: 'impactHeavy',
} as const;

// All HIG data for search indexing
export function getAllSearchableContent(): Array<{ id: string; text: string; category: string }> {
  const items: Array<{ id: string; text: string; category: string }> = [];

  colors.system.forEach((c) => {
    items.push({ id: c.keyword, text: `${c.name} ${c.usage} ${c.role} ${c.light} ${c.dark}`, category: 'colors' });
  });

  typography.styles.forEach((t) => {
    items.push({ id: t.keyword, text: `${t.name} ${t.size}pt ${t.weight} ${t.font}`, category: 'typography' });
  });

  spacing.scale.forEach((s) => {
    items.push({ id: s.keyword, text: `${s.keyword} ${s.value}pt ${s.usage}`, category: 'spacing' });
  });

  controls.components.forEach((c) => {
    items.push({ id: c.keyword, text: `${c.component} ${c.variant} height:${c.height} radius:${c.cornerRadius}`, category: 'controls' });
  });

  checklist.rules.forEach((r) => {
    items.push({ id: r.id, text: `${r.description} ${r.check}`, category: 'checklist' });
  });

  return items;
}
