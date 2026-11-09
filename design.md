# How Make a Move is built

Make a Move is a virtual tabletop with no game server. Every player's browser runs the whole app against its own copy of the campaign, stored locally and merged with the other players over peer-to-peer connections. This page explains the parts, why they were chosen, what those choices cost, where the code has drifted from its own rules, and what is still to be built.

## The runtime: browsers, not servers {#runtime}

The app is a static Progressive Web App. Once its files have loaded, it works offline. Game state never goes to a server. Each device keeps its campaigns in IndexedDB and its images in the Origin Private File System (OPFS). When players are online at the same time, their devices find each other through public signalling relays and then talk directly over WebRTC data channels.

The invite link carries the campaign id and a room key in the URL fragment, so the key never reaches a web server. Trystero uses the key as its room password, so relays only pass encrypted handshakes.

A consequence to keep in mind: someone must be online to share the campaign. A player who joins from an invite sees "Waiting for someone from this campaign to come online…" until a peer that already holds the campaign connects (`src/app/App.tsx`).

## Data lives in Yjs documents {#documents}

All shared state is a set of [Yjs](https://docs.yjs.dev/) CRDT documents. The campaign is split into one root document plus many subdocuments that load only when needed, so a long campaign doesn't have to sit in memory.

- **Campaign root:** settings and defaults, members (name, colour, role, chosen character, hotbars), the scene index, the note index (titles, folders, outgoing links), character folders, entity graphic overrides, and the characters.
- **Subdocuments:** one per scene, per note page and per chat chunk (500 messages), each in its own IndexedDB database.
- **GM vault:** a separate document only GM devices hold, synced over its own room whose key lives in the vault. It holds GM-only note pages.
- **Presence:** cursors, pings, rulers, laser trails and targets go over Yjs awareness and are never stored.

Core code owns the generic shape of a record (a character's name, owner and inventory). Each game system owns sub-maps it alone writes, such as `scores`, `data` and `resources`. Because these are separate Yjs maps, two players editing different fields never overwrite each other. Values that can be calculated, like maximum HP after item bonuses, are never stored; every device derives them.

## Source modules {#modules}

The code is grouped by responsibility. Imports should flow downward, toward domain contracts and infrastructure: composition code may use features, but features and rules may not reach back up into composition.

| Folder | Purpose | Files |
| --- | --- | --- |
| `app/` | Startup, hash routing (`#/c/<id>`), and the top-level `App` shell. | 2 |
| `lobby/` | The campaign list, create and join forms, and the animated icon backdrop. | 4 |
| `table/` | Composition for an open campaign: `Tabletop`, sidebars, panels, the toolbar, hotbar, palette, chat, the scene canvas and the 3D dice tray. Each component has its own CSS file. | 71 |
| `workspace/` | The parts `table/` composes and system sheets reuse: panel layout and floating windows, dialogs, entry windows, links, rich text, entity graphics and drag, the shared sheet parts, and the action index behind the command palette and hotbar (`workspace/commands`). | 52 |
| `features/` | Domain models and operations: characters, chat, notes, combat, dice notation and pools, library, homebrew. Mostly plain functions over a `Campaign` and its Yjs maps. | 41 |
| `scene/` | The canvas engine: `SceneDoc` (scene subdocument and undo), `SceneController` with a gesture module per tool (`gestures/`), `SceneRenderer` with a module per layer (`render/`), grid, geometry, measuring, vision, lighting, presence, and an image worker. | 48 |
| `systems/` | Game-system plugins. `types.ts` is the rules contract, `extensions.ts` the UI contract; each system folder exports a `GameSystem` and, where needed, a `SystemExtension` with its components. | 48 |
| `campaign/` | The `Campaign` class: root document lifecycle, members and removal, scene index and folders, plus the device-local campaign registry and the peer connection. | 6 |
| `sync/` | Networking: `SyncSession` (Yjs sync protocol over many docs), the `Transport` interface and its Trystero implementation, peer-to-peer blob exchange, and invite links. | 5 |
| `platform/` | Browser services: device identity, safe `localStorage`, OPFS blob store, database naming. | 4 |
| `ui/` | Shared presentation: buttons, lists, pickers, tooltips, icons, popups, morphing, view transitions, `useY` (React over Yjs) and `useValue` (React over stores). | 56 |
| `lib/`, `core/` | Framework-neutral utilities: ids, hybrid logical clock, colour maths, list and set helpers, observable stores, and the shared `DataValue` type. | 7 |
| `styles/` | Global CSS only: design tokens, primitives, base, transitions. | 5 |

File counts exclude tests. ESLint and dependency-cruiser enforce the direction, with no exceptions.

## How an edit travels {#flow}

Moving a token shows the pattern every feature follows: change the Yjs document, and let observers update the screen, the local database and the peers. Nothing pushes changes to the UI directly.

Two binding styles exist side by side. The **canvas** is imperative: `SceneCanvas.tsx` opens a `SceneDoc`, creates a `SceneRenderer` and a `SceneController`, and the controller observes the doc and redraws Pixi objects itself. The **panels** are React components that read Yjs through `useY(type, read)`, which re-renders only when the derived value changes. App-level state that isn't shared (the active campaign, panel layout, open windows) lives in module-level stores from `lib/store.ts`, read with `useValue`.

## Key decisions and their trade-offs {#decisions}

### Local-first state in Yjs

Every device holds the full campaign in CRDT documents and merges with peers. This is the decision everything else follows from.

#### Benefits

- Works offline; edits merge on reconnect without conflict handling code.
- No backend to run, pay for, or secure.
- Rich types (maps, arrays, XML text) give collaborative rich text and per-field merging for free.
- Undo per user via `Y.UndoManager` origins.

#### Downsides

- No authority: any client can write anything. Validation and permissions are advisory.
- Schema changes need care; the project resets data with an epoch rather than migrating.
- CRDT data is loosely typed (`Y.Map<any>`); mistakes surface at runtime, not compile time.
- Deleted history accumulates in documents over a long campaign.

### Peer-to-peer sync over WebRTC with Trystero

A thin `Transport` interface hides Trystero, so `SyncSession` runs over an in-memory network in tests.

#### Benefits

- Zero operations: public relays only introduce peers.
- End-to-end encryption by room key; relays see ciphertext.
- The transport is swappable, for example for a self-hosted relay or a WebSocket server later.

#### Downsides

- Somebody who has the data must be online for others to get it.
- Full mesh traffic grows with the square of the player count; fine for a table of six, not for fifty.
- Strict NATs can block connections, and there is no TURN fallback configured.
- Public relays can change or go down outside the project's control.

### Subdocuments for scenes, notes and chat

`SyncSession` only syncs the documents a device has loaded, so a peer receives the scenes it opens, not every scene.

#### Benefits

- Memory and bandwidth scale with what is on screen.
- Chat chunks keep a years-long log fast; HLC stamps keep message order consistent across peers.

#### Downsides

- A scene exists only on devices that have opened it, so data can be stranded on one laptop.
- More moving parts: each subdocument has its own persistence, awareness and lifecycle to clean up.
- Note search can only search the pages a device has stored. It reads an on-device Fuse index of their text (`features/notes/textIndex.ts`), kept current by whichever pages are open, so it opens no pages.

### Permissions enforced in the UI, secrets in a separate vault

Roles (GM, player, observer) hide and disable controls. GM-only notes go in a document that never reaches player devices.

#### Benefits

- Simple and honest: shared data is explicitly not secret.
- The vault gives real secrecy where it matters most, at little cost.

#### Downsides

- A modified client can edit anything and read all shared data.
- Removing a player doesn't rotate the room key, so a determined removed player can still connect.

### Game systems as declarative plugins, with a separate UI extension

A system is a `GameSystem` object: stats, actions, results, items, conditions and resources as data, plus a few pure functions such as `derive` and `actionsFor`. `defineSystem()` validates cross-references at registration and throws a readable list of problems. What a system adds to the table (React components and campaign-changing actions) is a `SystemExtension`, kept apart so importing a system's rules doesn't pull in its UI.

#### Benefits

- The core owns sheets, dice, chat, effects and targeting once; systems describe rules.
- Pure functions are easy to unit test; each system has its own suite in `systems/__tests__`.
- A declarative sheet layout is the fallback, so a new system needs no React.
- Core code asks for hooks, never for system ids.

#### Downsides

- The contracts keep growing as each system needs a new hook (`types.ts` is 761 lines; `extensions.ts` has eight hooks).
- Rules text from the reference SRDs is bundled into the app; licensing must be checked per system.

### React with React Aria and stores; PixiJS and three.js outside React

React Aria supplies accessible behaviour for menus, pickers and tabs; the project's own CSS supplies the look. Explicit stores replace signals, so every dependency is visible to React and to React Compiler. The canvas is drawn by PixiJS and the dice by three.js, both managed imperatively.

#### Benefits

- Keyboard and screen-reader behaviour without writing it by hand.
- Stores keep the observer model without a Babel transform or hidden subscriptions.
- The canvas runs at 60 fps with hundreds of tokens because React doesn't re-render it.
- Lazy loading keeps the lobby light: `Tabletop`, `SceneCanvas` (Pixi) and each panel are separate chunks.

#### Downsides

- Three reactivity systems (React state, stores, Yjs observers) to understand.
- Module-level stores are hidden global state; they make tests and multi-campaign scenarios harder.
- Two rendering engines (Pixi and three.js) add bundle weight and GPU contexts.

### Content-addressed blobs

Images are re-encoded to WebP in a worker, stored in OPFS under their SHA-256 hash, and referenced by hash in the CRDT. Missing images are fetched from peers in 64 KB chunks and the hash is checked on arrival.

#### Benefits

- CRDT documents stay small.
- The same map in two campaigns is stored once.
- A peer can't swap in a different file.

#### Downsides

- If nobody online has an image, it can't be shown.
- Blobs are never garbage-collected when no document references them.

## Conventions to follow {#conventions}

- **Order with fractional indices.** Lists store a string key from `fractional-indexing`, so two people reordering at once don't conflict.
- **Timestamps use the hybrid logical clock** in `lib/hlc.ts` wherever peers must agree on order.
- **Derive, don't store.** Effective stats, maximum HP and UI tint are computed on read.
- **Write in one transaction.** Wrap related writes in `doc.transact()` so peers and undo see one change. Drags write once, on release.
- **Read Yjs in React with `useY`** and return plain values from the read function so unrelated changes don't re-render. Read stores with `useValue`.
- **Mark origins.** Local scene edits use `SceneDoc.origin` so they can be undone; remote ones use the `REMOTE` origin.
- **Systems own their sub-maps.** Core code reads a character's `data` or `resources` only through the system's definitions.
- **Core never names a system.** Add a hook to `GameSystem` or `SystemExtension` instead of branching on a system id.
- **CSS lives beside its component.** `styles/` holds only tokens, primitives, base and transitions.
- **No migrations before release.** Bump `DATA_EPOCH` instead. The project instructions also prefer breaking changes that improve the design over compatibility work.
- **Interface text is functional.** Labels say what something is or does, with no commentary.
- **Icons come from `ui/icons.tsx`**, named by meaning.

## Testing and tooling {#testing}

- **Vite 8** builds the app and the PWA service worker. Large SRD reference files are split into their own chunks in `vite.config.ts`.
- **TypeScript 6** is strict, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. `npm run build` runs ESLint, then `tsc -b`, then Vite.
- **Vitest** unit tests sit in `__tests__` folders beside the code. They use `fake-indexeddb` and an in-memory transport, so sync logic is tested without browsers. `npm run test:coverage` adds V8 coverage.
- **Playwright** end-to-end tests run in Chromium and WebKit against the dev server, one spec per feature in `tests/`.
- **knip** finds unused files, exports and dependencies; **Prettier** checks formatting.
- **CI:** `ci.yml` (lint, typecheck, format, knip, unit tests, build), `playwright.yml` (browser suite), `audit.yml` (dependency audit).

To start: `npm install`, `npm run dev`, then open two browser profiles and join one from the other's invite link to see sync working.

## Improvement opportunities {#improvements}

Ordered by how much each one affects the codebase's coherence or the safety of players' data. Resolved items from the first review are listed at the end.

High

### No way to back up or export a campaign

With no server, a campaign's only copies are on players' devices, and scenes are only on devices that opened them. Clearing site data or losing a laptop can lose a scene for good.

**Consider:** an export that loads the root, every subdocument and the referenced blobs, writes them with `Y.encodeStateAsUpdate` into one file, and a matching import. It also helps with bug reports.

High

### Bundled source text needs a licensing review

`systems/dungeon-world-2/paths.ts` (589 lines) bundles the Dungeon World 2 beta text into the app, which needs a redistribution review before publishing. Git history still contains the `.playwright-mcp/` output, including `Dungeon-World-2-Beta-v3.docx`.

**Consider:** settle licensing for each bundled source before the first public deploy; rewrite history if the beta document must not stay in the repository.

Medium

### Old invites no longer fail clearly

The uncommitted change to `sync/invite.ts` drops the epoch from invite links. After a `DATA_EPOCH` bump, an old invite opens an empty campaign under the new database names and waits for a peer.

**Consider:** keep the epoch out, but show a clear message when no peer has the campaign.

Low

### Stray top-level modules

`core/` holds one type, and `src/graphics.ts` sits at the top level.

**Consider:** fold both into an existing module.

Medium

### Removing a player doesn't rotate the room key

The room key sits in the campaign's `meta` map, which every member holds. A removed player stays out only because their client cooperates.

**Consider:** on removal, the GM mints a new key and gives it to remaining members, for example through a short-lived message encrypted per member. This only matters if removal needs to resist a modified client.

Medium

### Remaining large files

`systems/dnd55e/data.ts` (1,640) is data and fine. `systems/dnd55e/index.ts` (1,170), `table/diceRenderer.ts` (1,089), `table/SceneCanvas.tsx` (1,057), and each system's `index.ts` (about 1,000) mix several responsibilities.

**Consider:** split system `index.ts` files into stats, actions, derive and catalog modules, as `dungeon-world-2/` has started; move dice rendering out of `table/` into its own module.

Low

### Unknown system ids fall back silently

`getSystem()` returns Dungeon World for any id it doesn't know, so a typo or a removed system shows the wrong rules without an error. `extensionOf()` keeps a hand-written id map in `systems/extensions.ts`.

**Consider:** fall back to the "No system" plugin and show a notice, or throw during development; register extensions alongside their systems.

Low

### Hidden global state

Sixteen modules export top-level stores, and `setBlobFetcher` in `media/images.ts` is a global set by `campaign/connection.ts`. This works because one campaign is open at a time, but the dependency is invisible.

**Consider:** hang per-campaign state off the `Campaign` object or a context, and keep module stores for true device-wide state.

Low



### Resolved since the first review

- Game-system rules leaking into core feature code: moved into systems behind hooks.
- Sheet registration hard-coding system ids in `table/`: replaced by `SystemExtension.sheets`.
- CI not running lint, type-check or unit tests: `ci.yml` runs them all.
- Very large controller, renderer, character API, chat panel and global CSS: split.
- Single end-to-end test file: split by feature.
- Signals Babel transform blocking React Compiler: replaced by explicit stores.
- `reference/` and `.playwright-mcp/` committed: untracked and ignored.
- `design.md` out of date: removed; this document replaces it.
- Upward imports outside the system sheets: `ContextMenu` and `resizeRect` moved to `ui/`, `CombatPanel` and the action index (`table/commands`) to `table/`, link following (`table/linkNavigation.ts`) out of `features/notes`, and chat notifications read a `chatInView` store the table keeps current. ESLint enforces the layering.
- System sheets importing `table/` parts: the sheet parts and everything they reach moved to `workspace/`, below `table/`; panel labels (`PANELS`) and the tool list (`TOOLS`) moved out of `panels.tsx` and `Toolbar.tsx` so the action index no longer pulls in every panel.

## Product rules {#product}

These govern behaviour more than code.

### UI design

- Cabin for controls and chat, 1rem body text, compact headings; Fraunces (optical sizing on, never small caps) for headings, move names and sheets.
- Neutral surfaces, thin separators and a subtle gradient. All chrome floats over the canvas as translucent dark panels tinted by the scene colour.
- Flat controls; the gold accent is reserved for primary and selected actions.
- Edge-docked elements sit flush; icon strips end in full diagonals.
- Icons: Game-icons first, Material Symbols Rounded (filled) where no game icon fits; compiled at build time, named by meaning, never smaller than 22×22 px.
- Context menus expose every action available for their object, including ones otherwise reached through row buttons, hover controls or shortcuts, using the same handlers and permission rules.
- Pop-ups emerge from the thing that spawned them and open there; menu items ending in "…" morph into their dialog.
- Motion is about 280 ms and switches off under reduced motion. View transitions animate state changes that can briefly be snapshots; anything the user may reach into mid-animation animates live with CSS.
- Interface text is succinct and functional: no commentary, reassurances, parentheticals or asides. System rules text is content and exempt.


### Open questions (M5)

- [ ] **Automation:** attacks and saves resolve against targets automatically, but the GM applies damage and conditions from the card? *Default: yes.*
- [ ] **Movement:** track movement per turn and opportunity attacks? *Default: leave them to the table for now.*
- [ ] **Multiclassing** in the first version? *Default: later.*
