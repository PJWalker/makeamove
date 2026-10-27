# Tabletop VTT — Design Doc

## Overview

We are building a local-first, peer-to-peer virtual tabletop (**Make a Move**) that runs in the browser as an installable PWA. Every participant holds a full copy of the campaign, works offline, and merges edits with peers when connected. Game rules live in plugins; Dungeon World is the first, but we should consider the possibility of D&D 5.5E, Daggerheart, PF2e, and other systems.

## Goals for the prototype

- Infinite-canvas scenes with maps, tokens and freehand drawing, editable by everyone at once.
- Character sheets, moves, inventories, and items whose effects change stats or grant moves.
- Characters come as PCs (class, moves) and GM-made NPCs (HP and system-defined fields). They live in a two-pane panel with shared folders, and selecting a character's token opens its sheet.
- 3D dice, with every roll and triggered move posted to a shared chat log.
- Session and world-building notes, with GM-only pages.
- A game-system plugin API, proven by Dungeon World & D&D5e system plugins.
- Works with zero servers we operate beyond a tiny, replaceable signalling relay.

**Non-goals (for now)**

- Secure secrecy. Hidden things are hidden in the UI, not cryptographically (per brief).
- Dynamic lighting, line-of-sight walls, audio/video chat, a marketplace.
- Native mobile apps. Tablets should work in the browser; phones get a reduced player view later.

**Guiding principles**

1. _Local-first:_ the local database is the source of truth; the network only syncs.
2. _Prefer boring, well-maintained libraries_ over bespoke infrastructure.

## Architecture

Each browser runs the whole app against a local Yjs CRDT store persisted to IndexedDB; peers exchange Yjs updates over a WebRTC mesh, and large binaries (map images) travel separately as content-addressed blobs. No server holds game state.

&#91;embedded content: architecture · one peer and its network\]

Dashed parts are infrastructure we do not need to run: relays only introduce peers, and the relay peer is optional.

**Proposed stack**

| Layer            | Choice                                                                                                                  | Why                                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language / build | TypeScript, Vite, PWA (service worker via vite-plugin-pwa)                                                              | Installable, offline after first load                                                                                                                |
| UI framework     | Preact + @preact/signals (TSX)                                                                                          | Signals bridge cleanly to Yjs observers for fine-grained updates; \~4 KB; React libraries via preact/compat; TSX for plugin authors (decided Oct 25) |
| Canvas           | PixiJS v8 (WebGL, WebGPU when available) + a custom camera                                                              | Handles large maps and hundreds of tokens at 60 fps; tldraw needs a commercial licence for production                                                |
| Freehand strokes | perfect-freehand                                                                                                        | Pressure-aware, tiny, renders to polygons                                                                                                            |
| CRDT             | Yjs (+ y-indexeddb for persistence, awareness protocol for presence)                                                    | Mature, fast, rich types (Map, Array, Text), subdocument support                                                                                     |
| Rich-text notes  | TipTap / ProseMirror with y-prosemirror                                                                                 | Collaborative editing with cursors                                                                                                                   |
| Peer transport   | WebRTC data channels; signalling via Trystero (public Nostr/MQTT relays) with an optional self-hosted signalling server | Zero-ops by default, swappable                                                                                                                       |
| Blob store       | Origin Private File System (OPFS), keyed by SHA-256                                                                     | Dedupes; fetched from any peer that has it                                                                                                           |
| 3D dice          | @3d-dice/dice-box (BabylonJS + Ammo physics, MIT)                                                                       | Proven, themeable, supports predetermined results                                                                                                    |

Added in M0: `unplugin-icons` with local Iconify data (Game-icons, Material Symbols) for offline icons; `fractional-indexing` for conflict-free ordering; PNG and maskable app icons alongside the SVG, so browsers can install the PWA.

**Documents and sync topology**

- One _campaign root_ Y.Doc: campaign settings, member list, the index of scenes, characters, items, notes and their visibility flags.
- One subdocument per scene, per character, per note page, and per chat-log chunk. Peers load subdocs lazily, so a big campaign does not have to sit in memory.
- A separate _GM vault_ Y.Doc that only syncs between devices holding the GM key. It holds GM-only notes and unrevealed prep. This gives real (if casual) secrecy almost for free; everything else is "hidden in the UI" only.
- Presence (cursors, selected token, "is rolling", pings) goes over the Yjs awareness channel and is never persisted.

**Joining and identity**

- The GM creates a campaign, which mints a random campaign ID and a shared room key. The invite link is `https://app/#join=<id>.<key>`; the key stays in the URL fragment, so it never reaches any server.
- Signalling and all peer traffic are encrypted with that room key, so public relays see only ciphertext.
- Each device generates a keypair on first launch. The GM's public key is recorded in the campaign root as owner; GM-only actions are checked against it in the UI layer.

_M2 status:_ invite links and the room key are in. Devices still use a random id stored in localStorage; the WebCrypto keypair and owner-key check are deferred, since GM-only rules are only enforced in the UI for now and nothing yet depends on a verified identity.

**Assets**

- Dropping an image hashes it, stores it in OPFS and writes only `{hash, mime, width, height}` into the CRDT.
- A peer that lacks a blob asks connected peers for it and receives 64 KB chunks over a dedicated data channel; images are re-encoded to WebP and capped (e.g. 8192 px) on import.
- Optional export/import of the whole campaign (CRDT state + blobs) as a single `.makeamove` zip, for backups and moving between machines.

**Mesh size:** a full mesh comfortably supports a GM plus 6–7 players. Larger groups are out of scope for the prototype.

**Consequence to note:** with pure P2P, a player who edits their sheet midweek only shares it the next time they overlap with someone online. An optional always-on relay peer would fix that (see Open questions).

## Data model

Every entity is a Y.Map with a stable ULID, a `kind`, a `systemId` for plugin-owned data, and shared `meta` fields (`createdBy`, `visibility`, `lockedBy`). Plugin data lives under a `data` sub-map the core never interprets.

| Entity          | Lives in                                  | Key fields                                                                                                                                                                      |
| --------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign        | root doc                                  | name, systemId + version, gmKey, members\[{deviceKey, name, colour, role}\], activeSceneId per member, settings                                                                 |
| Scene           | own subdoc                                | name, background colour, grid {type: none/square/hex, size, offset}, layers, elements (Y.Map by id), sceneColour (derived), fog                                                 |
| Scene element   | scene subdoc                              | id, type (map, token, drawing, text, shape, note-pin), layer, transform {x, y, rot, scale}, z-order (fractional index), locked, visibility, ref (e.g. characterId or blob hash) |
| Character       | own subdoc                                | name, owner deviceKey(s), portraitHash, tokenHash, systemId, data (plugin schema: stats, HP, bonds…), inventory (array of item instance ids)                                    |
| Item definition | root doc compendium                       | name, description, tags, effects\[\] (see Characters section), weight/uses — plugin-defined                                                                                     |
| Item instance   | character subdoc                          | defId (or inline copy), quantity, uses left, equipped, notes                                                                                                                    |
| Move definition | plugin compendium + campaign custom moves | name, trigger text, roll formula, outcomes {10+, 7–9, 6-}, requirements                                                                                                         |
| Chat message    | chat chunk subdoc                         | id, author, timestamp (HLC), kind (text, roll, move, system, whisper), payload, recipients?                                                                                     |
| Note page       | own subdoc                                | title, folder path, tags, Y.XmlFragment body, visibility, links to scenes/characters                                                                                            |

**Conventions**

