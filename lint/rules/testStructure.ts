import { defineRule } from "vite-plus/lint/plugins";
import type { ESTree } from "vite-plus/lint/plugins";
import { projectPath } from "../strings.ts";

const TEST_MODULE = "vite-plus/test";

/** Tests stay top-level or inside describe scopes, and fixtures do not fake types through unknown. */
const testStructure = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Keep test suites structurally valid and fixtures type-safe." },
    schema: [],
    messages: {
      placement: "{{name}}() belongs at test-file scope or inside a describe() suite.",
      unsafeCast: "Do not use `as unknown as`; build a typed fixture or narrow the value.",
    },
  },
  create(context) {
    const path = projectPath(context.physicalFilename, context.cwd);
    if (!/\.(?:test|spec)\.(?:[cm]?jsx?|tsx?)$/.test(path)) return {};

    const suites = new Set<string>();
    const tests = new Set<string>();

    return {
      ImportDeclaration(node) {
        if (node.source.value !== TEST_MODULE) return;
        for (const specifier of node.specifiers) {
          if (specifier.type !== "ImportSpecifier") continue;
          if (specifier.imported.type !== "Identifier") continue;
          const importedName = specifier.imported.name;
          if (importedName === "describe") suites.add(specifier.local.name);
          if (importedName === "it" || importedName === "test") {
            tests.add(specifier.local.name);
          }
        }
      },
      CallExpression(node) {
        if (node.callee.type !== "Identifier") return;
        const { name } = node.callee;
        const isSuite = suites.has(name) || name === "describe";
        const isTest = tests.has(name) || name === "it" || name === "test";
        if (!isSuite && !isTest) return;

        let parent: ESTree.Node | null = node.parent;
        while (parent) {
          if (
            parent.type === "CallExpression" &&
            parent.callee.type === "Identifier" &&
            (tests.has(parent.callee.name) ||
              parent.callee.name === "it" ||
              parent.callee.name === "test")
          ) {
            context.report({ node, messageId: "placement", data: { name } });
            break;
          }
          parent = parent.parent;
        }
      },
      TSAsExpression(node) {
        if (
          node.expression.type === "TSAsExpression" &&
          node.expression.typeAnnotation.type === "TSUnknownKeyword"
        ) {
          context.report({ node, messageId: "unsafeCast" });
        }
      },
    };
  },
});

export default testStructure;
