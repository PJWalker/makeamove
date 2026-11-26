import { dirname, resolve } from "node:path";
import { defineRule } from "vite-plus/lint/plugins";
import { projectPath } from "../strings.ts";

/** Component CSS imports stay beside the component or under src/styles/. */
const cssCoLocated = defineRule({
  meta: {
    type: "suggestion",
    docs: { description: "Keep component CSS beside the component." },
    schema: [],
    messages: {
      css: "Import this stylesheet from a component-local CSS file or a global file under src/styles/.",
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (typeof node.source.value !== "string" || !node.source.value.endsWith(".css")) return;

        const importer = context.physicalFilename;
        const imported = resolve(dirname(importer), node.source.value);
        const importerDir = dirname(projectPath(importer, context.cwd));
        const importedPath = projectPath(imported, context.cwd);

        if (importerDir === dirname(importedPath) || importedPath.startsWith("src/styles/")) return;

        context.report({ node: node.source, messageId: "css" });
      },
    };
  },
});

export default cssCoLocated;