- _Ordering_ uses fractional indices (strings) so concurrent reorders do not conflict.
- _Timestamps_ use a hybrid logical clock so chat order is stable across peers with skewed clocks.
- _Derived values_ (effective stats after item modifiers, scene colour) are computed locally and never stored, so they cannot drift.
- _Plugin data versioning:_ each plugin ships migrations keyed by its own schema version; the core runs them when a newer plugin opens older data.

## Scenes and the infinite canvas

A scene is an unbounded 2D world rendered by PixiJS, with pan (drag / space-drag / two-finger), zoom to cursor (0.05× to 8×), and a fixed stack of layers that keeps maps under tokens under drawings.

**Layers (bottom to top)**

1. _Background_ — scene colour or tiled texture.
2. _Map_ — one or more placed images; usually locked after setup.
3. _Grid_ — optional square or hex overlay, snap-to-grid for tokens.
4. _Drawing (under)_ — terrain marks, spell areas.
5. _Tokens_ — characters and NPCs; show name, HP ring and condition pips supplied by the plugin.
6. _Drawing (over)_ — annotations, arrows, text.
7. _Fog_ — GM-painted reveal/hide mask.
8. _Presence_ — other users’ cursors, pings, measuring rulers (awareness only, never stored).

**Tools:** select/move/rotate/scale, pan, freehand pen (perfect-freehand), line/arrow, rectangle/ellipse, text, eraser, ruler (grid-aware distance), ping (click-and-hold), fog brush (GM). Snap and layer are chosen per tool.

**Performance:** viewport culling, texture mip-mapping for large maps, drawings cached to render textures once finished, and CRDT updates batched per animation frame. Drag movements are sent via awareness while dragging and committed to the CRDT on release, which keeps history small.

**Scene colour:** when a scene opens, we sample its main map (downscaled to 64×64, k-means in OKLab) to pick a dominant hue, or use the GM’s override. That colour drives the UI tint (see UI section).

**Undo** is per user via Y.UndoManager scoped to that user’s own changes, so undoing never reverts someone else’s move.

**As built in M1**

- Each scene is a subdocument of the campaign root with its own IndexedDB database, loaded only while it is open. Its id is derived from the campaign and scene ids, so two peers upgrading an M0 scene at once converge on one document.
- The canvas renders on demand rather than every frame, so an idle table costs no GPU time. Drags preview locally and commit to the CRDT once on release, as one undo step.
- Dropped images are re-encoded to WebP, capped at 8192 px and stored by SHA-256 in OPFS (Cache Storage where OPFS can't write). Small, squarish images become tokens; anything else is placed as a map at its own size. Right-click swaps one for the other.
- Token options can change or remove a token's image. A character sheet has one stand-in token: click it to choose its image, drag it onto the map to place a token linked to that character, and right-click for Change/Remove image and Token settings (style and colour for tokens placed later).
- A token can be tied to a character (Token options → Character). The game system's `tokenStats(character, derived)` says what the token shows; Dungeon World gives an HP bar that turns amber and red as it drops. Bars sit under the token and update as the sheet changes.
- Tokens snap to cell centres (even-sized tokens to intersections) and resize in whole cells; Alt places them freely. Maps keep their aspect ratio unless Shift is held.
- The interface always takes its tint from the scene's main map (or from the canvas colour when there's no map). The canvas colour defaults to Auto, a darkened, muted version of the map's dominant colour; the GM can pick any colour instead in Scene settings or from the scene list.
- Grid lines are drawn twice, dark then light, so they read on both dark and light maps, and fade out as cells get too small.
- Tokens have two styles: round (image cropped to a circle on a coloured background with a border) or the image as it is, for cut-out art. Double-click a token for Token options: name, style and colour. The GM sets the style for new tokens, and the grid type for new scenes, in Campaign settings.
- The pen colour is a free colour picker rather than presets.

**Scene switching:** the GM can pull everyone to a scene; players can browse other visible scenes on their own (an option the GM can turn off).

## Characters, moves and items

A character’s _effective_ state is computed on every change: base data from the sheet, plus the effects of every active source (equipped items, conditions, class features), resolved in a fixed order. The sheet shows base and effective values side by side.

**Effect model** (shared by items, conditions and features)

| Effect type | Example                                  | Applied as                                                              |
| ----------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| `modify`    | Ring of Strength: STR +1                 | path, operator (add, multiply, set, min, max), value, priority          |
| `grantMove` | Holy Symbol grants _Turn Undead_         | move id added to the character’s move list while active                 |
| `grantTag`  | Chain mail: _clumsy_                     | tag added; other rules can read it                                      |
| `rollBonus` | Fine sword: +1 forward to Hack and Slash | move or tag selector, bonus, duration (ongoing / forward / until used)  |
| `resource`  | Healing potion: 3 uses                   | counter on the item instance; consumed by an action                     |
| `script`    | anything exotic                          | a named function the plugin exports, called with (base, effective, ctx) |

Effects carry an `active` condition: `equipped`, `carried`, `always`, or a plugin predicate. The resolver applies `set` first, then `add`, then `multiply`, then `min`/`max` clamps, within each priority band, and records which source changed each value so the sheet can explain “Damage d10 = class d6 → Fighter feature d10”.

**Moves** are definitions with a trigger, an optional roll formula and outcome bands. Activating a move:

1. Collects inputs (which stat, which target, any “hold” choices) in a small popover.
2. Builds a roll from the formula plus applicable bonuses (ongoing, forward, items).
3. Rolls (see Dice), consumes any one-shot bonuses, and posts a move card to the chat log.
4. Runs the outcome’s side effects (e.g. _mark XP on a 6-_, _take 1d4 damage_) as suggested buttons, not automatic changes, so the GM stays in charge of the fiction.

**Inventories** are ordered lists of item instances on a character, shown as an Inventory section on every character sheet (player characters and NPCs) with the load it comes to; there is no separate items tab. New things come from the Libraries: drag an item onto a character's inventory section or their row in the character list (only where you may edit that character; the target is outlined while you hover and flashes when it lands), press an item's Add button, or use “Find items in the Libraries…”, which opens them on items. Planned: drag between characters, and to and from the scene (an item token on the canvas). Load/weight totals come from the plugin.

**Libraries** are a tab in the right sidebar listing everything the game system and plugins contribute, as named collections grouped by source: the system gives its gear, moves (basic, special, class), classes and tags; a plugin adds its own with `registerLibrary()` (`src/library`). Search covers names, then tags, then text; a filter narrows to one kind. Each entry has an icon and shows its text as a tooltip beside it, and morphs into a window when clicked. Icons are bundled at build time, so systems and plugins name one from a core vocabulary (`icon` on an item or class; `ui/entryIcons.tsx`), and anything unnamed gets its kind's icon (a knapsack for items, dice for moves, a winged sword for class moves, a helm for classes, a tag for tags). Inventory items keep the icon they were added with. Items can be added to the selected character (from the row or the window), and a move's window can make the move as them. Later sources: the campaign's homebrew, and monsters.

**Ownership:** a character has one or more owners. Owners and the GM edit; others view (or see nothing, if hidden).

## Dice

The roller decides the result locally with a cryptographic RNG, writes it to the chat log, and every peer animates 3D dice that land on those exact faces. Results never depend on physics, so all screens agree.

