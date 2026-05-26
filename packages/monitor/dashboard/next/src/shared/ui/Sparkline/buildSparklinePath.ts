export interface BuildSparklinePathResult {
  stroke: string;
  area: string;
}

/**
 * Pure path builder for Sparkline. Produces both a stroke path (for the
 * top line) and an area path (closed polygon under the line). Returns
 * empty strings for empty/single-value inputs so the SVG renders nothing
 * rather than crashing.
 *
 * Extracted so the component file exports a component only — lets
 * react-refresh do hot module replacement without bailing.
 */
export function buildSparklinePath(
  data: number[],
  width: number,
  height: number,
): BuildSparklinePathResult {
  if (data.length < 2) return { stroke: '', area: '' };

  let min = Infinity;
  let max = -Infinity;
  for (const v of data) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  const step = width / (data.length - 1);

  const coords = data.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * height;
    return { x, y };
  });

  const stroke = coords
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');

  const first = coords[0]!;
  const last = coords[coords.length - 1]!;
  const area = `${stroke} L ${last.x.toFixed(2)} ${height} L ${first.x.toFixed(2)} ${height} Z`;

  return { stroke, area };
}
