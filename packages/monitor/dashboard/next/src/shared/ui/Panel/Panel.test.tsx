import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Panel } from './Panel';

describe('Panel', () => {
  test('renders title, description, action, and body children', () => {
    render(
      <Panel title="Health" description="Last 24h" action={<button type="button">Refresh</button>}>
        <p>Body content</p>
      </Panel>,
    );

    expect(screen.getByRole('heading', { name: 'Health' })).toBeInTheDocument();
    expect(screen.getByText('Last 24h')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  test('omits the header region entirely when no title/description/action are provided', () => {
    const { container } = render(
      <Panel>
        <span>Naked body</span>
      </Panel>,
    );

    expect(container.querySelector('header')).toBeNull();
    expect(screen.getByText('Naked body')).toBeInTheDocument();
  });

  test('exposes the density prop on the root element for styling hooks', () => {
    const { container } = render(
      <Panel density="compact" title="Compact">
        <span>x</span>
      </Panel>,
    );

    expect(container.querySelector('section')?.dataset.density).toBe('compact');
  });
});
