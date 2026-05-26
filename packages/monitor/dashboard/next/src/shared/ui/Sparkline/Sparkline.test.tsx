import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sparkline } from './Sparkline';
import { buildSparklinePath } from './buildSparklinePath';

describe('buildSparklinePath', () => {
  test('returns empty strings for 0 or 1 data points', () => {
    expect(buildSparklinePath([], 100, 20)).toEqual({ stroke: '', area: '' });
    expect(buildSparklinePath([5], 100, 20)).toEqual({ stroke: '', area: '' });
  });

  test('produces a linear rising line with monotonic y values for a rising series', () => {
    const { stroke, area } = buildSparklinePath([0, 5, 10], 100, 20);
    expect(stroke).toBe('M 0.00 20.00 L 50.00 10.00 L 100.00 0.00');
    expect(area).toContain(stroke);
    expect(area.endsWith('Z')).toBe(true);
  });

  test('guards against a flat series (range === 0) with a horizontal line', () => {
    const { stroke } = buildSparklinePath([3, 3, 3, 3], 60, 10);
    expect(stroke).toBe('M 0.00 10.00 L 20.00 10.00 L 40.00 10.00 L 60.00 10.00');
  });
});

describe('Sparkline component', () => {
  test('renders an accessible SVG with the provided aria-label', () => {
    render(<Sparkline data={[1, 2, 3, 4]} ariaLabel="FPS trend" />);
    expect(screen.getByRole('img', { name: 'FPS trend' })).toBeInTheDocument();
  });
});
