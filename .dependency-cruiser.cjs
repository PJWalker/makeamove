/**
 * Architectural rules, enforced by `npm run deps`.
 *
 * dependency-cruiser does not support TypeScript 6 yet, so it parses with swc
 * (a dev dependency). Imports in src are relative, so no tsconfig is needed.
 */

const SYSTEM = "^src/systems/(?!__tests__/)([^/]+)/";
const TESTS = "(^|/)__tests__/|\\.test\\.tsx?$";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ── Systems ────────────────────────────────────────────────────────────
    {
      name: "system-not-imported-from-outside",
      comment:
        "A rule system is a plugin. The rest of the app reaches it only through the registry in src/systems (index.ts), never by importing a system’s own files.",
      severity: "error",
      from: { pathNot: ["^src/systems/", TESTS] },
      to: { path: SYSTEM },
    },
    {
      name: "system-not-imported-by-another-system",
      comment:
        "Systems are independent of each other. Share code through src/systems/*.ts or the app, not between systems.",
      severity: "error",
      from: { path: SYSTEM },
      to: { path: SYSTEM, pathNot: "^src/systems/$1/" },
    },

    // ── Layering ───────────────────────────────────────────────────────────
    {
      name: "leaf-layers-stay-leaves",
      comment:
        "lib/ and core/ are foundations and import nothing else from the app. platform/ may use only lib/.",
      severity: "error",
      from: { path: "^src/(lib|core)/", pathNot: TESTS },
      to: { path: "^src/", pathNot: "^src/(lib|core)/" },
    },
    {
      name: "platform-only-uses-lib",
      severity: "error",
      from: { path: "^src/platform/", pathNot: TESTS },
      to: { path: "^src/", pathNot: "^src/(lib|platform)/" },
    },
    {
      name: "media-only-uses-foundations",
      comment:
        "media/ is the image blob store, shared by the scene, notes and ui/. It may use only lib/, core/ and platform/.",
      severity: "error",
      from: { path: "^src/media/", pathNot: TESTS },
      to: { path: "^src/", pathNot: "^src/(lib|core|platform|media)/" },
    },
    {
      name: "extensions-come-from-context",
      comment:
        "The extension registry imports every system's UI, which imports workspace/. Workspace parts and features ask for extensions with useExtension (workspace/systemExtensions.ts) instead.",
      severity: "error",
      from: { path: "^src/(workspace|features)/", pathNot: TESTS },
      to: { path: "^src/systems/extensions\\.ts$" },
    },
    {
      name: "nothing-imports-the-app-shell",
      comment:
        "src/app wires everything together and src/main.tsx starts it. Nothing below imports back up into it.",
      severity: "error",
      from: { path: "^src/", pathNot: ["^src/(app|main\\.tsx)", TESTS] },
      to: { path: "^src/app/" },
    },
    {
      name: "ui-is-presentational",
      comment:
        "ui/ holds generic components. It must not depend on table/, workspace/, features/, systems/, campaign/ or the scene.",
      severity: "error",
      from: { path: "^src/ui/", pathNot: TESTS },
      to: { path: "^src/(table|workspace|features|systems|campaign|scene|lobby|sync|app)/" },
    },
    {
      name: "nothing-below-imports-the-table",
      comment:
        "Features, scene, campaign, sync, systems and workspace/ are below table/ (the UI that composes them).",
      severity: "error",
      from: { path: "^src/(features|scene|campaign|sync|systems|workspace)/", pathNot: TESTS },
      to: { path: "^src/(table|lobby)/" },
    },

    {
      name: "nothing-imports-reference",
      comment:
        "reference/ holds the source rulebooks, which are not committed. They are read by scripts/generateRules.ts to produce the JSON the app imports; no module may import from them.",
      severity: "error",
      from: {},
      to: { path: "^reference/" },
    },

    // ── Hygiene ────────────────────────────────────────────────────────────
    {
      name: "no-circular",
      severity: "error",
      from: { pathNot: TESTS },
      to: { circular: true, viaOnly: { pathNot: TESTS } },
    },
    {
      name: "no-test-code-in-production",
      severity: "error",
      from: { pathNot: TESTS },
      to: { path: TESTS },
    },
    {
      name: "not-to-dev-dependency",
      comment:
        "Production code must not import packages listed only in devDependencies. Build-time macros (*.macro.ts) run while bundling, not in the app.",
      severity: "error",
      from: { path: "^src/", pathNot: [TESTS, "\\.macro\\.ts$"] },
      to: { dependencyTypes: ["npm-dev"], pathNot: "^node_modules/(@types|unplugin-icons|vite)/" },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      comment:
        "Only relative imports are checked: package subpath exports are not resolved by this parser.",
      to: { couldNotResolve: true, path: "^\\." },
    },
    {
      name: "no-deprecated-core",
      severity: "warn",
      from: {},
      to: {
        dependencyTypes: ["core"],
        path: "^(punycode|domain|constants|sys|_linklist|_stream_wrap)$",
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "\\.(css|svg)$" },
    moduleSystems: ["es6"],
    tsPreCompilationDeps: true,
    skipAnalysisNotInRules: true,
    reporterOptions: { text: { highlightFocused: true } },
  },
};
