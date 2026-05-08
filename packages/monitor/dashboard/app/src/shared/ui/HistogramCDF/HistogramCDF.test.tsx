// Task 117.16 — HistogramCDF component tests.

import { describe, expect, test } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HistogramCDF } from './HistogramCDF';

function generate(centre: number, halfWidth: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1 || 1);
    out.push(centre + (u - 0.5) * 2 * halfWidth);
  }
  return out;
}

describe('HistogramCDF', () => {
  test('renders an empty-state placeholder when given no samples', () => {
    render(<HistogramCDF samples={[]} />);
    expect(screen.getByText('No samples')).toBeInTheDocument();
  });

  test('renders an accessible SVG with sample counts in the aria label', () => {
    const samples = generate(10, 5, 200);
    render(<HistogramCDF samples={samples} />);
    const svg = screen.getByRole('img');
    expect(svg.getAttribute('aria-label')).toMatch(/200 samples/);
    expect(svg.getAttribute('aria-label')).toMatch(/P50/);
    expect(svg.getAttribute('aria-label')).toMatch(/P95/);
    expect(svg.getAttribute('aria-label')).toMatch(/P99/);
  });

  test('shows the Bimodal pill on a bimodal distribution', () => {
    const samples = [...generate(20, 4, 200), ...generate(80, 4, 200)];
    render(<HistogramCDF samples={samples} title="Network latency" />);
    expect(screen.getByText('Bimodal')).toBeInTheDocument();
    expect(screen.getByText('Network latency')).toBeInTheDocument();
  });

  test('omits the Bimodal pill on a unimodal distribution', () => {
    const samples = generate(50, 25, 400);
    render(<HistogramCDF samples={samples} />);
    expect(screen.queryByText('Bimodal')).not.toBeInTheDocument();
  });

  test('reveals a tooltip on bucket focus', () => {
    const samples = generate(50, 25, 400);
    render(<HistogramCDF samples={samples} />);
    const bars = screen.getAllByLabelText(/samples in/i);
    expect(bars.length).toBeGreaterThan(0);
    fireEvent.focus(bars[0]!);
    // Tooltip uses `samples` text from the matching bar's aria label
    // verbatim; the visible tooltip just shows count + range so we
    // grep for either "in [" or the bucket boundaries.
    const tooltipMatch = document.body.textContent ?? '';
    expect(tooltipMatch).toMatch(/in \[/);
  });

  test('uses the custom title when provided', () => {
    const samples = generate(10, 5, 200);
    render(<HistogramCDF samples={samples} title="Custom title" />);
    expect(screen.getByText('Custom title')).toBeInTheDocument();
  });

  test('honours the unit prop in the aria label', () => {
    const samples = generate(10, 5, 200);
    render(<HistogramCDF samples={samples} unit="µs" />);
    const svg = screen.getByRole('img');
    expect(svg.getAttribute('aria-label')).toMatch(/µs/);
  });
});
