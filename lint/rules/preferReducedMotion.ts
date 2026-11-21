import { dirname, relative } from "node:path";
import {
  defineRule,
  type Context,
  type ESTree,
  type Fix,
  type Fixer,
  type Scope,
} from "vite-plus/lint/plugins";
import { projectPath, writtenIn } from "../strings.ts";

const MODULE = "src/ui/transition";
const NAME = "reducedMotion";

/** The import of `MODULE` from the file being linted, as it's written. */
function importPath(context: Context) {
  const path = relative(dirname(context.physicalFilename), `${context.cwd}/${MODULE}`);
  return path.startsWith(".") ? path : `./${path}`;
}

/** Adds `NAME` to the file's import from `from`, or a new import after the others. */
function addImport(fixer: Fixer, program: ESTree.Program, from: string): Fix {
  const imports = program.body.filter(
    (s): s is ESTree.ImportDeclaration => s.type === "ImportDeclaration",
  );
  const existing = imports.find((s) => s.source.value === from && s.importKind !== "type");
  const named = existing?.specifiers.filter((s) => s.type === "ImportSpecifier") ?? [];
  const last = named.at(-1);
  if (last) return fixer.insertTextAfter(last, `, ${NAME}`);
  const line = `import { ${NAME} } from "${from}";\n`;
  const after = imports.at(-1);
  return after
    ? fixer.insertTextAfter(after, `\n${line.trimEnd()}`)
    : fixer.insertTextBefore(program.body[0] ?? program, line);
}

/** Whether `name` is visible at `node` as something other than an import. */
function shadowed(context: Context, node: ESTree.Node, name: string) {
  for (let scope: Scope | null = context.sourceCode.getScope(node); scope; scope = scope.upper) {
    const variable = scope.set.get(name);
    if (variable) return variable.defs.some((d) => d.type !== "ImportBinding");
  }
  return false;
}

/**
 * Animations check the player's reduced-motion preference through
 * `reducedMotion` in src/ui/transition.ts, a live MediaQueryList, rather
 * than each asking the browser again.
 */
export const preferReducedMotion = defineRule({
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: { description: "Check reduced motion through reducedMotion from src/ui/transition.ts." },
    schema: [],
    messages: {
      reducedMotion:
        "Check the reduced-motion preference with `reducedMotion` from src/ui/transition.ts.",
    },
  },
  create(context) {
    const path = projectPath(context.physicalFilename, context.cwd);
    if (path === `${MODULE}.ts`) return {};
    const inSrc = path.startsWith("src/");
    return {
      CallExpression(node) {
        const callee = node.callee;
        const isMatchMedia =
          (callee.type === "Identifier" && callee.name === "matchMedia") ||
          (callee.type === "MemberExpression" &&
            !callee.computed &&
            callee.object.type === "Identifier" &&
            callee.object.name === "window" &&
            callee.property.type === "Identifier" &&
            callee.property.name === "matchMedia");
        if (!isMatchMedia) return;
        const query = writtenIn(node.arguments[0], context.sourceCode);
        if (!query.some((q) => q.text.includes("prefers-reduced-motion"))) return;
        const fixable = inSrc && !shadowed(context, node, NAME);
        context.report({
          node,
          messageId: "reducedMotion",
          ...(fixable && {
            fix: (fixer: Fixer) => {
              const program = context.sourceCode.ast;
              const fixes = [fixer.replaceText(node, NAME)];
              const imported = context.sourceCode.getScope(program).set.has(NAME);
              if (!imported) fixes.push(addImport(fixer, program, importPath(context)));
              return fixes;
            },
          }),
        });
      },
    };
  },
});
