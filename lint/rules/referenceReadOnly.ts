import { defineRule } from "vite-plus/lint/plugins";
import { matchesAny, projectPath } from "../strings.ts";

const REFERENCE = /(^|[/\\])reference[/\\]/;

/**
 * reference/ holds the source rulebooks, which aren't committed. Only the
 * files in `allow` (the rules generator's reader) may name a path in it.
 */
const referenceReadOnly = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Read reference/ only through the rules generator." },
    schema: [
      {
        type: "object",
        properties: { allow: { type: "array", items: { type: "string" } } },
        additionalProperties: false,
      },
    ],
    messages: {
      reference: "reference/ is read only by scripts/rules/readReference.ts.",
    },
  },
  create(context) {
    const { allow = [] } = (context.options[0] ?? {}) as { allow?: string[] };
    if (matchesAny(projectPath(context.physicalFilename, context.cwd), allow)) return {};
    return {
      Literal(node) {
        if (typeof node.value === "string" && REFERENCE.test(node.value))
          context.report({ node, messageId: "reference" });
      },
      TemplateElement(node) {
        if (REFERENCE.test(node.value.raw)) context.report({ node, messageId: "reference" });
      },
    };
  },
});

export default referenceReadOnly;
