import ts from "typescript";
import { defineRule } from "vite-plus/lint/plugins";
import type { ESTree } from "vite-plus/lint/plugins";

interface TypeScriptServices {
  program?: ts.Program;
  esTreeNodeToTSNodeMap?: Map<ESTree.Node, ts.Node>;
}

/** Static and explicitly resolved import members must exist in the imported module. */
const validImportMembers = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Reject named import members that do not exist in the module." },
    schema: [],
    messages: {
      missing: "`{{name}}` is not exported by {{source}}.",
    },
  },
  create(context) {
    const services = (context.sourceCode as unknown as { parserServices?: TypeScriptServices })
      .parserServices;
    const program = services?.program;
    const nodeMap = services?.esTreeNodeToTSNodeMap;
    if (!program || !nodeMap) return {};

    const checker = program.getTypeChecker();

    function exportedNames(moduleSpecifier: ts.Node): Set<string> | null {
      const moduleSymbol = checker.getSymbolAtLocation(moduleSpecifier);
      if (!moduleSymbol) return null;
      return new Set(checker.getExportsOfModule(moduleSymbol).map((symbol) => symbol.name));
    }

    return {
      ImportDeclaration(node) {
        if (typeof node.source.value !== "string") return;
        const tsNode = nodeMap.get(node);
        if (!tsNode || !ts.isImportDeclaration(tsNode)) return;
        const tsImport = tsNode;
        const names = exportedNames(tsImport.moduleSpecifier);
        if (!names) return;

        for (const specifier of node.specifiers) {
          if (specifier.type !== "ImportSpecifier") continue;
          const name =
            specifier.imported.type === "Identifier"
              ? specifier.imported.name
              : String(specifier.imported.value);
          if (!names.has(name)) {
            context.report({
              node: specifier,
              messageId: "missing",
              data: { name, source: node.source.value },
            });
          }
        }
      },
    };
  },
});

export default validImportMembers;
