import { definePlugin } from "vite-plus/lint/plugins";
import { dialogTitleEllipsis } from "./rules/dialogTitleEllipsis.ts";
import { preferReducedMotion } from "./rules/preferReducedMotion.ts";
import { referenceReadOnly } from "./rules/referenceReadOnly.ts";
import { titleCaseRule } from "./rules/titleCase.ts";
import { useDialog } from "./rules/useDialog.ts";

/*
 * Make a Move's own lint rules: the house patterns that oxlint's built-in
 * rules can't express. JS plugins see no types, so these work on syntax.
 */
export default definePlugin({
  meta: { name: "makeamove" },
  rules: {
    "dialog-title-ellipsis": dialogTitleEllipsis,
    "prefer-reduced-motion": preferReducedMotion,
    "reference-read-only": referenceReadOnly,
    "title-case": titleCaseRule,
    "use-dialog": useDialog,
  },
});
