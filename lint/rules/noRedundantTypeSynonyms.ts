import { defineRule } from "vite-plus/lint/plugins";
import type { ESTree } from "vite-plus/lint/plugins";

/** A plain type alias adds no shape and should be replaced by its target. */
const noRedundantTypeSynonyms = defineRule({
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: { description: "Remove redundant type aliases." },
    schema: [],
    messages: {
      redundant: "Remove the redundant type alias `{{name}}`; use `{{target}}` directly.",
    },
  },
  create(context) {
    const source = context.sourceCode;
    const aliases: { node: ESTree.TSTypeAliasDeclaration; name: string; target: string }[] = [];

    return {
      TSTypeAliasDeclaration(node) {
        if (node.typeAnnotation.type !== "TSTypeReference") return;
        if (node.typeAnnotation.typeName.type !== "Identifier") return;

        const {name} = node.id;
        const target = node.typeAnnotation.typeName.name;
        if (name === target || target === name.replace(/Props$/, "Properties")) {
          aliases.push({ node, name, target });
        }
      },
      "Program:exit"() {
        for (const alias of aliases) {
          context.report({
            node: alias.node,
            messageId: "redundant",
            data: { name: alias.name, target: alias.target },
            fix(fixer) {
              // `type A = A` has no other name to inline, and other files import an exported alias.
              if (alias.name === alias.target || alias.node.parent.type.startsWith("Export")) return null;
              const text = source.getText();
              const start = text.lastIndexOf("\n", alias.node.range[0] - 1) + 1;
              let end = alias.node.range[1];

              while (end < text.length && text[end] !== "\n") end++;
              if (text[end] === "\n") end++;

              // The scope manager already lists every use of the alias; walking the AST
              // instead would follow `parent` links round in circles.
              const uses = source
                .getDeclaredVariables(alias.node)
                .flatMap((variable) => variable.references.map((reference) => reference.identifier));
              return [
                fixer.removeRange([start, end]),
                ...uses.map((use) => fixer.replaceText(use, alias.target)),
              ];
            },
          });
        }
      },
    };
  },
});

export default noRedundantTypeSynonyms;
