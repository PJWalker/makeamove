# Make a Move — TODO

What's left before Make a Move is a complete, publishable virtual tabletop. Checked against the code on 2026-11-09. Ordered by priority within each section.

## Stage 1 — One context per campaign

Removes hidden global state so that everything later can be scoped and disposed.

- [x] Create `CampaignContext`: the `Campaign` plus its services, provided through React context and passed explicitly to non-React code.
- [x] Move each per-campaign module store onto it, one file at a time: `workspace/canvasState.ts`, `workspace/linkNavigation.ts`, `workspace/linkState.ts`, `workspace/libraryView.ts`, `features/chat/notify.ts`, `scene/tools.ts` (`activeTool`), and `setBlobFetcher`.
- [x] Give the context a `dispose()` that tears down observers, persistence and connections; test opening and closing two campaigns in one page.
- [x] Add a device-local Yjs document (persisted to IndexedDB, never synced) for UI state: panel layout, entity windows, tool settings, recent actions. Move `panelLayout.ts`, `entityWindows.tsx`, `commands/recent.ts` and the pen and shape settings onto it, replacing their `localStorage` code.
- [x] Add `useQuery(ref, select)` over `useSyncExternalStore` for both shared and local documents, then retire `useY` and most `useValue` callers. Keep `lib/store.ts` only for ephemeral, non-persisted state.

## Stage 2 — Typed data layer

- [x] Write `data/schema.ts`: `record`, `collection`, `text`, `list`, `counter` and `lww` field builders that produce typed readers and writers over Y.Map/Y.Array/Y.XmlFragment.
- [x] Declare the campaign root from the layout comment in `campaign/campaign.ts`, then convert one collection at a time, smallest first: `homebrew`, `entityGraphics`, `combat` and `combatants`, folders, `members`, `notes`, `scenes`, then `characters`.
- [x] Declare scene elements the same way and convert `scene/sceneDoc.ts`.
- [x] Characters: move system-owned sub-maps (`data`, `scores`, `resources`, `modifiers`, `fields`) under a per-extension namespace (`ext[systemId]`) with typed access through the system's schema. Bump `DATA_EPOCH`.
- [x] Add a per-extension `schemaVersion` and a migration hook to the schema layer. Leave it unused (keep resetting with `DATA_EPOCH`) until release, then turn it on.
- [x] Fold `core/` and `src/graphics.ts` into `data/` and the modules that own them.
- [x] Lint rule: no `Y.Map<unknown>` or `.get("…")` on Yjs types outside `data/`.

## Stage 3 — Commands for every change

- [ ] Write `kernel/commands.ts`: `{ id, params, available(ctx), permission, run, undoGroup }`, with one `execute` path that checks permission, wraps a transaction and tags the undo origin.
- [ ] Generalise `workspace/commands` (the action index) into views over the command registry: the palette and hotbar list commands, and the `Action` type becomes a command plus presentation.
- [ ] Rebuild `ui/ContextMenu` callers to list commands for the target object, so menus show every action by construction. Do it per object: tokens, characters, notes, scenes, chat messages, roll cards.
- [ ] Route keyboard shortcuts, toolbar buttons and chat slash commands (`features/chat/commands.ts`) through the registry.
- [ ] Move feature write functions (`features/*/api.ts`) behind commands; UI code stops calling them directly.
- [ ] Centralise role checks in command `permission` and delete the scattered `isGm()` guards in components.

## Stage 4 — Extension API and open registries

- [ ] Write `api/`: `defineExtension({ id, version, requires, schema, activate(ctx) })`, activation per campaign on the `CampaignContext`, and registries typed through declaration merging.
- [ ] Open the closed unions one registry at a time, each with core's existing entries registered through it:
  - [ ] Panels (`PANELS`, `table/panels.tsx`).
  - [ ] Chat message kinds and roll cards (`features/chat/types.ts`, `table/ChatMessage.tsx`).
  - [ ] Effect types (`systems/effectTypes.ts`).
  - [ ] Settings sections (campaign and scene settings).
  - [ ] Dice syntax (`features/dice/notation.ts`).
