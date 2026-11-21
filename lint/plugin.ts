import { definePlugin } from "vite-plus/lint/plugins";
import { cssCoLocated } from "./rules/cssCoLocated.ts";
import { dialogTitleEllipsis } from "./rules/dialogTitleEllipsis.ts";
import { noNativeConfirmation } from "./rules/noNativeConfirmation.ts";
import { preferGuardHelpers } from "./rules/preferGuardHelpers.ts";
import { preferMotionHelpers } from "./rules/preferMotionHelpers.ts";
import { preferNumberParsing } from "./rules/preferNumberParsing.ts";
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
    "css-co-located": cssCoLocated,
    "dialog-title-ellipsis": dialogTitleEllipsis,
    "no-native-confirmation": noNativeConfirmation,
    "prefer-guard-helpers": preferGuardHelpers,
    "prefer-number-parsing": preferNumberParsing,
    "prefer-motion-helpers": preferMotionHelpers,
    "prefer-reduced-motion": preferReducedMotion,
    "reference-read-only": referenceReadOnly,
    "title-case": titleCaseRule,
    "use-dialog": useDialog,
  },
});
