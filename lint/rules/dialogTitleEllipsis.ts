import { defineRule } from "vite-plus/lint/plugins";
import { propertiesOf, writtenIn } from "../strings.ts";

/**
 * A command that asks for confirmation opens a dialog before it acts, so its
 * title ends in "…", as macOS writes such buttons and menu items.
 */
export const dialogTitleEllipsis = defineRule({
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: { description: 'End the title of a command that opens a dialog with "…".' },
    schema: [],
    messages: {
      ellipsis: 'This command asks for confirmation in a dialog first, so end its title with "…".',
    },
  },
  create(context) {
    return {
      ObjectExpression(node) {
        const properties = propertiesOf(node);
        if (!properties.has("confirm")) return;
        for (const w of writtenIn(properties.get("title"), context.sourceCode)) {
          if (w.text.endsWith("…")) continue;
          context.report({
            node: w.node,
            messageId: "ellipsis",
            fix: (fixer) => w.rewrite(fixer, w.text.replace(/(\.\.\.|\.)?$/, "…")),
          });
        }
      },
    };
  },
});
