import { defineRule } from "vite-plus/lint/plugins";
import { childrenText, propertiesOf, writtenIn  } from "../strings.ts";
import type {Written} from "../strings.ts";
import { HOLE, titleCase } from "../titleCase.ts";

interface Options {
  /** Components, and which of their props (or "children") hold button, menu or dialog text. */
  jsx?: Record<string, string[]>;
  /** Object literals with every property in `with`: the properties in `check` hold such text. */
  objects?: { with: string[]; check: string[] }[];
}

/**
 * Button, menu and dialog text is in macOS Title Case. Only the places named
 * in the options are checked: field labels, hints, tooltips and body text
 * keep their own case.
 */
const titleCaseRule = defineRule({
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: { description: "Write button, menu and dialog text in macOS Title Case." },
    schema: [
      {
        type: "object",
        properties: {
          jsx: {
            type: "object",
            additionalProperties: { type: "array", items: { type: "string" } },
          },
          objects: {
            type: "array",
            items: {
              type: "object",
              properties: {
                with: { type: "array", items: { type: "string" } },
                check: { type: "array", items: { type: "string" } },
              },
              required: ["with", "check"],
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      titleCase: 'Write "{{text}}" in Title Case: "{{fixed}}".',
    },
  },
  create(context) {
    const options = (context.options[0] ?? {}) as Options;
    const jsx = new Map(
      Object.entries(options.jsx ?? {}).map(([tag, properties]) => [tag, new Set(properties)]),
    );
    const objects = options.objects ?? [];
    const source = context.sourceCode;

    function check(written: Written[]) {
      for (const w of written) {
        const fixed = titleCase(w.text);
        if (fixed === w.text) continue;
        context.report({
          node: w.node,
          messageId: "titleCase",
          data: { text: w.text.replaceAll(HOLE, "…"), fixed: fixed.replaceAll(HOLE, "…") },
          fix: (fixer) => w.rewrite(fixer, fixed),
        });
      }
    }

    return {
      JSXElement(node) {
        const {name} = node.openingElement;
        if (name.type !== "JSXIdentifier") return;
        const properties = jsx.get(name.name);
        if (!properties) return;
        for (const attribute of node.openingElement.attributes) {
          if (attribute.type !== "JSXAttribute" || attribute.name.type !== "JSXIdentifier") continue;
          if (properties.has(attribute.name.name)) check(writtenIn(attribute.value, source));
        }
        if (!properties.has("children")) return;
        check(childrenText(node, source));
        // A string in braces is a phrase of its own when it's all the text
        // there is, {used ? "Done" : "Finish Camp"}, rather than part of one,
        // Roll{as ? ` as ${as}` : ""}.
        const texts = node.children.filter((c) => c.type === "JSXText" && c.value.trim());
        if (texts.length > 0) return;
        for (const child of node.children)
          if (child.type === "JSXExpressionContainer")
            check(writtenIn(child, source).filter((w) => !/^\s/.test(w.text)));
      },
      ObjectExpression(node) {
        if (objects.length === 0) return;
        const properties = propertiesOf(node);
        for (const { with: needed, check: keys } of objects) {
          if (!needed.every((k) => properties.has(k))) continue;
          for (const key of keys) check(writtenIn(properties.get(key), source));
        }
      },
    };
  },
});

export default titleCaseRule;
