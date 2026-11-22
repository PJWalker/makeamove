import { defineRule } from "vite-plus/lint/plugins";

/** `props` becomes `properties`, `Props` `Properties` and `PROPS` `PROPERTIES`. */
const spellOutProperties = (text: string) =>
  text.replaceAll(/props/gi, (match) =>
    match === match.toUpperCase() ? "PROPERTIES" : match.startsWith("P") ? "Properties" : "properties",
  );

/** Component and data APIs spell out properties instead of abbreviating it. */
export const noProps = defineRule({
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: { description: "Use `properties` in place of `props`." },
    schema: [],
    messages: {
      noProps: "Spell out `properties` instead of `props`.",
    },
  },
  create(context) {
    const source = context.sourceCode;

    const report = (node: { type: string; range: [number, number]; name?: string }) => {
      if (node.type === "ImportSpecifier" || node.type === "ImportDefaultSpecifier" || node.type === "ImportNamespaceSpecifier") return;
      if (node.type === "Identifier" || node.type === "JSXIdentifier") {
        const {name} = node;
        if (!name || !/props/i.test(name)) return;
        const replacement = spellOutProperties(name);
        if (replacement === name) return;
        context.report({
          node,
          messageId: "noProps",
          // A parameter's range runs on through its type annotation; only the name is replaced.
          fix: (fixer) => fixer.replaceTextRange([node.range[0], node.range[0] + name.length], replacement),
        });
      }
    };

    return {
      Identifier(node) {
        let parent: typeof node.parent | null = node.parent;
        while (parent) {
          if (parent.type === "ImportDeclaration") return;
          if (parent.type === "ImportSpecifier") return;
          parent = parent.parent;
        }
        report(node);
      },
      JSXIdentifier(node) {
        report(node);
      },
      "Program:exit"() {
        for (const comment of source.getAllComments()) {
          if (!/props/i.test(comment.value)) continue;
          const replacement = spellOutProperties(comment.value);
          if (replacement === comment.value) continue;
          context.report({
            node: comment,
            messageId: "noProps",
            fix: (fixer) => {
              const text = source.getText(comment);
              const prefix = text.startsWith("//") ? "//" : text.startsWith("/*") ? "/*" : "";
              const suffix = text.endsWith("*/") ? "*/" : "";
              const body = prefix
                ? text.slice(prefix.length, suffix ? -suffix.length : undefined)
                : text;
              return fixer.replaceText(comment, `${prefix}${spellOutProperties(body)}${suffix}`);
            },
          });
        }
      },
    };
  },
});