- **Notation:** a small parser for standard notation — `2d6+2`, `d8+d4`, `4d6kh3`, `2d20kl1` (disadvantage), `d6!` (exploding), `b` / `w` for advantage-style “best of”. Plugins can register extra syntax.
- **Roll record:** `{formula, dice:[{sides, value, kept}], modifiers:[{label, value}], total, rollerKey, hlc}`. Each modifier keeps its label so the card can read “2d6 (4+5) + STR 2 + Ring 1 = 12”.
- **3D rendering (moved to M6):** a transparent full-screen overlay, lazy-loaded on the first roll, where every peer's dice land on the recorded faces. Per-user dice colour/theme. Note: @3d-dice/dice-box has no predetermined-results mode (it only rolls with live physics); only its older three.js fork, @3d-dice/dice-box-threejs (last updated 2022), can force results. M6 picks between that fork and our own physics-free animation.
- **Fallback:** a 2D tumble animation when WebGL is unavailable, or when the user turns 3D off for speed.
- **Visibility:** public, or secret (the roller and the GM; a GM's secret roll is the GM's alone). Others see “Name rolled in secret.” There are no blind rolls: if a player shouldn't see a result, the GM rolls it.
- **Quick dice bar:** d4, d6, d8, d10, d12, d20, plus a free-form box; clicking a stat or move on a sheet rolls the right formula. Clicks gather into a pool for a moment before rolling as one entry (double-click the d20 for 2d20); right-click a die to take one back out.
- **Honesty is social, not cryptographic.** A determined player could fake a roll in devtools. That fits the “needn’t be robust” brief; commit-reveal rolling could come later.

_As built in M3:_ `src/dice/notation.ts` parses and rolls `2d6+2`, `d8+d4`, `4d6kh3` (also `k3`, `b3`), `2d20kl1` (also `w1`), `4d6dl1` / `dh`, `d6!` (capped at 20 extra dice), `d%`, and `[labels]` on any term, with unbiased `crypto.getRandomValues` dice. Rolls show in the chat as cards: formula and note, one chip per die shaped like that die (dropped dice faded, maximums in citrine, ones in garnet), and the total; a roll that arrives live tumbles in, die by die (off under reduced motion). Until 3D dice land, that card is the 2D fallback. Plugin syntax is not in yet.

## Chat and move log

The right-hand sidebar is one chronological stream of chat, rolls and move cards, stored as append-only chunks (one subdoc per \~500 messages) so long campaigns stay fast.

