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
      name: "lib-never-imports-foundation-siblings",
      comment:
        "lib/ is the lowest foundation: it cannot import platform/, data/, sync/, or kernel/ back out of the foundation layers.",
      severity: "error",
      from: { path: "^src/lib/", pathNot: TESTS },
      to: { path: "^src/(platform|data|sync|kernel)/" },
    },
    {
      name: "platform-never-imports-data",
      comment:
        "platform/ provides storage and browser services. data/ may use lib/ and platform/ must not depend on typed Yjs/data schemas.",
      severity: "error",
      from: { path: "^src/platform/", pathNot: TESTS },
      to: { path: "^src/data/" },
    },
    {
      name: "leaf-layers-stay-leaves",
      comment:
        "lib/ is the foundation and imports nothing else from the app. platform/ may use only lib/.",
      severity: "error",
      from: { path: "^src/lib/", pathNot: TESTS },
      to: { path: "^src/", pathNot: "^src/lib/" },
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
        "media/ is the image blob store, shared by the scene, notes and ui/. It may use only lib/ and platform/.",
      severity: "error",
      from: { path: "^src/media/", pathNot: TESTS },
      to: { path: "^src/", pathNot: "^src/(lib|platform|media)/" },
    },
    // ── The GM shadow ──────────────────────────────────────────────────────
    {
      name: "shadow-never-writes-shared-state",
      comment:
        "The GM shadow (features/shadow) writes only to its memory in the GM vault. It reads the session through ShadowSource, and only source.ts may touch the campaign, to build that source. It never reaches sync, chat posting, commands or the workspace, so nothing it makes can reach a player.",
      severity: "error",
      from: {
        path: "^src/features/shadow/",
        pathNot: [TESTS, "^src/features/shadow/source\\.ts$"],
      },
      to: {
        path: [
          "^src/sync/",
          "^src/campaign/",
          "^src/workspace/",
          "^src/kernel/",
          "^src/features/(?!shadow/|chat/(types|content|audience)\\.ts$)",
        ],
      },
    },
    {
      name: "shadow-source-only-reads",
      comment:
        "source.ts builds the shadow's read-only view of the campaign; it may not post, sync or run commands.",
      severity: "error",
      from: { path: "^src/features/shadow/source\\.ts$" },
      to: {
        path: [
          "^src/sync/",
          "^src/workspace/",
          "^src/kernel/",
          "^src/features/chat/(send|chatLog|messageState)\\.ts$",
        ],
      },
    },

    // ── 2.0 foundations (TRANSITION.md) ────────────────────────────────────
    // data/ → kernel/ → api/ sit above lib/ and platform/ and below
    // everything else. Each may use only the layers listed for it, so the
    // folders start inside their boundaries before any code lands in them.
    {
      name: "data-only-uses-foundations",
      comment:
        "data/ is the typed schema layer over Yjs. It may use only lib/: persistence, sync and features build on it, never the reverse.",
      severity: "error",
      from: { path: "^src/data/", pathNot: TESTS },
      to: { path: "^src/", pathNot: "^src/(lib|data)/" },
    },
    {
      name: "kernel-only-uses-foundations",
      comment:
        "kernel/ holds the campaign context, the command bus and the extension registries. It may use lib/, platform/, sync/ and data/; features, systems, the scene and the UI register with it rather than being imported by it.",
      severity: "error",
      from: { path: "^src/kernel/", pathNot: TESTS },
      to: { path: "^src/", pathNot: "^src/(lib|platform|sync|data|kernel)/" },
    },
    {
      name: "api-only-uses-foundations",
      comment:
        "api/ is the public surface extensions build on. It re-exports from data/, kernel/ and the shared components in ui/, and must not expose features, systems or composition code.",
      severity: "error",
      from: { path: "^src/api/", pathNot: TESTS },
      to: { path: "^src/", pathNot: "^src/(lib|data|kernel|ui|api)/" },
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
        "ui/ holds generic components. It must not depend on table/, workspace/, features/, systems/, campaign/, the scene, or the kernel, data and api layers (api/ re-exports ui/).",
      severity: "error",
      from: { path: "^src/ui/", pathNot: TESTS },
      to: {
        path: "^src/(table|workspace|features|systems|campaign|scene|lobby|sync|app|kernel|data|api)/",
      },
    },
    {
      name: "nothing-below-imports-the-table",
      comment:
        "Features, scene, campaign, sync, systems and workspace/ are below table/ (the UI that composes them).",
      severity: "error",
      from: { path: "^src/(features|scene|campaign|sync|systems|workspace)/", pathNot: TESTS },
      to: { path: "^src/(table|lobby)/" },
    },

    // ── Libraries ──────────────────────────────────────────────────────────
    // Each engine is wrapped in one place, so the rest of the app uses the
    // house components and services rather than the library itself.
    {
      name: "react-aria-only-in-ui",
      comment:
        "React Aria is wrapped by the components in ui/ (Button, ContextMenu, Segmented…); everything else uses those.",
      severity: "error",
      from: { pathNot: ["^src/ui/", TESTS] },
      to: { path: "node_modules/react-aria(-components)?/" },
    },
    {
      name: "pixi-only-in-the-scene",
      comment:
        "PixiJS draws the scene canvas; only scene/ uses it. The UI asks the scene for what it needs.",
      severity: "error",
      from: { pathNot: ["^src/scene/", TESTS] },
      to: { path: "node_modules/pixi\\.js/" },
    },
    {
      name: "three-only-in-the-dice-and-lobby",
      comment: "three.js draws the 3D dice and the lobby cave; only table/dice/ and lobby/ use it.",
      severity: "error",
      from: { pathNot: ["^src/(table/dice|lobby)/", TESTS] },
      to: { path: "node_modules/three/" },
    },
    {
      name: "cannon-only-in-the-dice",
      comment: "cannon-es rolls the 3D dice, in table/dice/ alone (a lazily loaded chunk).",
      severity: "error",
      from: { pathNot: ["^src/table/dice/", TESTS] },
      to: { path: "node_modules/cannon-es/" },
    },
    {
      name: "the-dice-load-on-demand",
      comment:
        "The 3D dice are a lazily loaded chunk: the rest of the app imports table/dice/ by dynamic import (table/rollDieHelpers.ts loadDice), or table/dice/types.ts for its types.",
      severity: "error",
      from: { pathNot: ["^src/table/dice/", TESTS] },
      to: {
        path: "^src/table/dice/",
        pathNot: "^src/table/dice/types\\.ts$",
        dependencyTypesNot: ["dynamic-import"],
      },
    },
    {
      name: "trystero-only-in-its-transport",
      comment:
        "Trystero is one Transport (sync/trystero.ts); sync and tests use the Transport interface.",
      severity: "error",
      from: { pathNot: ["^src/sync/trystero\\.ts$", TESTS] },
      to: { path: "node_modules/trystero/" },
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
      name: "no-foundation-cycles",
      comment:
        "The foundation may contain only acyclic dependencies among lib/, platform/, and data/.",
      severity: "error",
      from: { path: "^src/(lib|platform|data)/", pathNot: TESTS },
      to: {
        circular: true,
        viaOnly: { path: "^src/(lib|platform|data)/", pathNot: TESTS },
      },
    },
    {
      name: "no-domain-cycles",
      comment:
        "Feature, scene, campaign, and system domains must not form dependency cycles with one another.",
      severity: "error",
      from: { path: "^src/(features|scene|campaign|systems)/", pathNot: TESTS },
      to: {
        circular: true,
        viaOnly: { path: "^src/(features|scene|campaign|systems)/", pathNot: TESTS },
      },
    },
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
      name: "static-import-must-resolve",
      severity: "error",
      from: {},
      comment:
        "Every static relative import must resolve to a module. Package subpath exports are outside dependency-cruiser's parser resolution.",
      to: {
        couldNotResolve: true,
        path: "^\\.",
        dependencyTypesNot: ["dynamic-import"],
      },
    },
    {
      name: "dynamic-import-must-resolve",
      severity: "error",
      from: {},
      comment:
        "Every relative dynamic import must resolve to a module, including imports added by future lazy-loaded features.",
      to: {
        couldNotResolve: true,
        path: "^\\.",
        dependencyTypes: ["dynamic-import"],
      },
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
