/**
 * Replay masker rules — evaluated against the view hierarchy snapshot the
 * SDK attaches to each replay frame. Every rule is independently toggleable
 * and each regex is compiled lazily so the editor can surface invalid
 * patterns without crashing the preview.
 */

export interface MaskRule {
  /** Mask any node where `secureTextEntry === true`. Always regex-free. */
  secureTextEntry: boolean;
  testIdPattern: string;
  nativeIdPattern: string;
  a11yLabelPattern: string;
}

export const DEFAULT_MASK_RULES: MaskRule = {
  secureTextEntry: true,
  testIdPattern: '(?i)(card|cc|ssn|password|cvv|cvc)',
  nativeIdPattern: '(?i)(password|pin|cvv|cvc)',
  a11yLabelPattern: '(?i)(social security|credit card|password)',
};

/** Minimal view-node shape we match on. Superset of the fields the SDK emits. */
export interface HierarchyNode {
  id: string;
  kind: 'text' | 'input' | 'image' | 'container';
  text?: string;
  testID?: string;
  nativeID?: string;
  a11yLabel?: string;
  secureTextEntry?: boolean;
  children?: HierarchyNode[];
}

export type MaskReason = 'secure-text-entry' | 'testID' | 'nativeID' | 'a11yLabel';

export interface MaskVerdict {
  nodeId: string;
  reasons: MaskReason[];
}

function safeRegex(pattern: string): RegExp | null {
  if (pattern.trim().length === 0) return null;
  try {
    // Support (?i) flag prefix — mirrors the on-device evaluator written in
    // Swift/Kotlin where inline flags are common. Strip + apply as native
    // JS flag.
    const inlineFlag = /^\(\?([imsu]+)\)/.exec(pattern);
    if (inlineFlag && inlineFlag[1]) {
      const body = pattern.slice(inlineFlag[0].length);
      return new RegExp(body, inlineFlag[1]);
    }
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

/**
 * Walk the hierarchy and produce one verdict per masked node. A single node
 * may match more than one rule; all reasons are collected so the UI can
 * explain "this field matches `testID=cc-number` and `secureTextEntry=true`."
 */
export function applyMaskRules(
  root: HierarchyNode | HierarchyNode[],
  rules: MaskRule,
): MaskVerdict[] {
  const verdicts: MaskVerdict[] = [];
  const testRe = safeRegex(rules.testIdPattern);
  const nativeRe = safeRegex(rules.nativeIdPattern);
  const a11yRe = safeRegex(rules.a11yLabelPattern);

  const visit = (node: HierarchyNode): void => {
    const reasons: MaskReason[] = [];
    if (rules.secureTextEntry && node.secureTextEntry === true) {
      reasons.push('secure-text-entry');
    }
    if (testRe && node.testID && testRe.test(node.testID)) {
      reasons.push('testID');
    }
    if (nativeRe && node.nativeID && nativeRe.test(node.nativeID)) {
      reasons.push('nativeID');
    }
    if (a11yRe && node.a11yLabel && a11yRe.test(node.a11yLabel)) {
      reasons.push('a11yLabel');
    }
    if (reasons.length > 0) verdicts.push({ nodeId: node.id, reasons });
    if (node.children) for (const child of node.children) visit(child);
  };

  const roots = Array.isArray(root) ? root : [root];
  for (const node of roots) visit(node);
  return verdicts;
}

/** Demo hierarchy used by the live preview when no real frame is available. */
export const DEMO_HIERARCHY: HierarchyNode = {
  id: 'root',
  kind: 'container',
  children: [
    {
      id: 'heading',
      kind: 'text',
      text: 'Checkout',
    },
    {
      id: 'email',
      kind: 'input',
      text: 'you@example.com',
      testID: 'email-input',
      a11yLabel: 'Email address',
    },
    {
      id: 'card-number',
      kind: 'input',
      text: '4242 4242 4242 4242',
      testID: 'cc-number',
      a11yLabel: 'Credit card number',
    },
    {
      id: 'expiry',
      kind: 'input',
      text: '12/29',
      testID: 'cc-expiry',
      a11yLabel: 'Expiry date',
    },
    {
      id: 'cvv',
      kind: 'input',
      text: '123',
      nativeID: 'cvv-field',
      secureTextEntry: true,
    },
    {
      id: 'terms',
      kind: 'text',
      text: 'Accept terms & conditions',
    },
  ],
};
