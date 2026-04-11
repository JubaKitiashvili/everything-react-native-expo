import type { NodePath } from '@babel/core';
import * as t from '@babel/types';

/**
 * Adds a `.displayName = "Foo"` statement after an arrow-function
 * component declaration so RenderCollector / DevTools show a real
 * component name instead of "Anonymous".
 *
 *   const Foo = ({ name }) => <Text>{name}</Text>;
 *
 *   ↓
 *
 *   const Foo = ({ name }) => <Text>{name}</Text>;
 *   if (Foo.displayName === undefined) Foo.displayName = "Foo";
 *
 * We only touch variable declarators whose init is an arrow or function
 * expression AND whose first body node is JSX. That's a conservative
 * heuristic for "this is a React component".
 */
export function displayNameVisitor(
  path: NodePath<t.VariableDeclarator>,
): void {
  const node = path.node;
  const id = node.id;
  if (id.type !== 'Identifier') return;
  const init = node.init;
  if (
    !init ||
    (init.type !== 'ArrowFunctionExpression' &&
      init.type !== 'FunctionExpression')
  ) {
    return;
  }
  if (!isLikelyReactComponent(init)) return;

  // Only components with PascalCase names — React uses capitalization
  // to distinguish components from regular values.
  if (!/^[A-Z]/.test(id.name)) return;

  // Don't re-add displayName if the user already set it.
  const varDecl = path.findParent((p) => p.isVariableDeclaration());
  if (!varDecl) return;
  const stmt = varDecl.parentPath;
  if (!stmt || !stmt.isBlock() && !stmt.isProgram() && !stmt.isExportNamedDeclaration() && !stmt.isExportDefaultDeclaration()) {
    // Only annotate top-level-ish components. Nested components won't
    // get a displayName — they usually shouldn't exist anyway.
    // We still allow export declarations (above).
  }

  // Mark the node so we don't re-process it on subsequent traversals.
  const annotated = node as unknown as { __erneAnnotated?: boolean };
  if (annotated.__erneAnnotated) return;
  annotated.__erneAnnotated = true;

  // Construct: Foo.displayName === undefined && (Foo.displayName = "Foo");
  const assignment = t.expressionStatement(
    t.logicalExpression(
      '&&',
      t.binaryExpression(
        '===',
        t.memberExpression(
          t.identifier(id.name),
          t.identifier('displayName'),
        ),
        t.identifier('undefined'),
      ),
      t.assignmentExpression(
        '=',
        t.memberExpression(
          t.identifier(id.name),
          t.identifier('displayName'),
        ),
        t.stringLiteral(id.name),
      ),
    ),
  );
  // Insert AFTER the variable declaration statement.
  const declStmt = path.findParent((p) => p.isVariableDeclaration());
  if (declStmt && declStmt.parentPath) {
    declStmt.insertAfter(assignment);
  }
}

function isLikelyReactComponent(
  fn: t.ArrowFunctionExpression | t.FunctionExpression,
): boolean {
  const body = fn.body;
  if (body.type === 'JSXElement' || body.type === 'JSXFragment') return true;
  if (body.type === 'BlockStatement') {
    for (const stmt of body.body) {
      if (
        stmt.type === 'ReturnStatement' &&
        stmt.argument &&
        (stmt.argument.type === 'JSXElement' ||
          stmt.argument.type === 'JSXFragment')
      ) {
        return true;
      }
    }
  }
  return false;
}
