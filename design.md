How Make a Move is built
Make a Move is a serverless virtual tabletop: each player's browser runs the app against a complete local copy of the campaign, synchronised directly with other players. This document describes the 2.0 architecture, its rationale and trade-offs. Implementation is staged as described in TRANSITION.md; once a required stage has landed, new code should follow this design. Outstanding product work is tracked in TODO.md.
Overview {#overview}
A small kernel opens a campaign as a CampaignContext and activates extensions against it. Every feature—including scenes, chat, notes, combat, dice, the library and game systems—uses the public @mam/api. Extensions declare typed records stored as Yjs documents, change them only through commands, and contribute through open registries for panels, tools, scene elements, chat cards, rules primitives and more. Devices sync peer-to-peer; any member's device can serve the campaign.
Runtime: browsers, not servers {#runtime}
The static Progressive Web App works offline after its files load. Campaign data stays on-device: IndexedDB stores campaign state and the Origin Private File System (OPFS) stores images. When players are online together, public signalling relays help their devices find one another, then the devices communicate directly over WebRTC data channels.

Invite links contain the campaign ID and room key in the URL fragment, keeping the key away from web servers. Trystero uses it as the room password; relays therefore pass only encrypted handshakes.

A member who holds the campaign must be online for others to retrieve it. Every member replicates the full campaign (see Full replicas), so any member can provide it. The joining screen shows who has a copy and when they were last online; if nobody is available, it explains why rather than waiting indefinitely. Host mode keeps an installed copy connected with its screen awake. It runs the same client code and has no special authority.
Source layout {#modules}
Workspace dependencies flow only downward; extensions may import only @mam/api. Package exports and dependency-cruiser enforce these boundaries.
Package	Responsibility
apps/web	Startup, #/c/<id> hash routing, lobby and shipped extension list.
extensions/*	All features: core characters, chat, notes, scene, combat, dice and compendium; shared kit.pbta, kit.d20, kit.fitd; systems system.dungeon-world, system.dungeon-world-2, system.blades and system.dnd55e. Each extension owns its schema, commands, components and CSS.
api	Public extension API: defineExtension, context and registry types; re-exports only approved lower-level packages.
shell	Panel layout/docking, windows, dialogs, pop-ups, menus, command palette, hotbar, toolbar and context menus. It displays registered contributions.
scene	PixiJS canvas engine: tool host and gesture state machines, selection, camera, element and render-pass registries, change animator and React overlay slots.
rules	Framework-neutral action pipeline, derivation graph and registries for stats, resources, conditions, tags, items, effects, sheet sections and creation steps.
ui	React Aria-based design system, icons, tokens, motion helpers and useQuery; every control has a Storybook story.
kernel	CampaignContext, extension lifecycle, command bus, registries, undo and permissions.
sync	Multi-document Yjs SyncSession, Transport interface and Trystero implementation, background replication, blob exchange, invites and signing.
data	Yjs schema layer: field builders, typed readers/writers, read validation, schema versions and migrations. The only package that accesses Yjs types directly.
platform	Browser services: device identity and keys, OPFS blob store, IndexedDB naming and image worker.
lib	Framework-neutral utilities: IDs, hybrid logical clock, colour maths, list/set helpers and observable values.


Extensions {#extensions}
An extension default-exports defineExtension(...):
export default defineExtension({
  id: "core.combat",
  version: "1.0.0",
  requires: ["core.characters"],
  schema: { combatants: collection(Combatant), tracker: record(Tracker) },
  activate(ctx) {
    ctx.commands.register(nextTurn);
    ctx.ui.panels.register({ id: "combat", icon: IconCombat, component: CombatPanel });
    ctx.scene.tokenMarks.register(turnMarker);
    ctx.chat.cards.register("initiative", InitiativeCard);
  },
});
Activation is per campaign: activate receives that campaign's context, and all registrations are disposed when it closes. There is no module-level state, so multiple campaigns can be open in one page.

Registries are open and keyed by string ID. Declaration merging extends their types (for example, Commands["combat.nextTurn"]), providing type safety without a closed union of every possible entry. requires determines activation order: a system requires its kit, which requires core.characters. Missing or cyclic dependencies are reported at startup and the extension is skipped.

Core features use the same API as third-party features, demonstrating that the API is sufficient for both. Third-party extensions load from a URL or file as trusted ES modules.
Contribution points {#registries}
Area	Registries	Contributions
Data and behaviour	schema, commands	Owned records/namespaces and every state-changing action.
Shell	ui.panels, ui.settings, ui.surfaces	Panels, settings, dialogs and pop-ups.
Chat and text	chat.cards, chat.slash, text.nodes	Message renderers, slash commands and Tiptap nodes such as mentions, roll buttons and entity links.
Dice	dice.syntax, dice.resolvers	Roll notation and result interpretation.
Scene	scene.tools, scene.elements, scene.passes, scene.tokenMarks, scene.overlays	Tools, element types, render passes, token marks/bars and React overlays.
Rules	rules.stats, resources, conditions, steps, effects, sheet, creation, etc.	Rules primitives (see Rules).
Content	compendium.sources	Packs of rules text, items, monsters and homebrew.


Typed records over Yjs {#documents}
All shared state lives in Yjs CRDT documents. Only data sees Yjs types: extensions declare record, collection, text, list, counter and lww fields, then use generated typed readers and writers.

The document model is:
- Campaign root: settings; member details (name, colour, role, last seen and chosen character); scene/note indexes; folders and characters; and campaign-wide extension records.
- Subdocuments: one per scene, note page and 500-message chat chunk, each in its own IndexedDB database.
- GM vault: a separate document held only by GM devices and synced in its own room, whose key is stored in the vault. It contains GM-only pages, the GM signing key and campaign ICE-server settings.
- Device document: local-only, never synced; stores UI state such as panel layout, open windows, tool settings and recent actions.
- Presence: cursors, pings, rulers, laser trails and targets use Yjs awareness and are not persisted.
Extensions own their namespaces. Shared records such as characters contain core fields (name, owner, folder) plus a namespace per extension, e.g. character.ext["system.dungeon-world-2"]. Only that extension's schema can write its namespace. Separate Yjs maps let players edit different namespaces without overwriting one another.

Validate once, on read. The data layer validates records arriving from storage or peers. Invalid records are logged once with the item and error, then omitted or shown as unavailable; stored data is untouched and the rest of the app continues. Code beyond this layer trusts the types.

Each extension has a schema version and migration hook. Before release, data is reset by bumping DATA_EPOCH and migrations remain unused; after release, extensions migrate their own namespaces.

Derive, don't store: calculated values such as maximum HP after item bonuses are computed on each device, not persisted.
Commands {#commands}
Every campaign-state change is a registered command:
const nextTurn = command({
  id: "combat.nextTurn",
  params: {},
  permission: "gm",
  available: (ctx) => ctx.combat.active() || "No combat running",
  run: (ctx) => ctx.combat.advance(),
});
execute is the only write path. It checks permission and availability, runs the command in one transaction and tags its undo origin so the change is one undo step.

All action surfaces are views over the same registry: context menus list actions for their object, the palette searches all commands, and the hotbar, shortcuts, toolbar and slash commands invoke them by ID. This prevents menus and shortcuts from diverging. Permissions live on commands, not components; components query availability and display its reason when unavailable.

Command calls are serialisable, enabling state-to-state tests, macros and script effects as command lists.
Reactivity {#reactivity}
useQuery(ref, select) is the single subscription model. It reads typed shared or device-local records through useSyncExternalStore and re-renders only when the selected value changes. Non-React code subscribes to the same refs. Ephemeral state, such as hover and drag previews, stays with its owning component or service.

For example, moving a token updates previews during the gesture; on release, one command writes the record. Observers then update the canvas, panels, local database and peers. Features do not push UI changes directly.
Scene engine {#scene}
core.scene registers built-in tools and element types; the scene engine knows them only through registries.
- Element types provide a schema, Pixi view (create, update(diff), destroy), hit test, handles, inspector, commands and animatable field changes. Maps, tokens, drawings, shapes, text, walls, lights, areas and effects are registered types.
- Tools provide an ID, icon, shortcut, options UI and gesture state machine. The toolbar lists registered tools. Gestures update previews and write once on release, making each drag one undo step and one peer update.
- Services divide controller responsibilities: input routing, tool hosting, selection, camera, previews, targeting and area placement.
- Render passes draw in order: grid, layers, lighting/vision, effects, presence and overlays. Views persist between frames and update from Yjs events.
- Animations are declared by element types for chosen field changes (e.g. bar values, conditions or turn ownership). A shared animator applies the house style and respects reduced-motion settings.
- Overlay slots mount React UI over the canvas, including selection bars, token pop-ups and text entry.
Rules {#rules}
Game systems are extensions that register rules primitives; core types do not name system-specific features.
- Actions are pipelines of registered steps such as check, save, target, area, spend and pick; systems can register new step types.
- Derived values use a memoised per-character graph built from an ordered modifier stack. Effect operations include modify, grantMove, grantTag and rollBonus; extensions can add more.
- Kits contain shared mechanics: kit.pbta serves Dungeon World and Dungeon World 2, kit.d20 serves D&D 5.5e, and kit.fitd serves Blades in the Dark. System-specific mechanics such as Dungeon World 2 bonds, struggles and wealth stay in the system.
- Content ships as JSON packs of rules text, items and monsters, generated from rulebooks by scripts/generateRules.ts, validated on load and registered as compendium sources. Library entries, homebrew and monsters are compendium entries with a source.
- Sheets are declarative layouts of shared parts; a system-specific React sheet is the escape hatch.
UI shell {#shell}
The shell owns layout, windows, dialogs, pop-ups and menus, displaying each extension's registrations. All surfaces open through ui.open(surface, { origin }), which animates them from their origin and back; surfaces with no return point fade while shrinking. Features do not animate their own surfaces.
Architectural decisions and trade-offs {#decisions}
Decision	Benefits	Costs and limits
Local-first Yjs state	Offline use; automatic merge on reconnect; no backend to operate, pay for or secure; rich collaborative types; per-user undo via Y.UndoManager origins.	Without signing, clients can write anything (see Signed authority); deleted history accumulates over long campaigns.
Typed schema layer	Compile-time data checks; one validation boundary so bad records cannot break the app; enforced extension-owned namespaces; per-extension migrations.	Adds a layer and field builders to maintain; schemas must match stored data, so readers and writers are generated from one declaration.
Everything is an extension	Features add registrations rather than core unions or ID maps; built-ins prove the public API; extensions can be tested, loaded and disposed independently.	More indirection when tracing behaviour; API changes affect every extension; trusted third-party modules have full app access and can be malicious.
Commands for every change	Menus, palette, hotbar and shortcuts stay consistent; permissions, transactions and undo are centralised; serialisable calls simplify tests and macros.	Even small writes need command definitions; commands must balance useful granularity with one-step undo.
WebRTC peer-to-peer via Trystero	No server operations; room-key encryption means relays see ciphertext; Transport is swappable and lets tests use an in-memory network.	No member online means no one can join; full-mesh traffic scales with the square of player count (suitable for six, not fifty); strict NATs need table-supplied TURN settings; public relays may change or fail.
Full replicas on every member device	No scene, note or chat chunk is stranded on one device; any member can onboard a player; search covers all notes; images follow their documents.	Storage and initial sync scale with the whole campaign on every device; each subdocument adds persistence, awareness and lifecycle complexity.
Signed authority and separate vault	GM-authored documents (scene setup, membership and vault) accept only GM-signed updates; player-writable documents remain open. Enforcement works without a server; multiple GMs share signing/vault keys; removing a player rotates the room key and creates a new room epoch for remaining members.	Key management complicates debugging when updates are rejected; modified clients can still alter their own player-writable data. The GM-only vault never reaches player devices.
React Aria, PixiJS and three.js	React Aria supplies accessible menu, picker and tab behaviour while project CSS controls appearance; React Compiler memoises components; Pixi draws the canvas and three.js the dice imperatively. This supports keyboard/screen-reader access, 120-fps scenes with hundreds of tokens without React re-renders, and lazy-loaded shell/scene/extension chunks.	Two rendering engines increase bundle size and GPU contexts.
Content-addressed blobs	Images are worker-re-encoded to WebP, stored in OPFS by SHA-256 and referenced by hash in CRDTs. Peers send missing images in 64 KB chunks; arrival hashes are checked. Reference counting and sweeping remove unused blobs, including on campaign deletion. This keeps CRDTs small, deduplicates maps across campaigns and prevents file substitution.	An image is unavailable if no online member has it.


Conventions {#conventions}
- Write through commands: UI and services never write records directly; each command is one transaction and undo step. Gestures write once, on release.
- Read through useQuery: select plain values to avoid re-renders from unrelated changes.
- Keep Yjs in data: declare schemas and use typed readers/writers. Validate at the read boundary; trust types beyond it.
- Register, don't branch: core code never names extensions or systems; add a registry entry or a new registry.
- Use fractional indices (fractional-indexing) for list ordering, avoiding conflicts during concurrent reorders.
- Use the hybrid logical clock in lib/hlc.ts when peers need a shared ordering of timestamps.
- Derive, don't store: compute effective stats, maximum HP and UI tint on read.
- Use ui.open for surfaces and declare scene animations on element types.
- Before release, bump DATA_EPOCH rather than migrate. Prefer design-improving breaking changes over compatibility work.
- Keep CSS beside components. Global design-system CSS is limited to tokens, primitives, base styles and transitions.
- Keep interface text functional: labels state what something is or does, without commentary.
- Use design-system icons, named by meaning.
Testing and tooling {#testing}
- Vite 8 builds the app and PWA service worker; content packs are separate chunks.
- TypeScript 6 runs strict checks, including noUncheckedIndexedAccess and exactOptionalPropertyTypes. npm run build runs ESLint, tsc -b and Vite.
- Vitest unit tests live beside code in __tests__ folders and use fake-indexeddb.
- Multi-peer harness runs N campaigns over the in-memory transport, executes commands and asserts convergence; it covers sync, permissions and extension behaviour.
- Extension conformance suite tests every extension's schema round-trip, malformed-record validation, command availability/permissions and migrations.
- Scene services are tested headlessly; Playwright runs real UI flows in Chromium and WebKit, with one spec per feature in tests/.
- Storybook includes every design-system control.
- knip, Prettier and dependency-cruiser check unused files/exports/dependencies, formatting and package boundaries.
- CI: ci.yml runs lint, typecheck, format, knip, unit tests and build; playwright.yml runs browser tests; audit.yml audits dependencies.
To run locally: npm install, npm run dev, then open two browser profiles and join one from the other's invite link to test sync.

## UI design
- Typography: Cabin for controls and chat; 1rem body text and compact headings; Fraunces for headings, move names and sheets, with optical sizing on and no small caps.
- Surfaces and colour: Chrome floats over the canvas as translucent dark panels tinted by scene colour. Hairline borders separators and subtle gradients. Gold is reserved for primary and selected actions.
- Layout and icons: edge-docked elements sit flush; icon strips. Prefer Game-icons, then filled Material Symbols Rounded where no game icon fits. Compile icons at build time, name them by meaning and keep them at least 22×22 px.
- Actions: context menus expose every action for their object—including actions otherwise available through row buttons, hover controls or shortcuts—and reuse the same handlers and permission rules.
- Immediate Feedback: Options apply immediately and undo reverses them; use Save/Cancel only when piecemeal application is impossible.
- Surfaces: pop-ups open from their invoking element. Menu items that open a dialog end in "…".
- Motion: use snappy 120–240 ms ease-out transitions; disable motion for reduced-motion preferences. View transitions may animate snapshots for brief state changes; anything users can interact with mid-animation must animate live with CSS.
- Resilint: broken or incompatible items are shown as broken, but don't disrupting the whole app.
- Interface text is succinct and functional—no commentary, reassurance, parentheticals or asides. System rules text is content and exempt.