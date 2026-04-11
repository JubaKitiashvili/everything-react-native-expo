import type { NodePath } from '@babel/core';
import * as t from '@babel/types';

/**
 * Annotates `<Suspense>` elements with a `data-erne-suspense-id` prop
 * that host code can wire into a custom MonitoredSuspense wrapper. We
 * do not physically swap the element for a different import — that
 * would risk breaking existing userland code — we just mark it so the
 * Babel output is a no-op signal the user can pick up in a custom
 * transform or our own future React integration.
 */
export function suspenseVisitor(path: NodePath<t.JSXElement>): void {
  const opening = path.node.openingElement;
  if (opening.name.type !== 'JSXIdentifier') return;
  if (opening.name.name !== 'Suspense') return;
  const hasMarker = opening.attributes.some((a) => {
    return (
      a.type === 'JSXAttribute' &&
      a.name.type === 'JSXIdentifier' &&
      a.name.name === 'data-erne-suspense-id'
    );
  });
  if (hasMarker) return;
  const annotated = opening as unknown as { __erneAnnotated?: boolean };
  if (annotated.__erneAnnotated) return;
  annotated.__erneAnnotated = true;
  const loc = path.node.loc;
  const id =
    loc && loc.start
      ? `susp-${loc.start.line}-${loc.start.column}`
      : `susp-${Math.random().toString(36).slice(2, 8)}`;
  opening.attributes.push(
    t.jsxAttribute(
      t.jsxIdentifier('data-erne-suspense-id'),
      t.stringLiteral(id),
    ),
  );
}
