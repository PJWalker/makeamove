import path from "node:path";
import {
  defineRule
  
  
  
  
  
} from "vite-plus/lint/plugins";
import type {Context, ESTree, Fix, Fixer, Scope} from "vite-plus/lint/plugins";
import { isString } from "../../src/lib/guards.ts";
import { projectPath } from "../strings.ts";

const MODULE = "src/lib/guards";

function importPath(context: Context) {
  const relativePath = path.relative(
    path.dirname(context.physicalFilename),
    `${context.cwd}/${MODULE}`,
  );
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

function shadowed(context: Context, node: ESTree.Node, name: string) {
  for (let scope: Scope | null = context.sourceCode.getScope(node); scope; scope = scope.upper) {
    const variable = scope.set.get(name);
    if (variable !== undefined) return variable.defs.some((d) => d.type !== "ImportBinding");
  }
  return false;
}

function addImport(fixer: Fixer, program: ESTree.Program, name: string, from: string): Fix | undefined {
  const imports = program.body.filter(
    (s): s is ESTree.ImportDeclaration => s.type === "ImportDeclaration",
  );
  const existing = imports.find((s) => s.source.value === from && s.importKind !== "type");
  if (existing?.specifiers.some((s) => s.type === "ImportSpecifier" && s.local.name === name) === true) {
    return undefined;
  }
  const named = existing?.specifiers.filter((s) => s.type === "ImportSpecifier") ?? [];
  const last = named.at(-1);
  if (last) return fixer.insertTextAfter(last, `, ${name}`);
  const line = `import { ${name} } from "${from}";\n`;
  const after = imports.at(-1);
  return after
    ? fixer.insertTextAfter(after, `\n${line.trimEnd()}`)
    : fixer.insertTextBefore(program.body[0] ?? program, line);
}

/** Runtime primitive checks use the finite, type-safe guards in src/lib/guards.ts. */
export const preferGuardHelpers = defineRule({
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: { description: "Use shared primitive guards instead of literal typeof checks." },
    schema: [],
    messages: {
      guard: "Use `{{name}}` from src/lib/guards.ts instead of a literal typeof check.",
    },
  },
  create(context) {
    const path = projectPath(context.physicalFilename, context.cwd);
    if (path === `${MODULE}.ts`) return {};

    return {
      BinaryExpression(node) {
        const kind =
          node.left.type === "UnaryExpression" &&
          node.left.operator === "typeof" &&
          node.right.type === "Literal" &&
          isString(node.right.value)
            ? node.right.value
            : (node.right.type === "UnaryExpression" &&
                node.right.operator === "typeof" &&
                node.left.type === "Literal" &&
                isString(node.left.value)
              ? node.left.value
              : undefined);
        if (kind !== "string" && kind !== "boolean") return;

        const operand =
          node.left.type === "UnaryExpression" && node.left.operator === "typeof"
            ? node.left.argument
            : (node.right.type === "UnaryExpression" && node.right.operator === "typeof"
              ? node.right.argument
              : undefined);
        if (!operand) return;

        const name = kind === "string" ? "isString" : "isBoolean";
        if (shadowed(context, node, name)) return;
        const text = context.sourceCode.getText(operand);
        const negate = node.operator === "!==" || node.operator === "!=";
        const fixable = path.startsWith("src/");
        context.report({
          node,
          messageId: "guard",
          data: { name },
          ...(fixable && {
            fix: (fixer: Fixer) => {
              const fixes = [fixer.replaceText(node, `${negate ? `!${name}` : name}(${text})`)];
              const program = context.sourceCode.ast;
              const importFix = addImport(fixer, program, name, importPath(context));
              if (importFix) fixes.push(importFix);
              return fixes;
            },
          }),
        });
      },
    };
  },
});
