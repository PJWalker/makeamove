import { defineRule } from "vite-plus/lint/plugins";
import { matchesAny, projectPath } from "../strings.ts";

/**
 * Windows open as `<Dialog>` (src/workspace/Dialog.tsx), which gives them the
 * shared title bar, dragging, resizing, rolling up and animation. The few
 * other kinds of surface that are their own `<dialog>` are listed in `allow`.
 */
export const useDialog = defineRule({
  meta: {
    type: "suggestion",
    docs: { description: "Open windows with <Dialog> rather than a <dialog> of their own." },
    schema: [
      {
        type: "object",
        properties: { allow: { type: "array", items: { type: "string" } } },
        additionalProperties: false,
      },
    ],
    messages: {
      useDialog:
        "Open a window with <Dialog> from src/workspace/Dialog.tsx. A new kind of surface that can't be one goes in makeamove/use-dialog's allow list.",
    },
  },
  create(context) {
    const { allow = [] } = (context.options[0] ?? {}) as { allow?: string[] };
    if (matchesAny(projectPath(context.physicalFilename, context.cwd), allow)) return {};
    return {
      JSXOpeningElement(node) {
        if (node.name.type === "JSXIdentifier" && node.name.name === "dialog")
          context.report({ node, messageId: "useDialog" });
      },
    };
  },
});
