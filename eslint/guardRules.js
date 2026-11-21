// @ts-check
import { ESLintUtils } from "@typescript-eslint/utils";

/*
 * Stored values cross one boundary: src/lib/guards.ts defines the shared
 * runtime guards. Inline primitive predicates drift from the guards' finite
 * number and plain-object semantics, and Guard<T> is a type-only import.
 */

const predicates = new Map([
  ["string", "isString"],
  ["number", "isNumber"],
  ["boolean", "isBoolean"],
]);

export const guardRules = ESLintUtils.RuleCreator.withoutDocs({
  meta: {
    type: "problem",
    fixable: "code",
    schema: [],
    messages: {
      typeOnlyGuard: "Import `Guard` as a type; it is not runtime code.",
      sharedGuard: "Use `{{name}}` from src/lib/guards.ts instead of an inline primitive guard.",
    },
  },
  defaultOptions: [],
  create(context) {
    const source = context.sourceCode;
    const filename = context.filename.replaceAll("\\", "/");

    return {
      ImportSpecifier(node) {
        if (node.imported.type !== "Identifier" || node.imported.name !== "Guard") return;
        const declaration = node.parent;
        if (
          node.importKind !== "type" &&
          declaration.type === "ImportDeclaration" &&
          declaration.importKind !== "type"
        ) {
          context.report({
            node,
            messageId: "typeOnlyGuard",
            fix(fixer) {
              if (declaration.specifiers.length === 1) {
                return fixer.insertTextAfterRange(
                  [declaration.range[0], declaration.range[0] + 6],
                  " type",
                );
              }
              const specifierText = source.getText(node);
              return fixer.replaceText(node, `type ${specifierText}`);
            },
          });
        }
      },

      TSTypePredicate(node) {
        if (filename.includes("/src/lib/guards.ts")) return;
        const annotation = node.typeAnnotation?.typeAnnotation;
        if (
          annotation?.type !== "TSStringKeyword" &&
          annotation?.type !== "TSNumberKeyword" &&
          annotation?.type !== "TSBooleanKeyword"
        )
          return;
        const kind = annotation.type.replace("TS", "").toLowerCase();
        const name = predicates.get(kind);
        if (name) {
          context.report({ node, messageId: "sharedGuard", data: { name } });
        }
      },
    };
  },
});

export default { rules: { "guard-boundaries": guardRules } };
