import { StackFrame } from '../../shared/ui/StackFrame/StackFrame';
import { parseStack } from './parseStack';
import styles from './StackViewer.module.css';

export interface StackViewerProps {
  /** Raw stack string from payload.stack. */
  stack: string;
  /** When true, frames outside app code are rendered with lower contrast. */
  deemphasiseExternal?: boolean;
}

export function StackViewer({ stack, deemphasiseExternal = true }: StackViewerProps) {
  const { message, frames } = parseStack(stack);
  if (!message && frames.length === 0) {
    return <p className={styles.empty}>No stack captured for this crash.</p>;
  }
  return (
    <div className={styles.viewer}>
      {message ? <p className={styles.message}>{message}</p> : null}
      <ol className={styles.frames}>
        {frames.map((frame, i) => {
          const external = deemphasiseExternal && frame.location?.startsWith('node_modules');
          return (
            <li key={`${i}-${frame.symbol}-${frame.location ?? ''}`} className={styles.frameItem}>
              <StackFrame
                symbol={frame.symbol}
                {...(frame.location ? { location: frame.location } : {})}
                resolved={frame.resolved && !external}
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
