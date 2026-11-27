import { defineRule } from "vite-plus/lint/plugins";

/** Number parsing stays under the Number namespace in new code. */
export const preferNumberParsing = defineRule({
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: { description: "Use Number.parseInt and Number.parseFloat instead of globals." },
    schema: [],
    messages: {
      numberParsing: "Use `Number.parse{{method}}()` instead of the global parse{{method}}().",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== "Identifier") return;
        const method =
          node.callee.name === "parseInt"
            ? "Int"
            : (node.callee.name === "parseFloat"
              ? "Float"
              : undefined);
        if (!method) return;
        context.report({
          node: node.callee,
          messageId: "numberParsing",
          data: { method },
          fix: (fixer) => fixer.replaceText(node.callee, `Number.parse${method}`),
        });
      },
    };
  },
});
