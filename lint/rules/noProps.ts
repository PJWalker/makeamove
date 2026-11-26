import { defineRule } from "vite-plus/lint/plugins";

/** The parts of an AST node, scope and variable this rule reads. */
interface Node {
  type: string;
  name?: string;
  range: [number, number];
  parent?: Node;
  key?: Node;
  property?: Node;
  computed?: boolean;
  shorthand?: boolean;
}
interface Variable {
  defs: { type: string; name: Node; node?: Node }[];
  references: { identifier: Node }[];
}
interface Scope {
  set: Map<string, Variable>;
  upper: Scope | null;
}

/* The plugin's AST types lack some of what this rule reads, so it views nodes through `Node`. */
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
const asNode = (value: unknown) => value as Node;
const asScope = (value: unknown) => value as Scope | null;
const asReportNode = (value: Node) => value as never;
/* eslint-enable @typescript-eslint/no-unsafe-type-assertion */

/** `props` becomes `properties`, `Props` `Properties` and `PROPS` `PROPERTIES`. */
const spellOutProperties = (text: string) =>
  text.replaceAll(/props/gi, (match) => {
    if (match === match.toUpperCase()) return "PROPERTIES";
    return match.startsWith("P") ? "Properties" : "properties";
  });

const FOREIGN_PARENTS = new Set([
  "JSXAttribute",
  "MethodDefinition",
  "PropertyDefinition",
  "TSPropertySignature",
]);

/** Keys, members and attributes belong to whatever type they are read from, not to this file. */
const isForeignName = (node: Node) => {
  const { parent } = node;
  if (!parent) return false;
  if (parent.type === "MemberExpression" || parent.type === "JSXMemberExpression") {
    return parent.property === node && !parent.computed;
  }
  // A shorthand `{ props }` also spells the key, which the type it is read from decides.
  if (parent.type === "Property") {
    return Boolean(parent.shorthand) || (parent.key === node && !parent.computed);
  }
  return FOREIGN_PARENTS.has(parent.type);
};

/** Imported names, and bindings destructured under their key's name, are another type's. */
const isOwnedHere = (variable: Variable) =>
  variable.defs.every(
    (def) =>
      def.type !== "ImportBinding" &&
      !(def.name.parent?.type === "Property" && def.name.parent.shorthand),
  );

/** Other files import an exported name, and a fix here can't follow them there. */
const isExported = (variable: Variable) =>
  variable.defs.some((def) => def.node?.parent?.type.startsWith("Export")) ||
  variable.references.some((reference) => reference.identifier.parent?.type === "ExportSpecifier");

const isImportName = (node: Node) => {
  for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
    if (ancestor.type === "ImportDeclaration") return true;
  }
  return false;
};

/** Component and data APIs spell out properties instead of abbreviating it. */
const noProps = defineRule({
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: { description: "Use `properties` in place of `props`." },
    schema: [],
    messages: {
      noProps: "Spell out `properties` instead of `props`.",
    },
  },
  create(context) {
    const source = context.sourceCode;

    /** The variable `node` names, when this file declares it and may rename it. */
    const ownVariable = (node: Node) => {
      let scope = asScope(source.getScope(asReportNode(node)));
      while (scope) {
        const variable = scope.set.get(node.name ?? "");
        if (variable) return isOwnedHere(variable) ? variable : undefined;
        scope = scope.upper;
      }
      return undefined;
    };

    const report = (node: Node) => {
      const { name } = node;
      if (!name || !/props/i.test(name) || isForeignName(node)) return;
      const variable = ownVariable(node);
      if (!variable) return;
      context.report({
        node: asReportNode(node),
        messageId: "noProps",
        // A parameter's range runs on through its type annotation; only the name is replaced.
        ...(isExported(variable)
          ? {}
          : {
              fix: (fixer) =>
                fixer.replaceTextRange(
                  [node.range[0], node.range[0] + name.length],
                  spellOutProperties(name),
                ),
            }),
      });
    };

    return {
      Identifier(node) {
        const viewed = asNode(node);
        if (!isImportName(viewed)) report(viewed);
      },
      JSXIdentifier(node) {
        report(asNode(node));
      },
      "Program:exit"() {
        for (const comment of source.getAllComments()) {
          if (!/props/i.test(comment.value)) continue;
          context.report({
            node: comment,
            messageId: "noProps",
            fix: (fixer) => fixer.replaceText(comment, spellOutProperties(source.getText(comment))),
          });
        }
      },
    };
  },
});

export default noProps;
