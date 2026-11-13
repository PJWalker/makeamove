// @ts-check
import { ESLintUtils } from "@typescript-eslint/utils";

/*
 * Only src/data/ touches Yjs types directly (design.md#documents). Everywhere
 * else reads and writes through the typed handles that data/schema.ts makes.
 *
 * Flags, outside src/data/:
 * - `Y.Map<unknown>` in a type: an undeclared map, read by guessing.
 * - `.get(…)` on a Yjs type: a read that bypasses the schema's checks.
 */

/**
 * Whether a type, or any member of a union, is declared in the yjs package.
 * @param {import("typescript").Type} type
 * @returns {boolean}
 */
function isYjs(type) {
  if (type.isUnion()) return type.types.some(isYjs);
  const symbol = type.getSymbol() ?? type.aliasSymbol;
  return !!symbol?.declarations?.some((d) => /[\\/]yjs[\\/]/.test(d.getSourceFile().fileName));
}

export const noRawYjs = ESLintUtils.RuleCreator.withoutDocs({
  meta: {
    type: "problem",
    schema: [],
    messages: {
      unknownMap: "Declare the map's shape in src/data/ instead of using Y.Map<unknown>.",
      rawGet: "Read Yjs types through their typed handle from src/data/, not with .get().",
    },
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    return {
      TSTypeReference(node) {
        const name = node.typeName;
        const args = node.typeArguments?.params ?? [];
        if (
          name.type === "TSQualifiedName" &&
          name.left.type === "Identifier" &&
          name.left.name === "Y" &&
          name.right.name === "Map" &&
          args.length === 1 &&
          args[0]?.type === "TSUnknownKeyword"
        )
          context.report({ node, messageId: "unknownMap" });
      },
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== "MemberExpression" ||
          callee.computed ||
          callee.property.type !== "Identifier" ||
          callee.property.name !== "get"
        )
          return;
        if (isYjs(services.getTypeAtLocation(callee.object)))
          context.report({ node, messageId: "rawGet" });
      },
    };
  },
});

export default { rules: { "no-raw-yjs": noRawYjs } };
