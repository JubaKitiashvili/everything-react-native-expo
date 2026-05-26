import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Flamegraph } from './Flamegraph';
import { foldSamples } from './foldSamples';

describe('Flamegraph panel', () => {
  test('renders the empty state when there is no profile', () => {
    render(<Flamegraph root={null} />);
    expect(screen.getByRole('heading', { name: 'Flamegraph' })).toBeInTheDocument();
    expect(screen.getByText(/no CPU profile captured/i)).toBeInTheDocument();
  });

  test('renders frame rectangles with labels for a folded fixture profile', () => {
    const root = foldSamples({
      samples: [
        { frames: ['App.render', 'List.render'], weight: 30 },
        { frames: ['App.render', 'Header.render'], weight: 10 },
      ],
    });

    render(<Flamegraph root={root} />);

    expect(screen.getByRole('heading', { name: 'Flamegraph' })).toBeInTheDocument();
    expect(screen.getByLabelText(/flamegraph frames/i)).toBeInTheDocument();
    expect(screen.getByText('App.render')).toBeInTheDocument();
    expect(screen.getByText('List.render')).toBeInTheDocument();
    expect(screen.getByText('Header.render')).toBeInTheDocument();

    // The heaviest leaf carries its share of total time in the hover title.
    const list = screen.getByText('List.render').closest('[title]');
    expect(list).toHaveAttribute('title', expect.stringContaining('75.0%'));

    // The synthetic root frame is never drawn as a labelled rectangle.
    expect(screen.queryByText('root')).not.toBeInTheDocument();
  });
});