- [ ] Systems register with their extension, replacing the id map in `systems/extensions.ts` and the silent Dungeon World fallback in `systems/index.ts` ("No system" plus a notice for unknown ids).
- [ ] Turn core features into extensions, smallest first: combat, dice, homebrew and library, notes, chat, characters. Each owns its schema, commands, panels and chat cards.
- [ ] Merge `table/` and `workspace/` into `shell/` (layout, windows, popups, palette) plus one folder per extension.

## Stage 5 — Scene engine (can run alongside Stage 6)

- [ ] Split `SceneController` into services: input router, tool host, selection, camera, previews, targeting and area placement.
- [ ] Tool registry: `{ id, icon, shortcut, options, gesture }` with gestures as small state machines. Retire `ToolId` and `Gesture.kind`; `Toolbar.tsx` lists registered tools.
- [ ] Element-type registry: schema, Pixi view (`create`/`update(diff)`/`destroy`), hit test, handles, inspector, commands. Move each type out of `render/elementViews.ts` and `render/elements.ts` into its own module; retire the `SceneElement` union.
- [ ] Render-pass registry for grid, layers, lighting and vision, effects, presence and overlays (`scene/renderer.ts`).
- [ ] Declarative change animations: an element type lists which field changes animate; one animator plays them and handles reduced motion. Port `barChange.ts`, `barBreak.ts`, `downed.ts` and `render/conditions.ts` to it.
- [ ] Overlay slots for React UI on the canvas (selection bar, token popups, text entry), so `SceneCanvas.tsx` only mounts the engine and slots.
- [ ] Token marks and stats come from extensions (combat's turn marker, the system's bars) through registries rather than `tokenMarks.ts` and `systems/tokenStats.ts`.

## Stage 6 — Rules engine (can run alongside Stage 5)

- [ ] Action pipeline: registered step types (`check`, `save`, `target`, `area`, `spend`, `pick`) replacing the `ActionStep` union and the flow in `features/characters/moveFlow.ts` and `resolution.ts`.
- [ ] Derivation graph: memoised per character, built from an ordered modifier stack with registered effect operations, replacing each system's `derive`.
- [ ] Registries for stats, resources, conditions, tags, items, sheet sections and creation steps; `GameSystem` shrinks to an id, a name and its registrations.
- [ ] Extract shared kits as extensions: `kit.pbta` (Dungeon World, Dungeon World 2), `kit.d20` (D&D 5.5e), `kit.fitd` (Blades in the Dark).
- [ ] Move system-specific fields out of core types into their systems: `artifact`, `wealthCost`, `relationshipDepth`, `damageArmor`, `loadouts`, `concentrationSave`, `afterMove` and the rest.
- [ ] Port systems one at a time onto kits, splitting each `index.ts` into stats, actions, derivation and catalogue as `dungeon-world-2/` started: Dungeon World 2, Dungeon World, Blades, D&D 5.5e.
- [ ] Ship rules text and catalogues as validated JSON content packs loaded at runtime, extending `scripts/generateRules.ts`.
- [ ] Unify library, homebrew and monsters as compendium entries with a source.

## Stage 7 — UI shell

- [ ] One surface API, `ui.open(surface, { origin })`, for dialogs, pop-ups, windows and menus, applying the morph and view-transition rules (`ui/morph.ts`, `ui/popup.ts`, `ui/transition.ts`) in one place. Migrate callers, then make the lower-level helpers private.
- [ ] Rich-text node types contributed by extensions (mentions, roll buttons, entity links) in `workspace/richText.tsx`.
- [ ] Declarative sheet layouts built only from shared parts (`workspace/DeclarativeSheet.tsx`, `sheetParts.tsx`), with system React sheets as an escape hatch.
- [ ] Gather shared controls into the design-system folder with a story each; lint against importing React Aria directly from feature code.

## Stage 8 — Sync and availability (pure peer-to-peer; independent of Stages 1–7)

