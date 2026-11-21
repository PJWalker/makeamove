import { RuleTester } from "vite-plus/lint/plugins-dev";
import { describe, it } from "vite-plus/test";
import { dialogTitleEllipsis } from "../rules/dialogTitleEllipsis.ts";
import { noNativeConfirmation } from "../rules/noNativeConfirmation.ts";
import { preferReducedMotion } from "../rules/preferReducedMotion.ts";
import { referenceReadOnly } from "../rules/referenceReadOnly.ts";
import { titleCaseRule } from "../rules/titleCase.ts";
import { useDialog } from "../rules/useDialog.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const ROOT = "/project";
const tester = new RuleTester({ cwd: ROOT, languageOptions: { sourceType: "module" } });
const at = (path: string) => `${ROOT}/${path}`;

tester.run("prefer-reduced-motion", preferReducedMotion, {
  valid: [
    {
      filename: at("src/ui/transition.ts"),
      code: 'export const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");',
    },
    { filename: at("src/ui/viewport.ts"), code: 'matchMedia("(max-width: 600px)").matches;' },
  ],
  invalid: [
    {
      name: "adds an import after the others",
      filename: at("src/table/RollDie.tsx"),
      code: 'import { a } from "./a";\nconst still = matchMedia("(prefers-reduced-motion: reduce)").matches;',
      output:
        'import { a } from "./a";\nimport { reducedMotion } from "../ui/transition";\nconst still = reducedMotion.matches;',
      errors: [{ messageId: "reducedMotion" }],
    },
    {
      name: "adds to an existing import of transition.ts",
      filename: at("src/ui/morph.ts"),
      code: 'import { until } from "./transition";\nif (window.matchMedia(`(prefers-reduced-motion: reduce)`).matches) until();',
      output:
        'import { until, reducedMotion } from "./transition";\nif (reducedMotion.matches) until();',
      errors: [{ messageId: "reducedMotion" }],
    },
    {
      name: "leaves a local of the same name for a person to sort out",
      filename: at("src/lobby/CaveBackdrop.tsx"),
      code: 'const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");',
      output: null,
      errors: [{ messageId: "reducedMotion" }],
    },
  ],
});

const titleCaseOptions = [
  {
    jsx: { Button: ["label", "children"], Dialog: ["title"] },
    objects: [
      { with: ["id", "run"], check: ["title"] },
      { with: ["onSelect"], check: ["label"] },
      { with: ["confirmLabel"], check: ["title", "confirmLabel"] },
    ],
  },
];

