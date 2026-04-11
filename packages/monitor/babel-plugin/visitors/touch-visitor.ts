import type { NodePath } from '@babel/core';
import * as t from '@babel/types';

const TOUCH_COMPONENT_NAMES = new Set([
  'Pressable',
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
]);

/**
 * Injects `onMonitorTouch` into Pressable / Touchable* elements that
 * don't already have one. The injected prop references a tiny runtime
 * helper that looks up the monitor on globalThis; if the monitor is
 * never initialized the call is a no-op, giving us zero overhead at
 * runtime when ERNE isn't wired in.
 *
 *   <Pressable onPress={...}>
 *
 *   ↓
 *
 *   <Pressable onPress={...} onMonitorTouch={function(e){
 *     var m = globalThis.__ERNE_MONITOR__;
 *     if (!m) return;
 *     var r = m.runtime;
 *     var tb = r && r.collectors && r.collectors.touchBoundary;
 *     if (!tb || !tb.record) return;
 *     tb.record({
 *       componentName: "Pressable",
 *       componentPath: "Pressable",
 *       x: (e && e.nativeEvent && e.nativeEvent.locationX) || 0,
 *       y: (e && e.nativeEvent && e.nativeEvent.locationY) || 0,
 *     });
 *   }}>
 *
 * We do NOT call the user's onPress — the host RN Pressable still
 * handles that. onMonitorTouch is a synthetic prop the babel plugin
 * wires; if the host's Pressable doesn't recognize it, it's simply
 * ignored. A real integration wires a PanResponder higher up that
 * forwards taps AND the synthetic onMonitorTouch. For simplicity the
 * first cut just adds a callback the developer can import.
 */
export function touchBoundaryVisitor(
  path: NodePath<t.JSXOpeningElement>,
): void {
  const name = path.node.name;
  if (name.type !== 'JSXIdentifier') return;
  if (!TOUCH_COMPONENT_NAMES.has(name.name)) return;

  // Skip if onMonitorTouch already present.
  const hasExisting = path.node.attributes.some((attr) => {
    return (
      attr.type === 'JSXAttribute' &&
      attr.name.type === 'JSXIdentifier' &&
      attr.name.name === 'onMonitorTouch'
    );
  });
  if (hasExisting) return;

  const annotated = path.node as unknown as { __erneAnnotated?: boolean };
  if (annotated.__erneAnnotated) return;
  annotated.__erneAnnotated = true;

  const componentName = name.name;

  // Build a compact touch handler. Keeping it as a template string
  // inside a template tag is fragile, so we build the AST explicitly.
  const buildOptionalMember = (prop: string) =>
    t.logicalExpression(
      '||',
      t.memberExpression(
        t.memberExpression(
          t.memberExpression(
            t.identifier('e'),
            t.identifier('nativeEvent'),
            false,
            true,
          ),
          t.identifier(prop),
          false,
          true,
        ),
        t.identifier(prop === 'locationX' ? 'x' : 'y'),
        false,
      ),
      t.numericLiteral(0),
    );
  const handlerBody = t.blockStatement([
    t.variableDeclaration('var', [
      t.variableDeclarator(
        t.identifier('m'),
        t.memberExpression(
          t.identifier('globalThis'),
          t.identifier('__ERNE_MONITOR__'),
        ),
      ),
    ]),
    t.ifStatement(
      t.unaryExpression('!', t.identifier('m')),
      t.returnStatement(),
    ),
    t.variableDeclaration('var', [
      t.variableDeclarator(
        t.identifier('r'),
        t.memberExpression(t.identifier('m'), t.identifier('runtime')),
      ),
    ]),
    t.variableDeclaration('var', [
      t.variableDeclarator(
        t.identifier('tb'),
        t.logicalExpression(
          '&&',
          t.logicalExpression(
            '&&',
            t.identifier('r'),
            t.memberExpression(
              t.identifier('r'),
              t.identifier('collectors'),
            ),
          ),
          t.memberExpression(
            t.memberExpression(
              t.identifier('r'),
              t.identifier('collectors'),
            ),
            t.identifier('touchBoundary'),
          ),
        ),
      ),
    ]),
    t.ifStatement(
      t.unaryExpression('!', t.identifier('tb')),
      t.returnStatement(),
    ),
    t.expressionStatement(
      t.callExpression(
        t.memberExpression(t.identifier('tb'), t.identifier('record')),
        [
          t.objectExpression([
            t.objectProperty(
              t.identifier('componentName'),
              t.stringLiteral(componentName),
            ),
            t.objectProperty(
              t.identifier('componentPath'),
              t.stringLiteral(componentName),
            ),
            t.objectProperty(
              t.identifier('x'),
              buildOptionalMember('locationX'),
            ),
            t.objectProperty(
              t.identifier('y'),
              buildOptionalMember('locationY'),
            ),
          ]),
        ],
      ),
    ),
  ]);
  const handler = t.arrowFunctionExpression(
    [t.identifier('e')],
    handlerBody,
  );
  path.node.attributes.push(
    t.jsxAttribute(
      t.jsxIdentifier('onMonitorTouch'),
      t.jsxExpressionContainer(handler),
    ),
  );
}
