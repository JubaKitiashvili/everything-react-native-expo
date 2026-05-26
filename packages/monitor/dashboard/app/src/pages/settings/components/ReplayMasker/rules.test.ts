import { describe, expect, test } from 'vitest';
import { applyMaskRules, DEFAULT_MASK_RULES, DEMO_HIERARCHY, type HierarchyNode } from './rules';

describe('applyMaskRules', () => {
  test('matches the default ruleset against the demo checkout hierarchy', () => {
    const verdicts = applyMaskRules(DEMO_HIERARCHY, DEFAULT_MASK_RULES);
    const byId = new Map(verdicts.map((v) => [v.nodeId, v.reasons]));
    expect(byId.get('card-number')).toEqual(['testID', 'a11yLabel']);
    expect(byId.get('expiry')).toEqual(['testID']);
    // CVV has no testID, so only secureTextEntry + nativeID rules fire.
    expect(byId.get('cvv')).toEqual(['secure-text-entry', 'nativeID']);
    // Non-PII leaves stay unmasked.
    expect(byId.has('heading')).toBe(false);
    expect(byId.has('email')).toBe(false);
    expect(byId.has('terms')).toBe(false);
  });

  test('invalid regex in a pattern degrades gracefully without crashing', () => {
    const hierarchy: HierarchyNode = {
      id: 'root',
      kind: 'container',
      children: [
        {
          id: 'a',
          kind: 'input',
          testID: 'secret',
          secureTextEntry: true,
        },
      ],
    };
    const verdicts = applyMaskRules(hierarchy, {
      ...DEFAULT_MASK_RULES,
      testIdPattern: '(bad[',
    });
    // Bad regex is ignored; the secureTextEntry rule still fires.
    expect(verdicts).toEqual([{ nodeId: 'a', reasons: ['secure-text-entry'] }]);
  });
});
