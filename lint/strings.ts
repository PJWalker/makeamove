import type { ESTree, Fix, Fixer, SourceCode } from "vite-plus/lint/plugins";
import { HOLE } from "./titleCase.ts";

/** A piece of text written in the source, and how to write it back changed. */
export interface Written {
  node: ESTree.Node;
  /** The text as written (escapes and all), with HOLE for each interpolated value. */
  text: string;
  rewrite(fixer: Fixer, text: string): Fix | Fix[];
}

/**
 * The text written in an expression: a string, a template, either branch of
 * a condition, or the fallback of `??` / `||`. Anything else isn't written
 * text, so it's left out.
 */
export function writtenIn(node: ESTree.Node | null | undefined, source: SourceCode): Written[] {
  if (!node) return [];
  switch (node.type) {
    case "Literal": {
      if (typeof node.value !== "string") return [];
      const raw = source.getText(node);
      const quote = raw.charAt(0);
      return [
        {
          node,
          text: raw.slice(1, -1),
          rewrite: (fixer, text) => fixer.replaceText(node, quote + text + quote),
        },
      ];
    }
    case "TemplateLiteral": {
      const holes = node.expressions.map((e) => "${" + source.getText(e) + "}");
      return [
        {
          node,
          text: node.quasis.map((q) => q.value.raw).join(HOLE),
          rewrite: (fixer, text) =>
            fixer.replaceText(
              node,
              "`" +
                text.split(HOLE).reduce((out, part, index) => out + (holes[index - 1] ?? "") + part) +
                "`",
            ),
        },
      ];
    }
    case "JSXText": {
      const raw = source.getText(node);
      return raw.trim()
        ? [{ node, text: raw, rewrite: (fixer, text) => fixer.replaceText(node, text) }]
        : [];
    }
    case "JSXExpressionContainer": {
      return node.expression.type === "JSXEmptyExpression"
        ? []
        : writtenIn(node.expression, source);
    }
    case "ConditionalExpression": {
      return [...writtenIn(node.consequent, source), ...writtenIn(node.alternate, source)];
    }
    case "LogicalExpression": {
      return node.operator === "&&"
        ? writtenIn(node.right, source)
        : [...writtenIn(node.left, source), ...writtenIn(node.right, source)];
    }
    default: {
      return [];
    }
  }
}

/**
 * An element's children as one phrase: its text, with HOLE for each child
 * that isn't text, so words are judged by where they fall in the whole
 * ("Roll {move} as {stat}").
 */
export function childrenText(element: ESTree.JSXElement, source: SourceCode): Written[] {
  /** The text before each hole, and after the last. */
  const runs: (ESTree.JSXText | null)[] = [null];
  let text = "";
  for (const child of element.children) {
    if (child.type === "JSXText") {
      runs[runs.length - 1] = child;
      text += source.getText(child);
    } else {
      runs.push(null);
      text += HOLE;
    }
  }
  if (!text.replaceAll(HOLE, "").trim()) return [];
  const node = runs.find((r) => r !== null) ?? element;
  return [
    {
      node,
      text,
      rewrite: (fixer, fixed) => {
        const pieces = fixed.split(HOLE);
        return runs.flatMap((run, index) =>
          run && pieces[index] !== source.getText(run) ? [fixer.replaceText(run, pieces[index] ?? "")] : [],
        );
      },
    },
  ];
}

/** The name of a property, if it's written plainly (not computed). */
export function propertyName(p: ESTree.ObjectPropertyKind): string | undefined {
  if (p.type !== "Property" || p.computed) return undefined;
  if (p.key.type === "Identifier") return p.key.name;
  if (p.key.type === "Literal" && typeof p.key.value === "string") return p.key.value;
  return undefined;
}

/** An object literal's plainly named properties, by name. */
export function propertiesOf(node: ESTree.ObjectExpression) {
  const out = new Map<string, ESTree.Node>();
  for (const p of node.properties) {
    const name = propertyName(p);
    if (name !== undefined && p.type === "Property") out.set(name, p.value);
  }
  return out;
}

/** The file's path from the project root, with forward slashes. */
export function projectPath(filename: string, cwd: string) {
  const path = filename.replaceAll("\\", "/");
  const root = cwd.replaceAll("\\", "/").replace(/\/?$/, "/");
  return path.startsWith(root) ? path.slice(root.length) : path;
}

/** Whether a project path matches one of `paths`: a file, or a folder ending in "/". */
export const matchesAny = (path: string, paths: readonly string[]) =>
  paths.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p));