- **Message kinds:** text (markdown-lite), roll card, move card (move name, trigger, roll breakdown, outcome band highlighted, outcome text, follow-up buttons), system (“Kira joined”, “Scene changed to The Bog”), whisper (to named members; hidden in UI from others).
- **Speaking as:** a picker for “myself” or one of my characters; the GM can speak as any NPC.
- **Slash commands:** `/r 2d6+1`, `/w name text`, `/move defy-danger dex`, `/sr` for a secret roll. Plugins register more.
- **Scene changes:** when the GM settles on a scene (stays 1.5 s, so passing through scenes or renaming one doesn't post), the log gets “Scene changed to The Bog”, with a “Go there” button for anyone on a different scene. Players aren't moved; that waits for the GM's “pull everyone” control. The last announced scene is kept in the campaign, so a reload doesn't repeat it, and a new campaign's first scene isn't announced.
- **Session markers:** the GM can start/end a session; the log groups by session and can export one as markdown into the notes. Earlier sessions fold into a band (“Session 2 · 34 messages”) until the reader opens them; the current session is always open.
- **Deleting:** players can delete their own messages, and the GM anyone's (including system notices and session markers). Deleting removes the message from the shared log for everyone; like other GM rules this is enforced in the UI only. Right-click a message (or long-press on touch) for a menu with “Delete message”. Swipe-to-delete was tried and dropped: browsers can't tell when fingers leave a trackpad, so a swipe there can't wait for the lift the way it should.
- **Unread state** and a collapsible, translucent sidebar so the map stays visible.

_As built in M3:_ the log is a `chat` Y.Array of chunk subdocuments on the campaign root, 500 messages each, each persisted in its own IndexedDB database and synced by the M2 session as soon as it loads; the newest two load on open and “Load earlier messages” pulls in older ones. Messages are immutable plain objects stamped with a hybrid logical clock (`src/lib/hlc.ts`), so peers agree on order even with skewed clocks. Commands: `/r` (public), `/sr` (secret: you and the GM), `/w name` or `/w gm`, `/me`, `/session start|end` (GM; numbered in the campaign), `/help`, and `//` to send text starting with a slash; typing `/` lists them. Text supports **bold**, *italic*, `code` and links, rendered as elements, never HTML. The quick dice bar has a Public / Secret toggle; its clicks gather into a pool that rolls as one entry 1 s after the last change (each button shows its count, right-click takes one back out, and a "roll now" button fills as the moment approaches). Whispers are hidden from everyone but sender and recipients, including the GM. Unread messages from others show as a count on the Chat tab. A player's first join posts “Name joined”. Not yet: speaking as a character (needs characters, M4), move cards (M4), exporting a session to notes (M6).

## Notes

Notes are a folder tree of collaborative rich-text pages (TipTap over Yjs) with live cursors, wiki-style `[[links]]` and backlinks. _As built so far:_ see M6 status under Milestones.

- **Two default folders:** _Sessions_ (one page per session, auto-created from session markers, with a recap template) and _World_ (places, factions, NPCs, lore).
- **Embeds:** link chips to characters, scenes, items and moves; images from the blob store; a note can be pinned to a scene location as a marker.
- **GM-only pages** live in the GM vault doc, so they never reach players’ devices. Revealing a page copies it into the shared root. _(Built; see M6 status.)_
- **Per-paragraph secrets:** a “GM only” block style inside a shared page, hidden in the UI from players (casual secrecy only).
- **Dungeon World hooks:** the plugin adds templates for Fronts, Dangers (with grim portents as tickable checkboxes) and Steadings.

## Permissions: hide and lock

Permissions are enforced by the UI and by a write filter in each client, not by cryptography. A client ignores incoming changes that its rules say the sender may not make, which stops accidents and casual meddling.

| Flag         | Values               | Effect for non-GM users                                                                            |
| ------------ | -------------------- | -------------------------------------------------------------------------------------------------- |
| `visibility` | everyone, owners, gm | Not rendered / not listed when they lack access; the GM sees it at 40% opacity with a hidden badge |
| `lock`       | none, position, full | _position_: cannot move or resize; _full_: cannot edit at all                                      |
| `ownerKeys`  | device keys          | Owners may edit their characters and tokens                                                        |

- **Roles:** GM (one or more, by device key), Player, Observer (read-only).
- **Fog of war** is a mask in the scene: players see revealed areas only; the GM sees a dim overlay.
- **Real secrecy where it is cheap:** GM vault doc (notes, unrevealed prep scenes). Everything else is visible to anyone who opens devtools, as agreed.
- **Rejected-write filter:** each client validates updates against the rules before applying them in its own UI; illegal changes from a peer are reverted and logged. This needs care with CRDT merges, so for the prototype we only revert edits to locked or GM-only entities.

## Plugin system

A game system is an ES module that exports a `GameSystem` object: mostly declarative data (schemas, compendium, sheet layout) plus a few pure functions. The core provides sheets, dice, chat, effects and storage; the plugin only describes the rules.

```ts
export default defineSystem({
  id: 'dungeon-world', version: '0.1.0', schemaVersion: 1,
  name: 'Dungeon World',

  character: {
    schema,            // Zod/Valibot schema for character.data
    create(input),     // new character from class + choices
    derive(base, effects) => effective, // optional; default uses the effect resolver
    sheet,             // declarative layout: sections, fields, stat blocks, move lists
  },
  compendium: { classes, moves, items, monsters, tags }, // listed in the Libraries
  rolls: {
    formulas: { stat: (c, stat) => `2d6+${c.mod(stat)}` },
    outcomes: (total) => total >= 10 ? 'strong' : total >= 7 ? 'weak' : 'miss',
  },
  token: { bars: [{ value: 'hp', max: 'maxHp' }], pips: ['conditions'] },
  chat: { commands: { move: ... }, cards: { move: MoveCard } },
  notes: { templates: { front, danger, steading } },
  migrations: { 1: (data) => data },
  hooks: { onMoveResolved, onSessionEnd },
});
```

- **Loading:** built-in systems ship with the app. Third-party systems load from a URL or a dropped `.js` file, are stored as a blob, and sync to peers like any asset, so everyone runs the same rules version.
- **Trust:** plugin code runs in the page with full access. That is acceptable for a hobby tool among friends but means “only install systems you trust”. A sandboxed (iframe/worker) plugin host is a later option.
- **UI extension points:** sheet layouts are declarative so most systems need no UI code; an escape hatch lets a plugin supply a Preact component for a custom panel or chat card.
- **One system per campaign.** Switching system is a deliberate migration, not a toggle.
- **Homebrew without code:** the GM can add moves, items and effects through forms; they are stored in the campaign and use the same effect model.

## Dungeon World plugin

The first plugin covers the core book: six stats with modifiers, the basic and special moves, the eight core classes, gear with tags, and GM tools for Fronts. Dungeon World’s text is licensed CC BY 3.0, so we can ship move and class text with attribution.

**Character sheet**

- Stats STR, DEX, CON, INT, WIS, CHA as scores (3–18), with modifiers derived from the standard table (−3 to +3), and the six debilities (Weak, Shaky, Sick, Stunned, Confused, Scarred) each giving −1.
- HP (max = class base + CON score), Armor, Damage die, Level, XP (with “mark XP” on a 6-), Alignment, Race, Bonds, Load (max = class base + STR mod), coin.
- Starting and advanced moves; level-up flow that offers the class’s eligible advanced moves.

**Moves**

- Basic moves: Hack and Slash, Volley, Defy Danger, Defend, Spout Lore, Discern Realities, Parley, Aid or Interfere.
- Special moves: Last Breath, Encumbrance, Make Camp, Take Watch, Undertake a Perilous Journey, Level Up, End of Session, Carouse, Supply, Recover, Recruit, Outstanding Warrants, Bolster.
- Roll = 2d6 + stat mod (+ forward/ongoing). Outcome bands 10+ / 7–9 / 6-, with each band’s text and any “choose N” options rendered as checkboxes on the move card.
- Damage rolls use the class die plus tags (e.g. _+1 damage_, _messy_, _piercing 2_).
- Hold and forward/ongoing tracked per character, decremented when spent.

**Items and tags**

- Gear with weight, uses and tags (_close_, _reach_, _near_, _far_, _precise_, _ration_, _2 piercing_, …). Tags map to effects: _+1 armor_ → `modify armor +1`; _precise_ → use DEX for Hack and Slash; magic items can `grantMove`.
- Adventuring gear uses (e.g. 5 uses) as an item resource.

**GM tools**

- Fronts and Dangers note templates with grim-portent checklists and impending doom.
- Monster stat blocks (HP, armor, damage, tags, instinct, moves) as NPC tokens with an HP ring.
- A GM-moves reference panel (hard and soft moves) and a “make a move” chat card.

## D&D 5.5e plugin and a general rules engine (M5)

The second system is D&D 5th edition as revised in 2024 ("5.5e"), built from the System Reference Document 5.2 (CC BY 4.0, so its text can ship with attribution, like Dungeon World's). It is the test of the plugin API: anything 5.5e needs that Dungeon World also has, or that any tactical system would need, goes into the core; anything that is only 5.5e's arithmetic stays in the plugin. The aim is that a third system (Daggerheart, Pathfinder) needs data and formulas, not core changes.

**Where things stand.** The core was built around Dungeon World and assumes it in places: the character record has `bonds`, `debilities`, `forward`, `ongoing`, `coin`, `alignment` and `race` as core fields; `derive()` hard-codes class HP, damage die and load; every move is "base roll + stat → strong / weak / miss" (`characters/moves.ts`); move cards and their follow-ups (Mark XP, Roll damage) are Dungeon World's; the sheet is hand-written for Dungeon World; the ruler measures cells or pixels; and nothing knows about a target, a range, turn order, a condition or a rest.

### Core changes

1. **Systems as modules with a schema.** A registry of systems (built-in first; loading from a URL or file stays in M6) and a `defineSystem()` that checks a system's shape. A system declares its character data schema with defaults and its own migrations (see Plugin system).
2. **A generic character record.** The core keeps only what every system has: name, owner, kind (player character or NPC), folder, portrait and token style, notes, inventory, conditions, resources, and a level. Everything else (ability scores, bonds, debilities, death saves, spell slots, proficiencies, hit dice) lives in a `data` map the system owns and the core never interprets. Dungeon World's fields move into its own `data`.
3. **Derived values from the system.** `derive()` becomes a system function from the character and its active effects to named values (AC, max HP, attack bonus, spell save DC, initiative, load, carrying capacity, passive Perception), each with its explanation from the effect resolver, which stays in the core.
4. **Resources and rests.** Counters with a maximum that reset on a named event: HP and temporary HP, hit dice, spell slots by level, pact slots, class resources (Rage, Ki, Channel Divinity), item charges and "uses". Resets are tags (short rest, long rest, dawn, turn, round), and the core offers Short Rest and Long Rest commands that the system wires up. Dungeon World's item uses and HP become resources too.
5. **Actions, not moves.** One action model for both systems: name, source (class, item, spell, feature), activation cost (action, bonus action, reaction, free, none), range, targeting (below), resource cost (a spell slot of some level, uses, ammunition), and a list of steps. Steps are generic: roll a formula, roll against a target number (attack vs AC, check vs DC), ask targets to save, roll damage with types, apply or offer effects. A Dungeon World move becomes one step ("roll 2d6 + stat, map the total to a band") with its band texts; the system supplies the band function as now.
6. **Targets and targeting.** Each player can mark tokens as targets (shown as a ring in their colour and shared through presence, like cursors). An action with a targeting spec ("one creature within 60 ft", "up to three creatures", "self", "a 20 ft sphere") asks for targets when it is used, checks range on the scene, and resolves per target: one attack roll per target against that target's AC, one save per target against the caster's DC.
7. **Distance and scene units.** A scene gets units per grid cell (5 ft by default) and a diagonal rule: 5.5e's default counts every diagonal as one square (Chebyshev); the alternating 5 / 10 ft rule and true distance are options. The ruler shows feet, range checks measure between token edges, and tokens get size categories (Tiny to Gargantuan → cells). Hex grids count hexes.
8. **Areas of effect.** Templates as scene elements (cone, line, cube, sphere / emanation, cylinder), placed when an action needs one, listing the tokens they cover so the action can target them.
9. **Rolls.** Advantage and disadvantage as a roll option (the notation already has `2d20kh1`), critical hits that double damage dice, damage types, and roll requests: a card that asks a target's owner to roll a save or check, with a button only they (or the GM) can press. The GM applies damage from the card (with resistance, vulnerability and immunity offered by the system); nothing is automatic, as with Dungeon World's suggestions.
10. **Conditions with durations.** Conditions on characters and tokens (pips on the token), each with a duration: rounds, until the end or start of someone's turn, until removed, or concentration (dropped when the caster takes damage and fails, or casts another concentration spell; the core tracks it, the system supplies the check). Systems define their conditions and the effects each applies. Dungeon World's debilities can become conditions.
11. **Combat and initiative.** A turn tracker: who's in the fight, initiative order (the system supplies the roll and tie-breaks), rounds, whose turn it is, and per-turn resets (reaction, movement, "once per turn" features). Systems without initiative, like Dungeon World, hide it.
12. **NPCs and monsters from the Libraries.** A stat block is a library entry; placing one on the map makes a token with its own HP and conditions, unlinked from any character record, so a pack of goblins needs no sheets. A token can be promoted to a full NPC when it matters.
13. **Declarative sheets.** The sheet is built from the system's layout of sections and field widgets (ability block, counter, gauge, resource track, action list, inventory, text, choice list), so most systems need no UI code; a system can still supply a component for an unusual section. Dungeon World's hand-written sheet becomes its layout.
14. **Character creation and levelling.** A guided flow driven by system data: class, species, background, ability scores (standard array, point buy or rolled), and the choices each level grants. Dungeon World's class picker becomes a short version of the same flow.
15. **Bigger libraries.** Spells, feats, species, backgrounds, classes with subclasses and level tables, monsters and magic items: hundreds of entries, so collections load lazily and search uses an index. Library entries can carry actions, so a spell or a weapon on the sheet is the same thing as in the Libraries.

### Kept in the 5.5e plugin

- The SRD 5.2 data: classes, subclasses and their level tables; species; backgrounds; feats; spells; weapons with their mastery properties; armour; adventuring gear; magic items; monsters; conditions; the rules glossary.
- The formulas: ability modifiers, proficiency bonus by level, AC from armour category, Dexterity cap and shield, attack and damage bonuses, spell save DC and attack bonus, initiative, passive scores, carrying capacity, hit points by class and level, multiclass spell slots, exhaustion (−2 per level to d20 tests in 2024).
- Spellcasting rules (prepared spells, slots, pact magic, rituals, cantrip scaling), Heroic Inspiration, death saving throws, and the sheet layout.
- Which conditions exist and what each does; damage types; creature sizes; the default diagonal rule.

### From Dungeon World: made generic, or kept

| Now in Dungeon World                          | Becomes                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| Stats and `modifier()`                        | Generic abilities; each system's own modifier rule                        |
| Moves, move list, move cards                  | Actions with steps; one card renderer for any step results                |
| `band()` and strong / weak / miss texts       | Kept: Dungeon World's result function and texts                           |
| Suggestions (Mark XP, Roll damage)            | Generic follow-up buttons that a system defines per action or result      |
| Forward and ongoing                           | Generic roll modifiers: one-shot or lasting (5.5e: Bless, Guidance)       |
| Debilities                                    | Conditions, defined by Dungeon World                                      |
| Item uses, HP                                 | Resources                                                                 |
| Load and weight                               | A derived value and an item field any system may use                      |
| Classes with HP, damage die, load             | Generic classes with features by level; numbers in each system's data    |
| NPC fields                                    | Stat blocks                                                               |
| Bonds, alignment, race, coin, XP rule         | Kept: Dungeon World's character data                                      |
| Fronts, Dangers, Steadings                    | Kept: Dungeon World note templates (M6)                                   |

### Order of work

1. Port Dungeon World onto the general core with no change in behaviour: system registry and schema, the generic character record, system `derive()`, resources, actions with steps, roll modifiers and conditions. Existing tests keep passing; new ones cover the port.
2. Scenes: units, diagonal rules, token sizes, the ruler in feet, range checks, and targets.
3. Actions end to end: targeting, attack and save steps, roll requests, damage with types, the new cards.
4. Combat: the turn tracker, durations, concentration, per-turn resets, rests.
5. The 5.5e plugin: data, formulas, sheet layout, character creation and levelling.
6. Monsters and areas of effect: stat blocks, unlinked tokens, templates.

### Open questions for M5

- [ ] **Content:** SRD 5.2 only (free to ship), with homebrew forms for anything else? _Default: yes._
- [ ] **Automation:** attacks and saves resolve against targets automatically, but damage and conditions are applied by the GM from the card? _Default: yes, as with Dungeon World._
- [ ] **Movement:** track movement per turn and opportunity attacks, or leave them to the table? _Default: leave them, for now._
- [ ] **Multiclassing** in the first version? _Default: later._
- [ ] **Diagonals:** default to 5.5e's one-square diagonals, with the GM able to switch per scene? _Default: yes._

## Command palette and action index

A keyboard-first palette for finding and doing things without hunting through panels. Ctrl/Cmd + K opens a centred popover with one search field; typing filters a ranked list, Up/Down move, Enter runs the top choice, Escape closes. It is built **before the hotbar** in M4, because both read from the same **action index**.

**The action index** is one in-memory list of everything a player can do or look up, rebuilt when the campaign, the selected character or the system plugin changes. Each entry has:

| Field      | Meaning                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| `id`       | Stable id, such as `move:hack-and-slash` or `tool:ping`. The hotbar stores these, not copies               |
| `kind`     | `move`, `item`, `tool`, `command`, `entry` (compendium, notes, characters, scenes) or `setting`           |
| `title`    | Display name, plus `aliases` and `tags` for matching (_hack_, _H&S_, _melee_)                              |
| `source`   | Where it comes from: core, the game-system plugin, the campaign's homebrew, or the selected character     |
| `available`| Whether it can run now (for example, a move the selected character doesn't have, or no character selected) |
| `run`      | What happens on Enter: activate the move (see Characters, moves and items), start the tool, open the page |
| `open`     | Optional secondary action, usually showing the entry's full text without running it                       |

- **Sources.** Core registers tools (select, pan, draw, ping, measure) and commands (fit to scene, undo, toggle chrome, new scene). The plugin's compendium (its Libraries) contributes moves, items, classes, monsters and tags. The campaign contributes characters, notes, scenes and homebrew. The selected character contributes their own moves and usable items, flagged so they rank first.
- **Ranking.** Fuzzy match on title, aliases and tags; then the selected character's own moves, recently used actions, and exact-prefix matches rise. Entries that are unavailable are shown dimmed with the reason, not hidden, so players can still read them.
- **Prefixes narrow the search:** `>` commands only, `/` moves, `@` characters, `#` notes and compendium entries. With no query it shows recent actions and the selected character's moves.
- **Moves run in place.** Choosing a move opens the same small input popover as from the sheet or hotbar, then rolls and posts a move card. Shift + Enter opens the move's text instead of rolling.
- **Visibility follows permissions.** Hidden characters, notes and GM-only compendium entries never enter a player's index (see Permissions).
- **Plugin hook.** A system can add its own entries through `index: { entries, aliases }`, so move text and tags become searchable without any UI code. The index is derived data and is not synced; every peer builds it from the same synced sources.
- **UI.** A bevelled panel in the usual style over the canvas, with a gold focus ring on the active row, each row showing an icon, title, source and shortcut hint. It animates like other popovers (about 280 ms) and respects reduced motion. The right-click menu and tool strip stay as they are; the palette is an extra way in, not a replacement.

The hotbar then becomes a pinned, ordered selection of index ids per character, so adding to it can be done from the palette (for example, Alt + Enter pins the highlighted action).

## UI and visual design

The canvas fills the window; all chrome floats over it as translucent dark panels tinted by the scene colour, with light text and a golden-yellow accent reserved for primary actions, selection.

**Layout**

- _Top centre, docked:_ the tool strip, starting with the campaign menu (a hamburger button): Player settings…, Campaign settings… (GM only), Help and shortcuts…, and Back to campaigns. It opens on the press below the button, like every menu, and its pop-ups morph out of their items.
- _Top edge, docked:_ canvas tool strip — select, pan, draw, shapes, text, measure, ping, and fog for the GM — with single-key shortcuts. It centres itself in the space between the sidebars.
- _Left and right edges, docked:_ two sidebars with vertical tabs. By default Scenes and Characters are on the left and Chat, Libraries, Notes and Members on the right. The scene list (and, for the GM, the active scene's settings) is the Scenes tab, not a separate bar; campaign actions are in the campaign menu. Tabs, tools and hotbar slots are picked up as soon as they are dragged and reorder along their bar, with a white line showing the drop point; the tool order is a per-device preference, and dropping a hotbar slot off the bar unpins it. Dragging a tab away from its strip floats it. There is no hide button: dragging a sidebar very narrow snaps it shut, and clicking its open tab toggles it. Each body slides in from past the window edge, pushing the tab strip ahead of it, and its inner edge can be dragged to resize it. Any tab can move to the other side (drag it onto that sidebar, or right-click it) or float in a window; a side with no tabs disappears until a window is dragged.
- _Chat panel:_ member avatars and connection status under the title; dice tray above the message field.
- _Characters and Notes panels:_ each is a list and a detail (a character's sheet, a note's page) with one layout choice, kept per device and per panel: **side by side** (the list's width can be dragged; double-click the divider to reset it), or **one at a time** (a stack: pick an entry to open it, go back to the list). A toggle in the title bar switches; when the panel is too narrow for two columns (under 381 px) it shows one at a time regardless, and the toggle stays in place, disabled, saying why. Both use one component, `ui/TwoPane.tsx`.
- _Customisability:_ any panel can be dragged out into a floating window, resized from any edge, and docked back. Character sheets, item cards and note pages open the same way.
- _Command palette (planned for M4, before the hotbar):_ Ctrl/Cmd + K opens a search over moves, items, tools, commands and library or campaign entries. See Command palette and action index.
- _Bottom centre (planned for M4):_ an editable action hotbar — the selected character's moves and item actions, plus global actions like ping, measure and roll — that each player can add to, remove from and reorder. It pulls from the same action index as the command palette. See Milestones.
- _Campaign list:_ a lobby over a non-overlapping scatter of Game-icons that slowly swap.
- _Menus:_ one shared menu component, for right-click menus (canvas, chat, characters) and the campaign menu, plus the scene menu. Menu text is 1rem. Every menu works as on macOS, on every platform: menus open on the press (right button for context menus, left for the campaign and scene menus), and holding, moving to an item and releasing chooses it, while releasing elsewhere closes the menu; a quick click leaves it open. Right-click menus open on the press even on Windows, where browsers would otherwise wait for the release; the keyboard menu key and touch long-press still open them. In the scene menu, releasing on a scene switches to it, and scene deletes (which have no confirmation) are never chosen by a release. An open scene menu sits above floating windows.
- _Lists:_ one list design (`ui/List.tsx`) for every list of things in a panel: the character list and its folders, the Libraries' collections, and a sheet's moves and inventory. A row is a leading icon or avatar, a name, an optional tag chip (a stat, “NPC”) and quieter detail (weight, uses), then any buttons. Rows have no background: hovering turns the name and icon gold, and the selected row stays gold with a bar at its start. Groups (folders, collections) are foldable headings with a caret, an optional icon, the label and a count, with their rows indented beneath. Tags are tinted bevelled chips, not outlined boxes.
- _Pop-ups:_ a pop-up emerges from the thing that spawned it and opens right there (its top left on the spawner's, kept wholly on screen), not centred or anywhere else it would have to travel to. Menu items whose label ends in “…” open pop-ups, as on macOS: the menu closes at once and the item morphs into the dialog with a shared-element view transition. So do Scene settings in the Scenes tab and the campaign menu's items (player and campaign settings, help), and a move's tooltip morphs into its move window the same way when the move is clicked. The morphing box casts the window's shadow as it grows, so the shadow arrives with the window. Openers that can't run a transition still open in place and grow out of the spawner's rectangle. Only a pop-up with no spawner opens where it was last left, or centred.

**Colour system (OKLCH, all derived from one scene hue `h`)**

| Token              | Value                                         | Use                                               |
| ------------------ | --------------------------------------------- | ------------------------------------------------- |
| `--surface`        | oklch(20% 0.03 h / 0.82) + backdrop blur 12px | Panels                                            |
| `--surface-raised` | oklch(26% 0.035 h / 0.9)                      | Popovers, active tab                              |
| `--surface-sunken` | oklch(14% 0.02 h / 0.7)                       | Inset fields, the dice tray and menu-footer bands |
| `--text`           | oklch(93% 0.01 h)                             | Body text                                         |
| `--text-muted`     | oklch(72% 0.02 h)                             | Labels, timestamps                                |
| `--accent`         | oklch(82% 0.15 85) ≈ #F0C23B                  | Primary buttons, focus ring, selection            |
| `--accent-ink`     | oklch(22% 0.04 85)                            | Text on gold                                      |

The hue transitions over 600 ms when the scene changes (`@property`-registered custom property). Chroma stays low so that a vivid map never makes the UI garish, and text contrast is checked against the darkest and lightest tints (target WCAG AA 4.5:1).

**Shape language**

- Buttons, inputs and panels use `border-radius` plus `corner-shape: bevel` (5px controls, 12px panels). Safari and Firefox get the same chamfer from a `clip-path` fallback.
- **No hairline borders.** Regions separate by tone (sunken and raised fills) and spacing only. Focus rings (2px gold) are the one exception.
- Panels clip their children (`overflow: clip`), so a tinted band at an edge never squares off a bevelled corner.
- **Edge-docked elements** sit flush against the window: no margin, no bevel and no outer edge on the docked side.
- **Icon strips** use a bevel as deep as the strip is wide, so each end reads as one diagonal running from the window edge.
- Primary button: gold fill, dark ink. Secondary: raised fill that turns gold on hover. Icon buttons: no chrome until hovered; gold tint when active.
- Avatars are circles; everything else is bevelled.

**Icons:** Game-icons.net (CC BY 3.0, credited in Help) first, with Material Symbols Rounded (filled) where no game icon fits. Generic glyphs like add, close and chevrons come from Material Symbols. Icons are compiled into the bundle at build time and named by meaning in one module, so swapping one is a one-line change. Small icons will be 22x22px, no smaller.

**Motion:** view transitions animate state changes where the moving parts can briefly become snapshots: docking a window into the sidebar, switching sidebar tabs (the content slides up or down to match the tab order), showing and hiding the sidebar, and lobby ↔ table. Anything the user may reach into mid-animation animates its live elements with CSS instead — the scene menu grows with `interpolate-size` and a `grid-template-rows` drawer, so it stays hoverable. Dialogs fade and rise in with `@starting-style`, and close by receding: shrinking slightly about their centre as they fade, as if sinking back into the table. Everything is about 280 ms and switches off under reduced motion.

**Type:** Cabin for controls and chat; Fraunces (optical sizing on, never small caps) for headings, move names and sheets.

**Unobtrusiveness:** panels stay solid at all times (the hover fade was tried and dropped); Ctrl/Cmd + \\ hides all chrome, leaving Tab free for keyboard navigation; motion respects `prefers-reduced-motion`.

## Milestones

We build in seven milestones, each ending in something you can open and try; after M4 a group can play a full Dungeon World session. M5 (added Oct 27) generalises the rules engine and adds D&D 5.5e as a second system; notes and polish move to M6.

&#91;embedded content: build plan · six milestones (out of date: before M5 was added)\]

Each milestone ends with a short review with you before the next begins. M2 comes early on purpose: sync touches everything, so we prove it before building rules on top.

**Status:** M0 is complete as of Oct 25, in `~/makeamove` (local Git, no remote yet). It delivers the installable, offline PWA shell; the Yjs campaign store on IndexedDB with a local campaign list; the scene index with scene-tinted theming; the tabletop layout, floating windows and resizing; and the lobby. It went further than planned on interaction design, but no automated tests exist yet — worth adding with M1, starting with pure logic like `resizeRect` and the colour maths.

**M1 status:** complete as of Oct 25, reviewed and accepted. Scenes are now Yjs subdocuments with an infinite PixiJS canvas (WebGPU where available): pan, zoom to cursor, pinch; square and hex grids with snapping; maps and tokens imported by drop, paste or file picker into an OPFS blob store; select (click, or drag a marquee around whole elements), move, resize and rotate, with a group frame to rotate a multi-selection; freehand pen and eraser; a right-click menu for lock, restack, layer and map ↔ token; and per-user undo. Pure logic (grid, camera, geometry, strokes, colour, `resizeRect`) has 40 Vitest unit tests (including the select tool's marquee and group rotation). Not in M1: shapes and text tools (moved to a later milestone), the ruler and pings (M2, they are presence), and caching finished drawings to textures (not needed yet).

**M2 status:** built, awaiting review. The campaign root and each scene subdocument sync over a transport-agnostic Yjs session (`src/sync/session.ts`) with a Trystero WebRTC adapter; the session is tested over an in-memory network, so the real-relay path is the part to check by hand with two browsers. `#join=<id>.<key>` invite links (copy from Campaign settings) open a join card in the lobby; a joined campaign waits on a screen until the first peer sends it, then adds the player as a member. Cursors, pings and the ruler are awareness-only. Images a device lacks are requested from peers by hash, chunked, and verified by SHA-256 before being kept. The member list shows who is online. Deferred: the device keypair, and relays other than Trystero's defaults. 50 unit tests.

**M3 status:** complete as of Oct 26; tested in two browsers. Dice notation and rolling, the chunked chat log with HLC ordering, slash commands, whispers, secret rolls, session markers with earlier sessions folded, scene-change notices, deleting messages, roll cards, the quick dice bar with pooling, unread counts, and press-drag-release menus (see Dice, Chat and move log, and UI). 94 unit tests, including two peers syncing the log over the in-memory network. 3D dice moved to M6.

**Added to M6:** 3D dice (see Dice), moved out of M3.

**Added to M4:** the command palette and its action index, built first. Ctrl/Cmd + K searches moves, items, tools, commands and campaign entries, and the index it reads from is what the hotbar is then made from, so the two stay consistent. See Command palette and action index.

**Added to M4:** the action hotbar — an edge-docked bar at the bottom centre, filled with the selected character's moves (from the game-system plugin), usable items, and global actions like ping, measure and roll, all taken from the action index. Players drag actions in and out and reorder them; each player's bar is stored per character with that player's member data, so it follows them between devices. The canvas tool strip stays for drawing tools; ping and measure may move onto the hotbar once it exists.

**M4 status:** complete as of Oct 26, played through in the browser; after review it gained an inventory section on every sheet, the Libraries tab (system and plugin collections, with icons and drag onto characters) in place of the Items panel, one list design, and the campaign menu. _As built:_ the action index and palette (Ctrl/Cmd+K; `>` `/` `@` `#` prefixes; Alt+Enter pins; Shift+Enter shows an entry), the Dungeon World system as data (`src/systems/`: basic and special moves, class moves for the eight classic classes (partial), 19 items, tags, debilities) with a pure effect resolver (set, add, multiply, min/max within priority bands, with the source of each change), characters in the root doc (`src/characters/`: stats and modifiers, HP, XP and level-up, armour, damage, load, coin, debilities, forward and ongoing, bonds, notes, inventory with equipped state and uses), the Characters and Items panels (with a compendium), a move dialog for stat or bond choices, move cards in chat (roll breakdown, band, outcome text, Mark XP and Roll damage buttons) and the hotbar (bottom centre; default is the character's moves, gear with uses, ping and measure; keys 1 to 9; per character, kept in the player's member entry). Not yet: custom items and moves, tags that change rolls, the plugin loader (one built-in system), and verified rules text.

**M5 status:** in progress: a general rules engine and the D&D 5.5e plugin; see D&D 5.5e plugin and a general rules engine. _Step 1 done (Oct 27): Dungeon World runs on the general core, with no change in what players see._ A system is checked when it's defined (`defineSystem`: unique ids, and every action's category, class, stat, outcomes and follow-ups exist). A character keeps only core fields (name, owner, kind, folder, class, level, scores, notes, portrait, token, inventory) plus the system's: `data` (declared with defaults; Dungeon World's race, alignment, XP, coin, bonds, HP bonus and an NPC's maximum HP), `resources` (current values, with maxima from derived values; HP), `conditions` (the system's, each with effects; Dungeon World's debilities give −1 to their stat), and `modifiers` (named roll modifiers spent by the next roll or kept until removed; Forward and Ongoing). The system's `derive()` works out named values with the core effect resolver. Moves are actions with steps: a `check` step adds a stat or asks for one (or for a number, such as a bond), reads out the result the system names (Full success, Partial success, Miss), and offers the system's follow-ups (Mark XP, Roll damage). Action categories come from the system, which also says which ones fill a new hotbar. Sheets are still drawn by each system (`systems/dungeon-world/Sheet.tsx`, from shared parts in `table/sheetParts.tsx`) until they become declarative. The one visible difference: the Libraries list move groups in the system's order (Class, Basic, Special). _Step 2 done (Oct 27): scenes measure in the system's units._ A scene's grid now has a unit per cell (5 ft by default), a unit name and, on square grids, a diagonal rule: every diagonal is one cell (5.5e's default), diagonals alternate one and two cells, or true distance. Hex grids count hexes; with no grid, distances are straight lines at the grid size per unit step. Scene settings edit all three; new scenes take them from the system (`GameSystem.scene`). The ruler measures cell to cell, draws between cell centres and reads out "15 ft". Systems list token sizes in cells (`GameSystem.sizes`; Dungeon World's Tiny, Small, Human-sized, Large and Huge), and Token options has a Size picker that resizes the token and snaps it to the grid. Distances between tokens are edge to edge (`scene/measure.ts`: neighbouring cells are 5 ft apart, diagonally too, and a big token measures from its nearest cell), and `inRange()` sorts a distance into normal range, long range or out of range, ready for actions in step 3. Targets are not kept between actions: an action that's aimed at someone declares it (`ActionDef.target`: a prompt, how many at least and at most, and an optional range), and using it first raises a bar above the hotbar with the move's name, the actor and what to target. Clicking tokens on the map targets them (past the maximum, the oldest drops off); each shows as a ring with sight ticks in the player's colour, shared through presence so the table sees what's being aimed at, and as a chip in the bar with its distance from the actor's token (red if out of range). Make the move goes on to any stat or bond question, then rolls; the card lists the targets with their distances. Cancel or Escape backs out. Dungeon World's Hack and Slash, Volley, Defend, Parley, Aid or Interfere, Lay on Hands, Arcane Art and Turn Undead ask for targets. _Token names and bars (Oct 27):_ a token's stat bars (HP) and name are drawn in screen space under it, following the zoom but within set sizes: bars 36 to 84 px wide (their numbers only from 44 px), names 11 to 15 px. Bars that would overlap other bars, names that would overlap other names or shown bars, and everything under tokens smaller than 24 px on screen, show only while the token is hovered. Token options can hide a token's name and its health bar.

**M6 status:** notes and polish: notes with a GM vault, per-paragraph secrets, Dungeon World Fronts, fog of war, campaign export and import, 3D dice, and loading systems from a URL or file. Started early as M5 and moved here when M5 became D&D. _Notes, first part (Oct 26):_ the Notes tab lists pages in folders (Sessions and World to start, under fixed ids so peers never make two; more can be added, renamed and deleted, and pages dragged between them). Each page's text is a Yjs subdocument edited with TipTap (`@tiptap/*` 3.32, bound with `@tiptap/y-tiptap`), saved in its own IndexedDB database and synced like a scene; undo comes from Yjs history, so it only takes back your own edits. Typing `[[` offers notes, characters, scenes, items and moves, and inserts a link chip that shows its target's current name (struck through if the target is gone); clicking it opens the page or sheet, switches to the scene, or finds the item or move in the Libraries. Each page records its outgoing links in the campaign index, so a page lists the pages that link to it ("Linked from") without loading them. The Characters and Notes panels share one two-column layout (`ui/TwoPane.tsx`).

_GM vault and session pages (Oct 27):_ GM-only pages live in the GM vault, a Yjs document of its own (`src/notes/vault.ts`) stored only on GM devices and synced over a separate Trystero room whose key is kept in the vault itself, never in the campaign, so players' devices never receive it. They share the campaign's folders and show with a secret-book icon and a GM tag; the GM makes them with New GM page (or from a folder's menu). "Reveal to players…" copies a page's entry and text into the campaign under the same id, so links keep working, then drops the vault copy; it can't be hidden again. A link to a GM-only page placed in a shared page stores no title, and players see it as "Unavailable". `/session start` makes a "Session N" page in Sessions with Recap, Highlights and Loose threads headings. Only the campaign's creator is a GM so far, so the vault's room has nobody else to sync with until GMs can be added. Not yet: live carets (the map cursors already use the awareness `cursor` field), per-paragraph secrets, exporting a session's log into its page, Dungeon World Fronts, fog of war, export/import and 3D dice.

## Open questions

Each question has a proposed default; the first four are the ones that change the architecture.

- [ ] **Sync between sessions:** pure P2P (edits spread only when peers overlap), or also an optional always-on relay peer the group can self-host? _Decided (Oct 25): pure P2P now, relay designed in as a plug-in provider._
- [ ] **Signalling:** public relays via Trystero (zero setup, depends on third-party Nostr/MQTT servers) or a tiny self-hosted signalling server? _Decided (Oct 25): Trystero, with a self-host option._
- [ ] **UI framework:** _Preact + Signals._
- [ ] **Browser support:** is Chromium-first acceptable (native `corner-shape`, OPFS, WebGPU), with Safari/Firefox on fallbacks? _Decided (Oct 25): yes._
- [ ] **Plugin trust:** unsandboxed JS plugins (“only install what you trust”) acceptable for now? _Default: yes._
- [ ] **Move automation:** outcome side effects (damage, XP, hold) offered as buttons, or applied automatically? _Default: buttons._
- [ ] **Dungeon World scope for v1:** all eight classes, or Fighter, Thief, Wizard and Cleric first? _Default: four first._
- [ ] **Player scene browsing:** may players view scenes the GM is not showing? _Default: yes, GM can disable._
- [ ] **Name:** makeamove
- [ ] **Where the code lives:** \~/makeamove

- [x] **Layout: the original list or the M0 build?** _Decided (Oct 25): keep the M0 layout; the editable action hotbar is planned for M4._

## Decision log

Decisions made while building M0 to M4, newest first. Earlier answers are recorded in Open questions.

| Decision                                                                                                    | Why                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Characters live in a root-doc `characters` Y.Map, not a subdoc each                                         | A campaign has a handful of characters; one doc keeps sync and persistence simple. Revisit if sheets grow large    |
| Move suggestions (XP, damage) are buttons on the card, never applied automatically                          | The GM stays in charge of fiction and consequences                                                                   |
| Hotbar: drag to reorder, drag off to remove (Alt+arrows, Delete by keyboard)                                               | Keyboard-accessible, and simple; drag can come later                                                                 |
| Dungeon World text is abridged from memory and must be checked against the SRD                              | The data is in one file (`src/systems/dungeon-world.ts`) so it is easy to correct; credit is in the system's attribution |
| Move 3D dice to M6; M3 shows rolls as 2D cards                                                              | dice-box can't land on a predetermined result, which shared rolls need; picking a replacement can wait for M6      |
| Chat lives in 500-message chunk subdocuments, ordered by a hybrid logical clock                             | Long campaigns stay fast to open, and peers agree on order even when their clocks disagree                         |
| No blind rolls; whispers are hidden from the GM                                                             | If a player shouldn't see a result, the GM can roll it; “hidden from others” includes the GM                        |
| Quick dice pool for 1 s before rolling                                                                      | Several dice from the bar (2d20, d20 + d6) become one roll and one chat entry                                       |
| Build the command palette before the hotbar, on one shared action index                                     | Both need a searchable list of moves, items and tools; the hotbar becomes pinned index ids instead of a second list |
| Render the canvas on demand; commit drags on release                                                        | An idle table uses no GPU; each drag is one undo step and, from M2, one update for peers                             |
| Token portraits use texture fills, not masks; the world is a render group                                   | Per-token stencil masks slow down in the hundreds, and the camera becomes one GPU transform (from the PixiJS skills) |
| The UI always tints from the main map; the canvas colour is Auto (a dark shade of the map) or the GM's pick | Tinting is never worth turning off; what people want to choose is the colour around the map                          |
| Small square images become tokens, the rest maps                                                            | No mode to pick when dropping files; right-click swaps them                                                          |
| Shapes and text tools move out of M1; the ruler and pings go to M2                                          | M1's scope was maps, tokens, freehand and undo; measuring and pinging are presence, which needs peers                |
| Keep the M0 layout; add an editable action hotbar at the bottom centre in M4                                | The built layout works; the hotbar needs character moves, which arrive with the Dungeon World plugin                 |
| Scene menu grows with CSS on live elements, not a view transition                                           | It stays hoverable and clickable while it opens                                                                      |
| Lobby backdrop: scattered Game-icons that occasionally swap, never overlapping                              | Playful and on-theme without looking like a grid                                                                     |
| Cut tagline and other marketing or explanatory copy                                                         | The UI should explain itself                                                                                         |
| Sidebar resizes from its inner edge; windows from every edge and corner, with whole-pixel geometry          | Only the bottom-right grip is drawn; the cursor shows the rest                                                       |
| Panels clip their children with `overflow: clip`, not `contain: paint`                                      | Keeps bevelled corners without trapping `position: fixed` children                                                   |
| View transitions for docking, tab switches (directional slides), sidebar and page swaps                     | Shows where things go; tab slides mirror the tab order                                                               |
| Icons: Game-icons first, Material Symbols Rounded (filled) as fallback, bundled                             | Weighty, on-theme, works offline                                                                                     |
| A new M5 for D&D 5.5e and a general rules engine; notes and polish move to M6                           | A second system tests the plugin API; tactical rules (targets, range, turns) are best designed in before more polish |
| Campaign actions live in a menu at the start of the tool strip, not the Scenes tab                           | They're about the campaign, not scenes, and stay reachable whichever tabs are open                                   |
| Presence avatars move into Chat; avatars are circles                                                        | Keeps the top edge clear                                                                                             |
| Panels stay solid; no hover fade                                                                            | The fade made panels harder to read                                                                                  |
| No hairline borders anywhere                                                                                | Tone and spacing separate regions                                                                                    |
| Drag a tab or docked title out to float a panel; drop it on the sidebar to dock                             | Direct manipulation; no pop-out button                                                                               |
| Two sidebars (left: characters, right: chat) with vertical tabs; tools on the top edge; tabs move between sides or float | Character sheet beside the map and chat opposite; tools out of the way of both                                  |
| Right sidebar with vertical tabs, sliding in from the edge; dice tray inside Chat                           | Tabs read as one column with the content                                                                             |
| Edge-docked elements sit flush; icon strips end in full diagonals                                           | Chrome reads as part of the window frame                                                                             |
| Cabin and Fraunces, no small caps                                                                           | Your preference                                                                                                      |
| Ctrl/Cmd + \\ hides the chrome, not Tab                                                                     | Tab stays free for keyboard navigation                                                                               |