- [ ] Background replication of every subdocument (scenes, notes, chat chunks) to every member device, with what's open first. The vault stays on GM devices only.
- [ ] Last-seen times per member in the campaign data; the joining screen names who holds the campaign and when they were last online.
- [ ] Host mode for the installed PWA: stay connected and keep the screen awake, so a spare device serves the campaign.
- [ ] Blob reference counting and a sweep of unreferenced blobs, including on campaign deletion.

## Stage 9 — Trust

- [ ] Split documents by who may write them: GM-authored (scene setup, membership, vault) and player-writable.
- [ ] Sign updates to GM-authored documents with a GM key; peers drop unsigned or wrongly signed updates.
- [ ] More than one GM: promote a member by sharing the signing key and vault key.
- [ ] Room key rotation on removal: a new room epoch, with the new key handed to remaining members.

## Packages and third-party extensions

- [ ] Split into workspace packages (`kernel`, `data`, `sync`, `ui`, `scene`, `rules`, `api`, `extensions/*`, `apps/web`); extensions import only `@mam/api`.
- [ ] Conformance suite every extension runs: schema round-trip, commands available and permitted, migrations.
- [ ] Load third-party extensions from a URL or file, as trusted ES modules.

## 2. Core table features

- [ ] GM-editable visibility and lock flags on notes, tokens, maps and characters (scene elements have `locked`; nothing else does, and nothing has visibility).
- [ ] Reroll entry in the roll card context menu (reroll exists as a card control in `RollCards.tsx`, not in the menu).
- [ ] GM "pull everyone to this scene" control.
- [ ] Monsters and areas of effect (M5 step 6) — finish and polish. Library monster entries, unlinked tokens and `tokensCovered` for shapes exist; check stat blocks in Libraries, all template shapes (cone, line, cube, sphere, cylinder) and the covered-token list end to end.
- [ ] Drag items between characters; item tokens on the canvas.
- [ ] Pin a note page to a scene location.
- [ ] Export a session's chat log into its note page.
- [ ] Homebrew and monsters as Library sources.
- [ ] Orphaned blob sweep when a campaign is deleted from a device.

## 3. Plugin platform

- [ ] Plugin data migrations keyed by each plugin's schema version (needed once `DATA_EPOCH` resets stop being acceptable).
- [ ] Load third-party systems from a URL or file.
- [ ] Plugin-provided dice syntax and slash commands.
- [ ] The `script` effect type.
- [ ] Unknown system ids: fall back to "No system" with a notice instead of silently using Dungeon World (`getSystem` in `systems/index.ts`); register extensions alongside their systems instead of the id map in `systems/extensions.ts`.

## 5. Decisions to settle (M5 open questions)

- [ ] Automation: attacks and saves resolve against targets automatically, GM applies damage and conditions from the card? Default: yes.
- [ ] Movement: track movement per turn and opportunity attacks? Default: leave to the table.
- [ ] Multiclassing in the first version? Default: later.

## 7. Game systems

- [ ] **Dungeon World:** complete starting and advanced class moves, level-up move selection, spell preparation; Fronts, Dangers and Steadings as note templates; "choose N" move options as checkboxes.
- [ ] **Dungeon World 2:** automate remaining class/Path passives, Struggles, class-change reassignment, magic item and Artifact selection.
- [ ] **Blades in the Dark:** named crew and playbook catalogs beyond the SRD toolkit, structured claims/factions/cohorts, creation dot constraints, score and downtime bookkeeping.
- [ ] **D&D 5.5e:** multiclass progression, feature and condition automation, monster actions, legendary and recharge workflows, remaining spell-specific behaviour.
- [ ] **Triangle Agency** (new): Agency/Anomaly character model, d4 resolution, campaign rules.
- [ ] **PF2e** (evaluate): rules coverage, actions, proficiency and conditions.

## 6. Code health

Architecture work is staged in `TRANSITION.md`.

- [ ] Move `table/diceRenderer.ts` and `table/diePhysics.ts` into their own dice module.
