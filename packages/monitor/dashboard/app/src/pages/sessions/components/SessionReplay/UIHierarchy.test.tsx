import { describe, expect, test } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { UIHierarchy } from './UIHierarchy';
import type { HierarchyNode } from './hierarchy';

const FIXTURE: HierarchyNode = {
  id: 'root',
  kind: 'container',
  masked: false,
  children: [
    { id: 'heading', kind: 'text', text: 'Checkout', role: 'header', masked: false, children: [] },
    {
      id: 'card-number',
      kind: 'input',
      text: '4242 4242 4242 4242',
      role: 'Credit card number',
      masked: true,
      children: [],
    },
  ],
};

describe('UIHierarchy', () => {
  test('renders each captured node with its kind and node id', () => {
    render(<UIHierarchy hierarchy={FIXTURE} />);
    const tree = screen.getByRole('list', { name: /captured ui hierarchy/i });

    expect(tree.querySelector('[data-node-id="root"]')).not.toBeNull();
    expect(tree.querySelector('[data-node-id="heading"]')).not.toBeNull();
    expect(within(tree).getByText('Checkout')).toBeInTheDocument();
    expect(screen.getByText(/3 nodes · 1 masked/)).toBeInTheDocument();
  });

  test('marks masked nodes with the masked indicator and redacted text', () => {
    render(<UIHierarchy hierarchy={FIXTURE} />);
    const tree = screen.getByRole('list', { name: /captured ui hierarchy/i });

    const cc = tree.querySelector('[data-node-id="card-number"]') as HTMLElement | null;
    expect(cc?.dataset.masked).toBe('true');
    expect(within(cc!).getByText(/masked/i)).toBeInTheDocument();
    expect(within(cc!).getByText('•••••••••')).toBeInTheDocument();
    // raw card number must never appear
    expect(screen.queryByText('4242 4242 4242 4242')).not.toBeInTheDocument();

    const heading = tree.querySelector('[data-node-id="heading"]') as HTMLElement | null;
    expect(heading?.dataset.masked).toBe('false');
  });

  test('shows an empty message when no hierarchy is captured', () => {
    render(<UIHierarchy />);
    expect(screen.getByText(/no ui hierarchy captured/i)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /captured ui hierarchy/i })).not.toBeInTheDocument();
  });
});
