import { cssCoLocated } from "./rules/cssCoLocated.ts";
import { dialogTitleEllipsis } from "./rules/dialogTitleEllipsis.ts";
import { noNativeConfirmation } from "./rules/noNativeConfirmation.ts";
import { preferGuardHelpers } from "./rules/prefer-guard-helpers.ts";
import { preferMotionHelpers } from "./rules/preferMotionHelpers.ts";
import { preferNumberParsing } from "./rules/preferNumberParsing.ts";
import { preferReducedMotion } from "./rules/preferReducedMotion.ts";
import { referenceReadOnly } from "./rules/referenceReadOnly.ts";
import { titleCaseRule } from "./rules/titleCase.ts";
import { testStructure } from "./rules/testStructure.ts";
import { useDialog } from "./rules/useDialog.ts";

/*
 * Make a Move's own lint rules for patterns that standard ESLint rules can't express.
 * JS plugins see no types, so these work on syntax.
 */
export default {
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
    "test-structure": testStructure,
    "use-dialog": useDialog,
  },
};