tester.run("title-case", titleCaseRule, {
  valid: [
    {
      filename: "a.tsx",
      options: titleCaseOptions,
      code: '<Button label="Remove from Hotbar">Go to Scene</Button>',
    },
    {
      name: "button text is one phrase, around what's interpolated",
      filename: "a.tsx",
      options: titleCaseOptions,
      code: "<Button>Roll {move} as {stat}</Button>",
    },
    {
      name: "a string in braces that carries on a phrase",
      filename: "a.tsx",
      options: titleCaseOptions,
      code: '<Button>{move}{me ? ` as ${me}` : ""}</Button>',
    },
    {
      name: "field labels, hints and tooltips keep their own case",
      filename: "a.tsx",
      options: titleCaseOptions,
      code: '<><Field label="Your colour" /><span data-tip="Drag to link it" /><Tooltip>Close window</Tooltip></>',
    },
    {
      name: "only objects with every named property",
      options: titleCaseOptions,
      code: 'const option = { id: "pc", label: "Player character" };',
    },
  ],
  invalid: [
    {
      filename: "a.tsx",
      options: titleCaseOptions,
      code: '<Button variant="icon" label="Close window" />',
      output: '<Button variant="icon" label="Close Window" />',
      errors: [{ messageId: "titleCase" }],
    },
    {
      name: "button text, and either branch of a condition",
      filename: "a.tsx",
      options: titleCaseOptions,
      code: '<Button label={open ? "Hide all" : "Show all"}>\n  <Icon /> add item\n</Button>',
      output: '<Button label={open ? "Hide All" : "Show All"}>\n  <Icon /> Add Item\n</Button>',
      errors: 3,
    },
    {
      name: "strings in braces among the children",
      filename: "a.tsx",
      options: titleCaseOptions,
      code: '<Button>{used ? "Session ended" : `Award ${n} XP`}</Button>',
      output: '<Button>{used ? "Session Ended" : `Award ${n} XP`}</Button>',
      errors: 1,
    },
    {
      name: "dialog titles, templates and all",
      filename: "a.tsx",
      options: titleCaseOptions,
      code: "<Dialog title={`Rename ${kind} in the list`} />",
      output: "<Dialog title={`Rename ${kind} in the List`} />",
      errors: [{ messageId: "titleCase" }],
    },
    {
      name: "commands, menu items and confirmations",
      options: titleCaseOptions,
      code: [
        'const c = { id: "x", title: "Delete page…", run() {} };',
        'const m = { label: "Remove from hotbar", onSelect() {} };',
        'const d = { title: "Delete character", confirmLabel: "Delete it" };',
      ].join("\n"),
      output: [
        'const c = { id: "x", title: "Delete Page…", run() {} };',
        'const m = { label: "Remove from Hotbar", onSelect() {} };',
        'const d = { title: "Delete Character", confirmLabel: "Delete It" };',
      ].join("\n"),
      errors: 4,
    },
  ],
});

tester.run("no-native-confirmation", noNativeConfirmation, {
  valid: [
    'ctx.table.confirm({ title: "Delete Page" }, run);',
    'const confirmed = appConfirm("Delete Page");',
  ],
  invalid: [
    { code: 'confirm("Delete Page");', errors: [{ messageId: "native" }] },
    { code: 'window.alert("Saved");', errors: [{ messageId: "native" }] },
    { code: 'window.prompt("Name");', errors: [{ messageId: "native" }] },
  ],
});

tester.run("dialog-title-ellipsis", dialogTitleEllipsis, {
  valid: [
    'const c = { title: "Delete Page…", confirm: () => ({}) };',
    'const c = { title: "Next Turn", run() {} };',
  ],
  invalid: [
    {
      code: 'const c = { title: "Delete Page", confirm: () => ({}) };',
      output: 'const c = { title: "Delete Page…", confirm: () => ({}) };',
      errors: [{ messageId: "ellipsis" }],
    },
    {
      code: 'const c = { title: "Delete Page...", confirm: () => ({}) };',
      output: 'const c = { title: "Delete Page…", confirm: () => ({}) };',
      errors: [{ messageId: "ellipsis" }],
    },
  ],
});

const dialogOptions = [{ allow: ["src/workspace/Dialog.tsx"] }];

tester.run("use-dialog", useDialog, {
  valid: [
    { filename: at("src/workspace/Dialog.tsx"), options: dialogOptions, code: "<dialog />" },
    { filename: at("src/table/A.tsx"), options: dialogOptions, code: '<Dialog title="A" />' },
  ],
  invalid: [
    {
      filename: at("src/table/A.tsx"),
      options: dialogOptions,
      code: "<dialog open />",
      errors: [{ messageId: "useDialog" }],
    },
  ],
});

const referenceOptions = [{ allow: ["scripts/rules/readReference.ts"] }];

tester.run("reference-read-only", referenceReadOnly, {
  valid: [
    {
      filename: at("scripts/rules/readReference.ts"),
      options: referenceOptions,
      code: 'read("reference/srd.pdf");',
    },
    { filename: at("src/a.ts"), options: referenceOptions, code: 'open("references.md");' },
  ],
  invalid: [
    {
      filename: at("scripts/generateRules.ts"),
      options: referenceOptions,
      code: 'read("reference/srd.pdf"); read(`../reference/${name}`);',
      errors: 2,
    },
  ],
});
