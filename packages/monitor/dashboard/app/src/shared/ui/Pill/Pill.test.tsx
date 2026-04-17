import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pill } from './Pill';

describe('Pill', () => {
  test('renders the correct severity attribute for every known severity', () => {
    const { rerender } = render(<Pill severity="critical">12</Pill>);
    expect(screen.getByText('12')).toHaveAttribute('data-severity', 'critical');

    rerender(<Pill severity="warning">W</Pill>);
    expect(screen.getByText('W')).toHaveAttribute('data-severity', 'warning');

    rerender(<Pill severity="info">I</Pill>);
    expect(screen.getByText('I')).toHaveAttribute('data-severity', 'info');

    rerender(<Pill severity="success">S</Pill>);
    expect(screen.getByText('S')).toHaveAttribute('data-severity', 'success');

    rerender(<Pill severity="muted">M</Pill>);
    expect(screen.getByText('M')).toHaveAttribute('data-severity', 'muted');
  });

  test('defaults to muted severity when none is provided', () => {
    render(<Pill>default</Pill>);
    expect(screen.getByText('default')).toHaveAttribute('data-severity', 'muted');
  });

  test('renders a button and invokes onClick when interactive', async () => {
    const onClick = vi.fn();
    render(
      <Pill onClick={onClick} ariaLabel="Dismiss filter">
        Dismiss
      </Pill>,
    );

    const button = screen.getByRole('button', { name: 'Dismiss filter' });
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
