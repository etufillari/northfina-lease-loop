// ESLint rule: a file marked 'use client' runs in the browser, so it must not import server
// code. It works anywhere in src/, so a client page is caught as well as a component.
// Type-only imports are fine: they are erased at build time.
import path from 'node:path';

const SERVER_ONLY = [/[\\/]src[\\/]server([\\/]|$)/, /[\\/]src[\\/]data[\\/]load$/];

function isServerOnly(source, filename) {
  if (!source.startsWith('@/') && !source.startsWith('.')) return false;
  const target = source.startsWith('@/')
    ? path.join(path.sep, 'src', source.slice(2))
    : path.resolve(path.dirname(filename), source);
  return SERVER_ONLY.some((pattern) => pattern.test(target));
}

function isTypeOnly(node) {
  return (
    node.importKind === 'type' ||
    (node.specifiers.length > 0 && node.specifiers.every((s) => s.importKind === 'type'))
  );
}

export const noServerInClient = {
  meta: {
    type: 'problem',
    docs: { description: "Disallow server imports in 'use client' files" },
    messages: {
      serverImport:
        "'{{source}}' is server code and cannot run in a 'use client' file. Fetch it from an API route, or pass it down from a Server Component.",
    },
    schema: [],
  },
  create(context) {
    const isClientFile = context.sourceCode.ast.body.some(
      (node) => node.type === 'ExpressionStatement' && node.directive === 'use client'
    );
    if (!isClientFile) return {};

    const check = (node, sourceNode) => {
      if (typeof sourceNode?.value !== 'string') return;
      if (!isServerOnly(sourceNode.value, context.filename)) return;
      context.report({ node, messageId: 'serverImport', data: { source: sourceNode.value } });
    };

    return {
      ImportDeclaration(node) {
        if (!isTypeOnly(node)) check(node, node.source);
      },
      ImportExpression(node) {
        check(node, node.source);
      },
    };
  },
};
