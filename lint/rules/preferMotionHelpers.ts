import { defineRule } from "vite-plus/lint/plugins";
import { matchesAny, projectPath } from "../strings.ts";

/** Imperative UI animation goes through the shared motion helpers. */
const preferMotionHelpers = defineRule({
  meta: {
    type: "suggestion",
    docs: { description: "Use shared UI motion helpers for surface animation." },
    schema: [
      {
        type: "object",
        properties: { allow: { type: "array", items: { type: "string" } } },
        additionalProperties: false,
      },
    ],
    messages: {
      motion:
        "Animate UI surfaces with showFromOrigin/leave/openPopup/closePopup or a registered scene animator.",
    },
  },
  create(context) {
    const { allow = [] } = (context.options[0] ?? {}) as { allow?: string[] };
    const path = projectPath(context.physicalFilename, context.cwd);
    if (matchesAny(path, allow)) return {};

    return {
      CallExpression(node) {
        if (
          node.callee.type === "MemberExpression" &&
          !node.callee.computed &&
          node.callee.property.type === "Identifier" &&
          node.callee.property.name === "animate"
        ) {
          context.report({ node: node.callee, messageId: "motion" });
        }
      },
    };
  },
});

export default preferMotionHelpers;
