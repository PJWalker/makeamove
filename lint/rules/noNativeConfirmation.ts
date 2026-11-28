import { defineRule } from "vite-plus/lint/plugins";

/** Browser confirmation and prompt dialogs bypass Make a Move's confirmation UI. */
const noNativeConfirmation = defineRule({
  meta: {
    type: "suggestion",
    docs: { description: "Use the app confirmation dialog instead of browser dialogs." },
    schema: [],
    messages: {
      native:
        "Use Make a Move's confirmation dialog instead of a native browser confirmation or prompt.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        let name: string | null = null;
        if (callee.type === "Identifier") name = callee.name;
        if (
          callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.object.type === "Identifier" &&
          callee.object.name === "window" &&
          callee.property.type === "Identifier"
        )
          name = callee.property.name;
        if (name !== "alert" && name !== "confirm" && name !== "prompt") return;
        context.report({ node, messageId: "native" });
      },
    };
  },
});

export default noNativeConfirmation;
