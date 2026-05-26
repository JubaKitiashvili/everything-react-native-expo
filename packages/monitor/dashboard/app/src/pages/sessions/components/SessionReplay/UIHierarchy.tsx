import { Pill } from '@/shared/ui/Pill/Pill';
import {
  countMaskedNodes,
  countNodes,
  flattenHierarchy,
  type HierarchyNode,
} from './hierarchy';
import styles from './UIHierarchy.module.css';

export interface UIHierarchyProps {
  /** Captured view tree for the currently-selected frame, or undefined. */
  hierarchy?: HierarchyNode;
}

/**
 * Read-only rendering of the UI view hierarchy the SDK captured for the
 * selected replay frame. Indented by tree depth; masked nodes carry a "masked"
 * indicator and render their redacted text. Distinct from the ReplayMasker
 * panel — there are no editable rules here, just the captured snapshot.
 */
export function UIHierarchy({ hierarchy }: UIHierarchyProps) {
  if (!hierarchy) {
    return (
      <div className={styles.wrapper}>
        <header className={styles.head}>
          <h3 className={styles.title}>UI hierarchy</h3>
        </header>
        <p className={styles.empty}>No UI hierarchy captured for this frame.</p>
      </div>
    );
  }

  const rows = flattenHierarchy(hierarchy);
  const total = countNodes(hierarchy);
  const masked = countMaskedNodes(hierarchy);

  return (
    <div className={styles.wrapper}>
      <header className={styles.head}>
        <h3 className={styles.title}>UI hierarchy</h3>
        <span className={styles.summary}>
          {total} node{total === 1 ? '' : 's'}
          {masked > 0 ? ` · ${masked} masked` : ''}
        </span>
      </header>
      <ul className={styles.tree} aria-label="Captured UI hierarchy">
        {rows.map(({ node, depth }) => (
          <li
            key={node.id}
            className={[styles.node, node.masked ? styles.nodeMasked : null]
              .filter(Boolean)
              .join(' ')}
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
            data-node-id={node.id}
            data-masked={node.masked ? 'true' : 'false'}
          >
            <span className={styles.kind}>[{node.kind}]</span>
            {node.role ? <span className={styles.role}>{node.role}</span> : null}
            {node.text ? (
              <span className={styles.text}>{node.masked ? '•••••••••' : node.text}</span>
            ) : null}
            {node.masked ? (
              <Pill size="sm" severity="critical">
                masked
              </Pill>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
