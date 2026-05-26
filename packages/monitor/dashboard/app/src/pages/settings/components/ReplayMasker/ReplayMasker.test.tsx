import { describe, expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReplayMasker } from './ReplayMasker';
import { DEFAULT_MASK_RULES, DEMO_HIERARCHY, type HierarchyNode } from './rules';

describe('ReplayMasker panel', () => {
  test('renders the demo hierarchy with the default ruleset already marking PII fields', () => {
    render(<ReplayMasker />);
    const tree = screen.getByRole('list', { name: /hierarchy preview/i });

    // Non-masked leaves stay in the "visible" state (data-masked="false").
    expect(within(tree).getByText(/Checkout/)).toBeInTheDocument();
    const emailNode = tree.querySelector('[data-node-id="email"]') as HTMLElement | null;
    expect(emailNode?.dataset.masked).toBe('false');

    // Masked leaves render the dot-dot-dot redaction + show the "masked" pill.
    const ccNode = tree.querySelector('[data-node-id="card-number"]') as HTMLElement | null;
    expect(ccNode?.dataset.masked).toBe('true');
    expect(within(ccNode!).getByText(/masked/i)).toBeInTheDocument();
    expect(within(ccNode!).getByText('•••••••••')).toBeInTheDocument();
  });

  test('toggling secureTextEntry off drops the CVV verdict and notifies onRulesChange', async () => {
    const onRulesChange = vi.fn();
    render(<ReplayMasker onRulesChange={onRulesChange} />);

    // Baseline — secureTextEntry on, cvv masked.
    const treeBefore = screen.getByRole('list', { name: /hierarchy preview/i });
    expect((treeBefore.querySelector('[data-node-id="cvv"]') as HTMLElement).dataset.masked).toBe(
      'true',
    );

    await userEvent.click(screen.getByRole('checkbox', { name: /secureTextEntry/i }));

    expect(onRulesChange).toHaveBeenCalledWith({
      ...DEFAULT_MASK_RULES,
      secureTextEntry: false,
    });
    // CVV still has nativeID=cvv-field (matches the default nativeID regex) —
    // so it stays masked via a different rule. Verify by reading the reasons.
    const verdictList = screen.getByRole('list', { name: /verdict explanations/i });
    const cvvLine = within(verdictList).getByText('cvv').closest('li');
    expect(cvvLine?.textContent).not.toContain('secure-text-entry');
    expect(cvvLine?.textContent).toContain('nativeID');
  });

  test('custom hierarchy without any matching nodes surfaces the empty-verdict hint', () => {
    const hierarchy: HierarchyNode = {
      id: 'root',
      kind: 'container',
      children: [
        { id: 'name', kind: 'input', text: 'Juba', testID: 'name-field' },
        { id: 'city', kind: 'input', text: 'Tbilisi', testID: 'city-field' },
      ],
    };
    render(
      <ReplayMasker
        hierarchy={hierarchy}
        initialRules={{ ...DEFAULT_MASK_RULES, secureTextEntry: false }}
      />,
    );
    expect(screen.getByText(/no rules match/i)).toBeInTheDocument();
    expect(screen.getByText(/0 nodes would be masked/i)).toBeInTheDocument();
  });
});

test('DEMO_HIERARCHY is exported for reuse by other panels', () => {
  expect(DEMO_HIERARCHY.id).toBe('root');
});
