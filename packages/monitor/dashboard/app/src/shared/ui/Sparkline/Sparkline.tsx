import { colors } from '../../../tokens';
import { buildSparklinePath } from './buildSparklinePath';

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
  ariaLabel?: string;
}

export function Sparkline({
  data,
  width = 80,
  height = 24,
  color = colors.brand.mint,
  strokeWidth = 1.5,
  fill,
  ariaLabel = 'Trend sparkline',
}: SparklineProps) {
  const { stroke, area } = buildSparklinePath(data, width, height);
  const areaFill = fill ?? `${color}22`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      style={{ display: 'block' }}
    >
      {area ? <path d={area} fill={areaFill} stroke="none" /> : null}
      {stroke ? (
        <path
          d={stroke}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}
