import { useMemo, useState, type ChangeEvent } from 'react';
import { Panel } from '@/shared/ui/Panel/Panel';
import { Pill } from '@/shared/ui/Pill/Pill';
import {
  applyMaskRules,
  DEFAULT_MASK_RULES,
  DEMO_HIERARCHY,
  type HierarchyNode,
  type MaskRule,
  type MaskVerdict,
} from './rules';
import styles from './ReplayMasker.module.css';

export interface ReplayMaskerProps {
  /** Override the sample hierarchy (tests). Defaults to `DEMO_HIERARCHY`. */
  hierarchy?: HierarchyNode | HierarchyNode[];
  /** Override the starting ruleset (tests). Defaults to `DEFAULT_MASK_RULES`. */
  initialRules?: MaskRule;
  /** Fires whenever the user edits any rule — host can persist if it wants. */
  onRulesChange?: (rules: MaskRule) => void;
}

export function ReplayMasker({
  hierarchy = DEMO_HIERARCHY,
  initialRules = DEFAULT_MASK_RULES,
  onRulesChange,
}: ReplayMaskerProps = {}) {
  const [rules, setRules] = useState<MaskRule>(initialRules);

  const update = <K extends keyof MaskRule>(key: K, value: MaskRule[K]): void => {
    const next = { ...rules, [key]: value };
    setRules(next);
    onRulesChange?.(next);
  };

  const verdicts = useMemo(() => applyMaskRules(hierarchy, rules), [hierarchy, rules]);
  const maskedIds = useMemo(() => new Map(verdicts.map((v) => [v.nodeId, v])), [verdicts]);

  return (
    <Panel
      title="Replay Masker"
      description="Configure PII masking rules; the preview shows how the SDK would redact the last frame."
    >
      <div className={styles.layout}>
        <section className={styles.rulesCell} aria-label="Masking rules editor">
          <h3 className={styles.subhead}>Rules</h3>
          <div className={styles.rules}>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={rules.secureTextEntry}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  update('secureTextEntry', e.target.checked)
                }
                aria-label="Mask fields with secureTextEntry"
              />
              <div>
                <span className={styles.toggleLabel}>secureTextEntry = true</span>
                <span className={styles.toggleHint}>
                  iOS / Android native password fields ship this flag by default.
                </span>
              </div>
            </label>

            <RegexField
              label="testID regex"
              hint="Matches components tagged with a dev-facing testID (auto-assigned in tests)."
              value={rules.testIdPattern}
              onChange={(v) => update('testIdPattern', v)}
            />
            <RegexField
              label="nativeID regex"
              hint="Matches the underlying platform view id (UIKit accessibilityIdentifier, Android view:id)."
              value={rules.nativeIdPattern}
              onChange={(v) => update('nativeIdPattern', v)}
            />
            <RegexField
              label="a11yLabel regex"
              hint="Matches the spoken accessibility label — catches text the user actually hears."
              value={rules.a11yLabelPattern}
              onChange={(v) => update('a11yLabelPattern', v)}
            />
          </div>
          <footer className={styles.rulesFooter}>
            <Pill size="sm">
              {verdicts.length} node{verdicts.length === 1 ? '' : 's'} would be masked
            </Pill>
          </footer>
        </section>

        <section className={styles.previewCell} aria-label="Live masked preview">
          <h3 className={styles.subhead}>Live preview</h3>
          <p className={styles.previewHint}>
            Demo checkout hierarchy. Green = visible, red = masked by active rules.
          </p>
          <HierarchyPreview
            roots={Array.isArray(hierarchy) ? hierarchy : [hierarchy]}
            verdicts={maskedIds}
          />
          <ul className={styles.verdictList} aria-label="Verdict explanations">
            {verdicts.map((v) => (
              <li key={v.nodeId}>
                <code className={styles.nodeId}>{v.nodeId}</code>
                <span className={styles.reasonSep}>·</span>
                {v.reasons.map((r) => (
                  <Pill key={r} size="sm" severity="critical">
                    {r}
                  </Pill>
                ))}
              </li>
            ))}
            {verdicts.length === 0 ? (
              <li className={styles.verdictEmpty}>No rules match — nothing would be masked.</li>
            ) : null}
          </ul>
        </section>
      </div>
    </Panel>
  );
}

interface RegexFieldProps {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}

function RegexField({ label, hint, value, onChange }: RegexFieldProps) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className={styles.fieldInput}
      />
      <span className={styles.fieldHint}>{hint}</span>
    </label>
  );
}

interface HierarchyPreviewProps {
  roots: HierarchyNode[];
  verdicts: Map<string, MaskVerdict>;
}

function HierarchyPreview({ roots, verdicts }: HierarchyPreviewProps) {
  return (
    <ul className={styles.tree} aria-label="Hierarchy preview">
      {roots.map((node) => (
        <NodePreview key={node.id} node={node} verdicts={verdicts} depth={0} />
      ))}
    </ul>
  );
}

interface NodePreviewProps {
  node: HierarchyNode;
  verdicts: Map<string, MaskVerdict>;
  depth: number;
}

function NodePreview({ node, verdicts, depth }: NodePreviewProps) {
  const verdict = verdicts.get(node.id);
  const masked = Boolean(verdict);
  const displayText = masked ? '•••••••••' : (node.text ?? '');

  return (
    <li
      className={[styles.node, masked ? styles.nodeMasked : null].filter(Boolean).join(' ')}
      style={{ paddingLeft: `${depth * 14}px` }}
      data-node-id={node.id}
      data-masked={masked ? 'true' : 'false'}
    >
      <div className={styles.nodeRow}>
        <span className={styles.nodeKind}>[{node.kind}]</span>
        <code className={styles.nodeId}>{node.id}</code>
        {displayText ? <span className={styles.nodeText}>{displayText}</span> : null}
        {masked ? (
          <Pill size="sm" severity="critical">
            masked
          </Pill>
        ) : null}
      </div>
      {node.children && node.children.length > 0 ? (
        <ul className={styles.childList}>
          {node.children.map((child) => (
            <NodePreview key={child.id} node={child} verdicts={verdicts} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
