# Make a Move \- Tabletop VTT Design Doc

## Overview

Local-first, peer-to-peer virtual tabletop that runs as a PWA. Every participant holds a full copy of the campaign, works offline, and merges edits with peers when connected.

A generic core, with plugins for specific game systems. Dungeon World is the first, but we should consider the possibility of D\&D 5.5E, Daggerheart, PF2e, Blades in the Dark, and other systems.

## Goals

- Infinite-canvas scenes with maps, tokens and freehand drawing, editable by everyone at once.
- Character sheets, moves, inventories, and items whose effects change stats or grant moves.
- Characters come as PCs (class, moves) and GM-made NPCs (HP and system-defined fields). They live in a two-pane panel with shared folders, and selecting a character's token opens its sheet.
- Dice roller, with every roll and triggered move posted to a shared chat log.
- Session and world-building notes
- A game-system plugin API, currently used by the built-in Dungeon World and D\&D 5.5e systems; Daggerheart, PF2e and Blades in the Dark are possible future systems.
- Works with zero servers we operate beyond a tiny, replaceable signalling relay.

## Non-goals

- Secure secrecy for shared campaign data. GM-only notes use a separate vault document; other campaign data is shared with peers and may be inspected by their clients.

## UI Design

- Typefaces: Cabin and Fraunces, no small caps
- Body text at 1rem.
- Edge-docked elements sit flush; icon strips end in full diagonals
- Game-icons & Material Symbols as icon sources
- Context menus expose every relevant action (verb) available for their object, including actions otherwise available only through row buttons, hover controls, or keyboard shortcuts. Reuse the same action handlers and respect the same permission and availability rules.

## Architecture

Each browser runs the whole app against a local Yjs CRDT store persisted to IndexedDB; peers exchange Yjs updates over a WebRTC mesh, and large binaries (map images) travel separately as content-addressed blobs. No server holds game state.

| Layer | Choice | Why |
| :---- | :---- | :---- |
| Language / build | TypeScript, Vite, PWA (service worker via vite-plugin-pwa) | Installable, offline after first load |
| UI framework | Preact \+ @preact/signals (TSX) | Signals bridge cleanly to Yjs observers for fine-grained updates; \~4 KB; React libraries via preact/compat; TSX for plugin authors (decided Oct 25\) |
| Canvas | PixiJS v8 (WebGL, WebGPU when available) \+ a custom camera | Handles large maps and hundreds of tokens at 60 fps; tldraw needs a commercial licence for production |
| Freehand strokes | perfect-freehand | Pressure-aware, tiny, renders to polygons |
| CRDT | Yjs (+ y-indexeddb for persistence, awareness protocol for presence) | Mature, fast, rich types (Map, Array, Text), subdocument support |
| Rich text | TipTap 3 (ProseMirror) bound to Yjs with @tiptap/y-tiptap | Collaborative editing for notes and sheet text; the same editor (without Yjs) is the chat box |
| Peer transport | WebRTC data channels; signalling via Trystero (public Nostr/MQTT relays) | Zero-ops by default, swappable |
| Blob store | Origin Private File System (OPFS), keyed by SHA-256 | Dedupes; fetched from any peer that has it |

## Documents and sync topology

- One *campaign root* Y.Doc: campaign settings and defaults, the member list (each member's name, colour, role, chosen character and hotbars), the scene index, the note index (titles, folders, outgoing links), character folders, entity graphic overrides, and the characters themselves (see Data model).
- One subdocument per scene, per note page and per chat-log chunk, each in its own IndexedDB database. Peers load them lazily, so a big campaign does not have to sit in memory.
- A separate *GM vault* Y.Doc that only GM devices hold, synced over its own Trystero room whose key is kept in the vault, never in the campaign. It holds GM-only note pages. This gives real (if casual) secrecy almost for free; everything else is "hidden in the UI" only.
- Presence (cursors, pings, rulers, laser trails, the tokens a player is targeting) goes over the Yjs awareness channel and is never persisted.

## Joining and identity

- The GM creates a campaign, which mints a random campaign ID and a shared room key. The invite link is `https://app/#join=<id>.<key>`; the key stays in the URL fragment, so it never reaches any server.
- Signalling and all peer traffic are encrypted with that room key, so public relays see only ciphertext.

## Assets

- Dropping an image hashes it, stores it in OPFS and writes only `{hash, mime, width, height}` into the CRDT.
- Images are re-encoded to WebP and capped (e.g. 8192 px) on import, then stored by SHA-256 in OPFS (Cache Storage where OPFS can't write).
- Small, squarish images become tokens; anything else is placed as a map at its own size. Right-click swaps one for the other.
- A peer that lacks a blob asks connected peers for it and receives 64 KB chunks over a dedicated data channel;

## Data model

Every entity has a stable ULID. What a game system owns lives in sub-maps the core doesn’t touch.

| Entity | Lives in | Key fields |
| :---- | :---- | :---- |
| Campaign | root doc | name, system id, members {name, colour, role, character, hotbars per character}, active scene, defaults (grid type, token style), entity graphics keyed by entity kind and id, last announced scene, session count |
| Entity graphic | root doc `entityGraphics` map | entity kind and id -> built-in icon name or blob reference; one shared graphic for lists, windows, sidebars and map tokens |
| Scene | own subdoc | name, visibility, canvas colour (or Auto), grid {type: none/square/hex, size, offset, unit per cell, unit name, diagonal rule}, elements (Y.Map by id) |
| Scene element | scene subdoc | id, type (map, token, drawing, shape, text, wall, light, area), layer (map, under, token, over), centre, size, rotation, z (fractional index), locked, createdBy; tokens add name, graphic, entity reference, colour, style, characterId, hideName, hideBars |
| Character | root doc `characters` map | kind (pc or npc), name, owner, folder, class, level, token style; the system's `scores`, `data`, `resources`, `conditions`, `modifiers` and NPC `fields`; `learned` actions; `inventory`; rich text `text:*`; `template` or `base` |
| Item definition | the game system (listed in the Libraries) | id, name, description, weight, uses, tags, effects, active (carried, equipped, always), icon |
| Item instance | the character's `inventory` map | id, defId, name, description, weight, tags, uses left, equippable, equipped, effects, default icon, order (fractional index) |
| Action definition | the game system | id, name, category, class, trigger, text, target spec {prompt, min, max, range}, steps (a check: stat or ask, outcome text per result, follow-ups per result) |
| Chat message | chat chunk subdoc | id, author, HLC, kind (text, roll, move, system), payload; text carries links as `@[text](kind:id)`; move cards carry the roll, result, outcome, follow-ups and targets |
| Note page | own subdoc (GM pages: the vault doc) | title, folder, order, Y.XmlFragment body; its outgoing links are kept in the note index for backlinks |

## Conventions

- *Ordering* uses fractional indices (strings) so concurrent reorders do not conflict.
- Timestamps use a hybrid logical clock (src/lib/hlc.ts) so orderings are stable across peers.
- *Derived values* (effective stats after item modifiers, scene colour) are computed locally and never stored, so they cannot drift.
- *Rich text* (note pages, long sheet fields) is a Y.XmlFragment, so several people can write in it at once.
- *Entity graphics* are campaign-level overrides keyed by entity kind and id. A graphic is either a built-in icon name or a blob reference; lists, windows, sidebar tabs and dropped map tokens resolve the same value. System and library icons are defaults, not separate user customizations.
- *Plugin data versioning (planned):* each plugin ships migrations keyed by its own schema version; the core runs them when a newer plugin opens older data. Until the first release, data formats change freely and old test data is simply replaced.

## Scenes and the infinite canvas

A scene is an unbounded 2D world rendered by PixiJS, with pan (drag / space-drag / two-finger), zoom to cursor (0.05× to 8×), and a fixed stack of layers that keeps maps under tokens under drawings.

## Layers (bottom to top)

1. *Background* — scene colour or tiled texture.
2. *Map* — one or more placed images; usually locked after setup.
3. *Grid* — optional square or hex overlay, snap-to-grid for tokens.
4. *Drawing (under)* — terrain marks, spell areas.
5. *Tokens* — characters and NPCs. Names, system stat bars, condition pips and the active-turn marker are drawn in screen space.
6. *Drawing (over)* — annotations, arrows, text.
7. *Vision and lighting* — light, shadow and token line-of-sight masks.
8. *Presence* — other users’ cursors, pings, laser trails, measuring rulers and target rings (awareness only, never stored).

## Tools

Select, move, rotate and scale; pan; draw and erase; use shapes, text, the ruler and ping; or place walls and lights. Shapes include rectangles, circles, lines and cones. The GM's wall and light tools control dynamic lighting and token sight.

**Performance:** viewport culling, texture mip-mapping for large maps, drawings cached to render textures once finished, and CRDT updates batched per animation frame. Drag movements are sent via awareness while dragging and committed to the CRDT on release, which keeps history small.

**Scene colour:** when a scene opens, we sample its main map (downscaled to 64×64, k-means in OKLab) to pick a dominant hue, or use the GM’s override. That colour drives the UI tint (see UI section).

**Undo** is per user via Y.UndoManager scoped to that user’s own changes, so undoing never reverts someone else’s move.

- Each scene is a subdocument of the campaign root with its own IndexedDB database, loaded only while it is open. Its id is derived from the campaign and scene ids, so two peers upgrading a scene at once converge on one document.
- The canvas renders on demand rather than every frame, so an idle table costs no GPU time. Drags preview locally and commit to the CRDT once on release, as one undo step.
- Entity graphics can be a built-in icon or an imported image. Changing a character, item, move or library entry's graphic updates its lists, windows, sidebar tab and any linked tokens on open scenes. A character sheet has one stand-in token: click it to choose its graphic, or drag it onto the map to place a linked token. Unlinked tokens keep their own graphic.
- A token can be tied to a character (Token options → Character).
- Tokens snap to cell centres (even-sized tokens to intersections) and resize in whole cells; Alt places them freely. Maps keep their aspect ratio unless Shift is held.
- The interface always takes its tint from the scene's main map (or from the canvas colour when there's no map). The canvas colour defaults to Auto, a darkened, muted version of the map's dominant colour; the GM can pick any colour instead in Scene settings or from the scene list.
- Grid lines are drawn twice, dark then light, so they read on both dark and light maps, and fade out as cells get too small.
- Tokens have two styles: round (image cropped to a circle on a coloured background with a border) or the image as it is, for cut-out art. Built-in icons use the round style. Double-click a token for Token options: graphic, name, style and colour. The GM sets the style for new tokens, and the grid type for new scenes, in Campaign settings.

## Measuring, sizes and targets

- A scene's grid has a unit per cell (5 ft by default), a unit name, and on square grids a diagonal rule: every diagonal counts as one cell, diagonals alternate one and two cells, or true distance. Hex grids count hexes; with no grid, distances are straight lines at the grid size per unit. New scenes take these from the system (`GameSystem.scene`); Scene settings change them.
- The ruler measures cell to cell, draws between cell centres and reads out the distance ("15 ft").
- Systems list token sizes in cells (`GameSystem.sizes`); Token options has a Size picker that resizes the token and snaps it to the grid.
- Distances between tokens run edge to edge (`scene/measure.ts`): neighbouring cells are one cell apart, diagonally too, and a big token measures from its nearest cell. `inRange()` sorts a distance into normal range, long range or out of range.
- Targets belong to one action at a time (see Characters, moves and items). While an action asks for them, clicking tokens targets them; each target shows as a ring with sight ticks in the player's colour, shared through presence so everyone sees what's being aimed at.

## Token names and bars

The game system's `tokenStats(character, derived)` says what the token shows. (For example, Dungeon World gives an HP bar) Bars sit under the token and update as the sheet changes.

A token's name and stat bars are drawn in screen space, so they stay readable at any zoom. Bars straddle the token's bottom edge, 11 to 17 px tall, half again as wide as the token where that clears every other token's bars (otherwise just inside its width, never under 36 px; the numbers show from 44 px). Names are 11 to 15 px. Bars that would overlap other bars, names that would overlap other names or bars, and everything under tokens smaller than 24 px on screen show only while the token is hovered. Token options can hide a token's name or its bars for everyone.

**Scene switching:** each player can choose a scene independently. A GM's scene change is announced in chat with a Go there action; a group-wide pull-to-scene control is not implemented.

## Characters, moves and items

A character’s *effective* state is computed on every change: base data from the sheet, plus the effects of every active source (equipped items, conditions, class features), resolved in a fixed order. The sheet shows base and effective values side by side.

**Effect model** (shared by items, conditions and features)

| Effect type | Example | Applied as |
| :---- | :---- | :---- |
| `modify` | Ring of Strength: STR \+1 | path, operator (add, multiply, set, min, max), value, priority |
| `grantMove` | Holy Symbol grants *Turn Undead* | move id added to the character’s move list while active |
| `grantTag` | Chain mail: *clumsy* | tag added; other rules can read it |
| `rollBonus` | Fine sword: \+1 forward to Hack and Slash | move or tag selector, bonus, duration (ongoing / forward / until used) |
| `resource` | Healing potion: 3 uses | counter on the item instance; consumed by an action |
| `script` | anything exotic | a named function the plugin exports, called with (base, effective, ctx) |

Built so far: `modify`, `grantMove`, `grantTag` and `rollBonus`; item uses and the system's resources cover `resource`, and `script` is planned. Effects carry an `active` condition: `equipped`, `carried`, `always`, or a plugin predicate. The resolver applies `set` first, then `add`, then `multiply`, then `min`/`max` clamps, within each priority band, and records which source changed each value so the sheet can explain “Damage d10 \= class d6 → Fighter feature d10”.

**Actions** (Dungeon World's moves) are definitions from the game system: a name, trigger, rules text and category, an optional target spec, and steps. Today the one kind of step is a *check*: the system's base roll plus a stat (or a stat or number the player picks), read out as one of the system's results with its outcome text. Using an action:

Everything an action asks before it rolls appears in one speech bubble beside the control that started it (a sheet's roll button, a hotbar slot, a move's glyph; a hotbar key counts as its slot), with a tail pointing at it. It grows out of that control and shrinks back into it, like a chat popup but faster (150 ms in, 110 ms out), since the user started it; it follows the control as sidebars slide, and sits above the hotbar when the control isn't on screen. × or Escape backs out.

1. If it's aimed at someone, the bubble names the action, the actor and what to target. Clicking tokens targets them (past the maximum, the oldest drops off); each shows with its distance from the actor's token, in red when out of range. Its button, labelled with the action's name, goes on.
2. Asks for any stat or number the check needs (Defy Danger's stat, Aid's bond), a roll mode if the system has them (5.5e: Normal, Advantage, Disadvantage) and an extra bonus, showing the formula as it will roll.
3. Builds the roll: base roll, stat modifier, bonuses from conditions and gear, the asked-for number, then standing modifiers (Forward is spent by the roll; Ongoing stays).
4. Rolls (see Dice) and posts a move card: the roll breakdown, the result, its outcome text, and the targets with their distances.
5. Offers the outcome's follow-ups (Mark XP, Roll damage) as buttons on the card, never automatic changes, so the GM stays in charge of the fiction.

In a sheet's move list each action has a gold glyph that turns into a button when hovered: a crosshair to target, a die to roll, an arrow to post its text. A character can also learn actions beyond what their system gives them: dropping a move onto them adds it to their `learned` list, and its window offers Forget.

**Individuals and templates.** An NPC is either an individual (every token is that one character, sharing its record across tokens and scenes) or a template, set under On the map on its sheet. Each token placed from a template, or duplicated from one of its tokens, is a *copy*: a character of its own with `base` set to the template, which starts with only a name. Like a subclass, anything changed on the copy's sheet (HP, a stat, a field, a condition, its gear, its text) is stored on the copy and overrides the template for that token alone; everything else follows the template as it changes. Sub-maps merge key by key; conditions, gear and rich text are taken whole once the copy changes them. Copies aren't listed under Characters, but selecting a copy's token opens its sheet, under a banner naming the template with a Reset button that drops every override but the name. Deleting a template deletes its copies. A template names each copy one of three ways: numbered (Goblin 1, Goblin 2), picked from a list in the template (numbered once the list runs out), or a random adjective before the name (Scarred Goblin), avoiding names already on the scene.

**Long text on sheets** (notes, Dungeon World's bonds, an NPC's long fields such as Moves) is rich text, edited together like a note page, with the same formatting and `@` links (see Notes).

**Inventories** are ordered lists of item instances on a character, shown as an Inventory section on every character sheet (player characters and NPCs) with the load it comes to. Gear and moves can be dragged onto a character (their inventory or moves section, or their row in the character list; only where you may edit them, outlined while you hover and flashing when it lands) from the Libraries, the command palette, the hotbar, a link in a note or the chat, or a pop-up's title-bar icon. An item's Add button and “Find items in the Libraries…” work too. Planned: drag between characters, and to and from the scene (an item token on the canvas). Load/weight totals come from the system.

**Libraries** are a tab listing everything the game system and plugins contribute, as named collections grouped by source: the system gives its gear, moves (by category), classes and tags; a plugin adds its own with `registerLibrary()` (`src/library`). Search covers names, then tags, then text; a filter narrows to one kind. Each entry has an icon and shows its text as a tooltip beside it, and morphs into a window when clicked. Icons are bundled at build time, so systems and plugins name one from a core vocabulary (`icon` on an item or class; `ui/entryIcons.tsx`), and anything unnamed gets its kind's icon. Gear and moves can be added to the selected character, dragged onto any character, pinned to the hotbar or dropped into text as a link. Later sources: the campaign's homebrew, and monsters.

**Ownership:** a character has one or more owners. Owners and the GM edit; others view (or see nothing, if hidden).

## Dice

The roller decides the result locally with a cryptographic RNG and writes it to the chat log. Every peer sees the same recorded result; rolls currently use animated 2D cards. Results never depend on physics.

- **Notation:** a small parser for standard notation — `2d6+2`, `d8+d4`, `4d6kh3`, `2d20kl1` (disadvantage), `d6!` (exploding), `b` / `w` for advantage-style “best of”. Plugins can register extra syntax.
- **Roll record:** `{formula, dice:[{sides, value, kept}], modifiers:[{label, value}], total, rollerKey, hlc}`. Each modifier keeps its label so the card can read “2d6 (4+5) \+ STR 2 \+ Ring 1 \= 12”.
- **Future:** 3D dice are deferred; the current 2D card animation works regardless of WebGL support.
- **Visibility:** public, or secret (the roller and the GM; a GM's secret roll is the GM's alone). Others see “Name rolled in secret.” There are no blind rolls: if a player shouldn't see a result, the GM rolls it.
- **Quick dice bar:** d4, d6, d8, d10, d12, d20, plus a free-form box; clicking a stat or move on a sheet rolls the right formula. Clicks gather into a pool for a moment before rolling as one entry (double-click the d20 for 2d20); right-click a die to take one back out.

`src/dice/notation.ts` parses and rolls `2d6+2`, `d8+d4`, `4d6kh3` (also `k3`, `b3`), `2d20kl1` (also `w1`), `4d6dl1` / `dh`, `d6!` (capped at 50 extra dice), `d%`, and `[labels]` on any term, with unbiased `crypto.getRandomValues` dice. Roll cards show the formula, note, dice and total; incoming rolls animate unless reduced motion is enabled. Plugin syntax is not implemented.

## Chat and move log

The right-hand sidebar is one chronological stream of chat, rolls and move cards, stored as append-only chunks (one subdoc per \~500 messages) so long campaigns stay fast.

- **Message kinds:** text (markdown-lite), roll card, move card (move name, trigger, roll breakdown, outcome band highlighted, outcome text, follow-up buttons), system (“Kira joined”, “Scene changed to The Bog”), whisper (to named members; hidden in UI from others).
- **Slash commands:** `/r 2d6+1`, `/w name text`, `/move defy-danger dex`, `/sr` for a secret roll, plus session, pin, timer and counter commands. Plugin-provided slash commands are not implemented.
- **Scene changes:** when the GM settles on a scene (stays 1.5 s, so passing through scenes or renaming one doesn't post), the log gets “Scene changed to The Bog”, with a “Go there” button for anyone on a different scene. Players aren't moved; that waits for the GM's “pull everyone” control. The last announced scene is kept in the campaign, so a reload doesn't repeat it, and a new campaign's first scene isn't announced.
- **Session markers:** the GM can start/end a session; the log groups by session and can export one as markdown into the notes. Earlier sessions fold into a band (“Session 2 · 34 messages”) until the reader opens them; the current session is always open.
- **Deleting:** players can delete their own messages, and the GM anyone's (including system notices and session markers). Right-click a message (or long-press on touch) for a menu with “Delete message”.  Deleting removes the message from the shared log for everyone.
- **Links:** the message box is a small editor (`table/ChatInput.tsx`): typing `@` or dropping something into it adds a link, sent as `@[text](kind:id)` and shown in the message as a link chip that behaves like one in a note. Dropping something anywhere else on the chat sends a link to it straight away. Notifications show the link's name.
- **Popups:** Whenever a message arrives while the Chat panel isn't visible, it pops out beside the tab as a speech bubble, its tail pointing at the tab.
  - This includes the user's own messages (eg a move they make)
  - The whole message is shown, including any outcomes or follow up buttons
  - It grows out of the tab, then shrinks back into it after 6 s; the timer waits while the pointer is on message.
  - Clicking the message (anywhere but its buttons and links) opens the chat.
  - If multiple messages come in, they form a 3D stack, the newest in front and older ones receding behind it.
  - Interacting with the stack, or opening the chat, counts as reading it and clears the tab's unread badge;
  - When the tab isn't on screen (the panel is floating or closed, or autohide has slid it away) the stack sits at the bottom center of the screen.
  - When the page is hidden (a background tab or a minimised window), other people's messages also send a system notification. A visible but unfocused window gets popups only

The log is a `chat` Y.Array of chunk subdocuments on the campaign root, 500 messages each, each persisted in its own IndexedDB database and synced by the session as soon as it loads; the newest two load on open, and older ones load as the reader scrolls up into them (no button). The panel renders only a window of rows (100 to start, at most 250), sliding it as the reader scrolls and keeping whatever is on screen in place as rows come and go; spacers stand in for the rest, at measured heights or the average (500 a chunk for those not loaded yet), so the scrollbar spans the whole history, and dragging it renders wherever it lands, loading chunks to get there. Messages are memoised, and move cards share one subscription to the characters, so a log of thousands costs about what a short one does (`table/ChatPanel.tsx`, `logRows` in `chat/sessions.ts`). Messages are immutable plain objects with a timestamp.

**Pinned messages:** a bevelled, solid scene-tinted panel floats over the top of the chat log with the window shadow and 12px insets. Text uses Fraunces at 1rem and wraps; emphasized text is gold. Timers, counters and GM unpin controls keep their behavior. The panel scrolls when it reaches 35vh or 320px.

 **Commands**: `/r` (public), `/sr` (secret: you and the GM), `/w name` or `/w gm`, `/me`, `/session start|end` (GM; numbered in the campaign), `/help`, and `//` to send text starting with a slash; typing `/` lists them. Text supports **bold**, *italic*, `code` and links, rendered as elements, never HTML.

**Quick dice bar**: A Public / Secret toggle; its clicks gather into a pool that rolls as one entry 1 s after the last change (each button shows its count, right-click takes one back out, and a "roll now" button fills as the moment approaches).
Whispers are hidden from everyone but sender and recipients, including the GM. Unread messages from others show as a count on the Chat tab. A player's first join posts “Name joined”.

## Notes

Notes are a folder tree of collaborative rich-text pages (TipTap over Yjs) with `@` links and backlinks.

- **Folders:** *Sessions* and *World* to start (under fixed ids so peers never make two); more can be added, renamed and deleted, and pages dragged between them. The Notes panel is a list and a page, like Characters (see UI).
- **Pages:** each page's text is a Yjs subdocument in its own IndexedDB database, synced like a scene; undo comes from Yjs history, so it only takes back your own edits. Markdown-style shortcuts format it (`#` headings, `**` bold, `-` lists, `>` quotes).
- **Links:** typing `@` offers notes, characters, scenes, items and moves and inserts a link chip showing its target's current name (struck through if the target is gone). A chip's tooltip says what it points at. Clicking it opens a pop-up out of that tooltip: gear and moves with their rules and a Give or Roll/Target button for the character you're playing, a character's sheet, a scene with Go to scene, or a page's text; a link from one page to another opens that page in the Notes panel instead. Right-clicking offers Open in sidebar, Open in a window (page-to-page links) and Edit link text…, which shows the link as other words until Use its own name. Chips drag like anything else (onto characters, the hotbar, other text, the chat), and anything dragged in becomes a link where it's dropped. The same links work in sheet text and chat (`table/richText.tsx`, `table/LinkPopups.tsx`).
- **Backlinks:** each page records its outgoing links in the campaign's note index, so a page lists the pages that link to it ("Linked from") without loading them.
- **GM-only pages** live in the GM vault (see Architecture). They share the campaign's folders and show with a secret-book icon and a GM tag; New GM page makes one. "Reveal to players…" copies a page into the campaign under the same id, so links keep working, then drops the vault copy; it can't be hidden again. A link to a GM-only page placed in shared text stores no title, and players see it as "Unavailable". Only the campaign's creator is a GM so far.
- **Session pages:** `/session start` makes a "Session N" page in Sessions with Recap, Highlights and Loose threads headings.
- **Planned:** pinning a page to a scene location, exporting a session's log into its page, and Dungeon World's Fronts, Dangers and Steadings as templates.

## Permissions

Edit permissions are enforced by the client UI, not by a peer-level write filter. Campaign documents are shared with connected peers. GM-only notes are stored in a separate vault document; general campaign data is not secret from peers.

- Roles are GM, Player and Observer. Character owners and the GM can edit a character; other players can view it.
- Scene elements can be locked. GM wall and light tools are hidden from players, while token sight can limit what players see when vision is enabled.
- General per-entity visibility flags and a CRDT write filter are not implemented.

## Plugin system

A game system is an ES module that exports a `GameSystem` object: mostly declarative data plus a few pure functions. The core provides characters, sheets, dice, chat, effects, targeting and storage; the system describes the rules. `defineSystem()` checks a system as it registers (unique ids, and every action's category, class, stat, outcomes and follow-ups exist) and throws with a list of problems. The shape today (`src/systems/types.ts`):

export const dungeonWorld: GameSystem \= {

  id: 'dungeon-world', name: 'Dungeon World', version: '0.1.0',

  stats,                         // id, name, abbr

  modifier: (score) \=\> ...,      // a stat score's modifier

  baseRoll: '2d6',

  rollModes,                     // optional other base rolls offered first (5.5e: advantage, disadvantage)

  results,                       // best first, each with a tone for the card: Full success, Partial success, Miss

  result: (total, natural) \=\> ..., // which result a check gets, from its total and the kept dice

  actions, actionCategories,     // actions with target specs and steps; categories say what fills a new hotbar

  followUps,                     // buttons on cards: bump a data field (Mark XP), or roll a formula (Roll damage)

  classes, items, tags,          // also listed in the Libraries

  conditions, modifiers,         // conditions with effects; standing roll modifiers (next roll, or until removed)

  resources,                     // counters with a derived maximum (HP); resets on rests later

  characterData, npcFields,      // the system's own fields with defaults; an NPC's fields

  sizes, scene,                  // token sizes in cells; units and diagonal rule for new scenes

  derive(c, sources) { ... },    // named values (max HP, armour, load) via the core effect resolver

  actionsFor(c, derived) { ... },// the actions a character has

  tokenStats(c, derived) { ... },// bars on its tokens

  attribution,

}

The built-in systems provide declarative `sheet` layouts. Third-party system loading, schema migrations and system-provided hooks are not implemented; chat commands and cards are currently core features.

- **Loading:** only the built-in systems currently ship with the app. Loading third-party systems from a URL or file is future work.
- **One system per campaign.** Switching system is a deliberate migration, not a toggle.
- **Homebrew without code:** the GM can add moves, items and effects through forms; they are stored in the campaign and use the same effect model.

## Dungeon World plugin

The built-in Dungeon World system (`src/systems/dungeon-world/`) covers six stats with modifiers, basic and special moves, all eight core classes, and gear with tags. Class-move coverage is partial; GM tools for Fronts remain future work. Dungeon World’s text is licensed CC BY 3.0 and is attributed in the app.

### Character sheet

- Stats STR, DEX, CON, INT, WIS, CHA as scores (3–18), with modifiers derived from the standard table (−3 to \+3), and the six debilities (Weak, Shaky, Sick, Stunned, Confused, Scarred) as conditions, each giving −1 to rolls with its stat.
- HP (max \= class base \+ CON score), Armor, Damage die, Level, XP (with “mark XP” on a 6-), Alignment, Race, Bonds, Load (max \= class base \+ STR mod), coin.
- Starting moves and a guided level-up flow once XP reaches level \+ 7. Class-move coverage remains partial.

### Moves

- Basic moves: Hack and Slash, Volley, Defy Danger, Defend, Spout Lore, Discern Realities, Parley, Aid or Interfere.
- Special moves: Last Breath, Encumbrance, Make Camp, Take Watch, Undertake a Perilous Journey, Level Up, End of Session, Carouse, Supply, Recover, Recruit, Outstanding Warrants, Bolster.
- Roll \= 2d6 \+ stat mod (+ forward/ongoing). Outcome bands 10+ / 7–9 / 6-, with each band’s text on the move card; “choose N” options as checkboxes are planned. Hack and Slash, Volley, Defend, Parley, Aid or Interfere, Lay on Hands, Arcane Art and Turn Undead ask for targets.
- Damage rolls use the class die plus tags (e.g. *\+1 damage*, *messy*, *piercing 2*).
- Hold and forward/ongoing tracked per character, decremented when spent.

### Items and tags

- Gear with weight, uses and tags (*close*, *reach*, *near*, *far*, *precise*, *ration*, *2 piercing*, …). Tags map to effects: *\+1 armor* → `modify armor +1`; *precise* → use DEX for Hack and Slash; magic items can `grantMove`.
- Adventuring gear uses (e.g. 5 uses) as an item resource.

### GM tools

- Planned: Fronts and Dangers note templates with grim-portent checklists and impending doom.
- NPCs with HP and the fields Dungeon World gives monsters (damage, armor, tags, instinct, moves), as individuals or templates (see Characters). Token sizes are its size tags: Tiny, Small, Human-sized, Large, Huge.

## D\&D 5.5e plugin and a general rules engine (M5)

The second system is D\&D 5th edition as revised in 2024 ("5.5e"), built from the System Reference Document 5.2 (CC BY 4.0, so its text can ship with attribution, like Dungeon World's). It is the test of the plugin API: anything 5.5e needs that Dungeon World also has, or that any tactical system would need, goes into the core; anything that is only 5.5e's arithmetic stays in the plugin. The aim is that a third system (Daggerheart, Pathfinder) needs data and formulas, not core changes.

### Core changes

1. **Systems as modules with a schema.** *(Done, but for migrations and loading from a URL.)* A registry of systems (built-in first; loading from a URL or file stays in M6) and a `defineSystem()` that checks a system's shape. A system declares its character data schema with defaults and its own migrations (see Plugin system).
2. **A generic character record.** *(Done.)* The core keeps only what every system has: name, owner, kind (player character or NPC), folder, token style, notes, inventory, conditions, resources, and a level. Its shared graphic is stored in the campaign's `entityGraphics` map. Everything else (ability scores, bonds, debilities, death saves, spell slots, proficiencies, hit dice) lives in a `data` map the system owns and the core never interprets. Dungeon World's fields move into its own `data`.
3. **Derived values from the system.** *(Done.)* `derive()` becomes a system function from the character and its active effects to named values (AC, max HP, attack bonus, spell save DC, initiative, load, carrying capacity, passive Perception), each with its explanation from the effect resolver, which stays in the core.
4. **Resources and rests.** *(Resources done; rests and resets with step 4.)* Counters with a maximum that reset on a named event: HP and temporary HP, hit dice, spell slots by level, pact slots, class resources (Rage, Ki, Channel Divinity), item charges and "uses". Resets are tags (short rest, long rest, dawn, turn, round), and the core offers Short Rest and Long Rest commands that the system wires up. Dungeon World's item uses and HP become resources too.
5. **Actions, not moves.** *(Started: actions with a check step, categories, follow-ups and target specs; costs, sources and the other steps with step 3.)* One action model for both systems: name, source (class, item, spell, feature), activation cost (action, bonus action, reaction, free, none), range, targeting (below), resource cost (a spell slot of some level, uses, ammunition), and a list of steps. Steps are generic: roll a formula, roll against a target number (attack vs AC, check vs DC), ask targets to save, roll damage with types, apply or offer effects. A Dungeon World move becomes one step ("roll 2d6 \+ stat, map the total to a band") with its band texts; the system supplies the band function as now.
6. **Targets and targeting.** *(Done, changed: targets are picked per action from a bar, not kept between actions; resolving per target comes with step 3.)* Each player can mark tokens as targets (shown as a ring in their colour and shared through presence, like cursors). An action with a targeting spec ("one creature within 60 ft", "up to three creatures", "self", "a 20 ft sphere") asks for targets when it is used, checks range on the scene, and resolves per target: one attack roll per target against that target's AC, one save per target against the caster's DC.
7. **Distance and scene units.** *(Done.)* A scene gets units per grid cell (5 ft by default) and a diagonal rule: 5.5e's default counts every diagonal as one square (Chebyshev); the alternating 5 / 10 ft rule and true distance are options. The ruler shows feet, range checks measure between token edges, and tokens get size categories (Tiny to Gargantuan → cells). Hex grids count hexes.
8. **Areas of effect.** *(Step 6.)* Templates as scene elements (cone, line, cube, sphere / emanation, cylinder), placed when an action needs one, listing the tokens they cover so the action can target them.
9. **Rolls.** *(Step 3.)* Advantage and disadvantage as a roll option (the notation already has `2d20kh1`), critical hits that double damage dice, damage types, and roll requests: a card that asks a target's owner to roll a save or check, with a button only they (or the GM) can press. The GM applies damage from the card (with resistance, vulnerability and immunity offered by the system); nothing is automatic, as with Dungeon World's suggestions.
10. **Conditions with durations.** *(Conditions with effects done; durations, pips and concentration with step 4.)* Conditions on characters and tokens (pips on the token), each with a duration: rounds, until the end or start of someone's turn, until removed, or concentration (dropped when the caster takes damage and fails, or casts another concentration spell; the core tracks it, the system supplies the check). Systems define their conditions and the effects each applies. Dungeon World's debilities can become conditions.
11. **Combat and initiative.** *(Step 4.)* A turn tracker: who's in the fight, initiative order (the system supplies the roll and tie-breaks), rounds, whose turn it is, and per-turn resets (reaction, movement, "once per turn" features). Systems without initiative, like Dungeon World, hide it.
12. **NPCs and monsters from the Libraries.** *(Partly done, changed: templates whose tokens are copies cover packs of monsters; stat blocks in the Libraries with step 6.)* A stat block is a library entry; placing one on the map makes a token with its own HP and conditions, unlinked from any character record, so a pack of goblins needs no sheets. A token can be promoted to a full NPC when it matters.
13. **Declarative sheets.** *(Step 5.)* The sheet is built from the system's layout of sections and field widgets (ability block, counter, gauge, resource track, action list, inventory, text, choice list), so most systems need no UI code; a system can still supply a component for an unusual section. Dungeon World's hand-written sheet becomes its layout.
14. **Character creation and levelling.** *(Step 5.)* A guided flow driven by system data: class, species, background, ability scores (standard array, point buy or rolled), and the choices each level grants. Dungeon World's class picker becomes a short version of the same flow.
15. **Bigger libraries.** *(Step 5.)* Spells, feats, species, backgrounds, classes with subclasses and level tables, monsters and magic items: hundreds of entries, so collections load lazily and search uses an index. Library entries can carry actions, so a spell or a weapon on the sheet is the same thing as in the Libraries.

### Kept in the 5.5e plugin

- The SRD 5.2 data: classes, subclasses and their level tables; species; backgrounds; feats; spells; weapons with their mastery properties; armour; adventuring gear; magic items; monsters; conditions; the rules glossary.
- The formulas: ability modifiers, proficiency bonus by level, AC from armour category, Dexterity cap and shield, attack and damage bonuses, spell save DC and attack bonus, initiative, passive scores, carrying capacity, hit points by class and level, multiclass spell slots, exhaustion (−2 per level to d20 tests in 2024).
- Spellcasting rules (prepared spells, slots, pact magic, rituals, cantrip scaling), Heroic Inspiration, death saving throws, and the sheet layout.
- Which conditions exist and what each does; damage types; creature sizes; the default diagonal rule.

### From Dungeon World: made generic, or kept

| Now in Dungeon World | Becomes |
| :---- | :---- |
| Stats and `modifier()` | Generic abilities; each system's own modifier rule |
| Moves, move list, move cards | Actions with steps; one card renderer for any step results |
| `band()` and strong / weak / miss texts | Kept: Dungeon World's result function and texts |
| Suggestions (Mark XP, Roll damage) | Generic follow-up buttons that a system defines per action or result |
| Forward and ongoing | Generic roll modifiers: one-shot or lasting (5.5e: Bless, Guidance) |
| Debilities | Conditions, defined by Dungeon World |
| Item uses, HP | Resources |
| Load and weight | A derived value and an item field any system may use |
| Classes with HP, damage die, load | Generic classes with features by level; numbers in each system's data |
| NPC fields | Stat blocks |
| Bonds, alignment, race, coin, XP rule | Kept: Dungeon World's character data |
| Fronts, Dangers, Steadings | Kept: Dungeon World note templates (M6) |

### Order of work

1. *Done (Oct 27):* port Dungeon World onto the general core with no change in behaviour: system registry and schema, the generic character record, system `derive()`, resources, actions with steps, roll modifiers and conditions.

2. *Done (Oct 27):* scenes: units, diagonal rules, token sizes, the ruler in feet, range checks, and targets. Along the way: individuals and templates, learned moves, and screen-space token names and bars.

3. *Done (Oct 28):* actions end to end. A check with `against: 'ac'` rolls once per target and reads each against that target's value (the system's `hits()`: 5.5e's natural 20 and 1); targets at long range roll with the system's `longRange` mode, which the opposite mode cancels; targets out of range can't be picked. A `save` step puts a roll request per target on the card, answered by that target's owner or the GM (with any roll mode) and kept in the campaign's `messageState` map; follow-ups that roll damage carry a damage type and the targets, and the roll card gives the GM buttons to apply it whole, halved or doubled (temporary HP first) or to heal (`table/CardParts.tsx`).

4. *Done (Oct 28):* combat. A Combat panel (hidden for systems without `initiative`) lists combatants in initiative order (ties by the initiative bonus); the GM adds tokens from their right-click menu (NPCs join hidden), rolls for NPCs, starts, steps and ends the fight, and players roll their own. The tracker lives in the `combat` and `combatants` root maps (`combat/combat.ts`, pure and tested; `combat/api.ts` wires it to characters). Conditions can be given for so many rounds, counted down at the start or end of a chosen combatant's turn; resources that reset on `turn` (5.5e's Reaction) refill when a turn starts. Concentration actions set the character's `concentration`, ending any other; damage applied to a concentrating character posts a concentration save (the system's `concentrationSave`), and failing it ends the spell. Tokens show a pip per condition (white for concentration) and a gold ring for whoever's turn it is. Short and Long Rest are palette commands.

5. *Done (Oct 28):* built-in 5.5e support (`src/systems/dnd55e/`): d20 tests, proficiency, combat rules, spell slots, class features, a starter spell and gear catalog, origins, subclasses, feats, guided character creation and levelling, and a declarative sheet. Coverage remains a subset of the SRD; the full spell and monster lists are not included.

6. Monsters and areas of effect: stat blocks, unlinked tokens, templates.

### Open questions for M5

- [ ] **Content:** SRD 5.2 only (free to ship), with homebrew forms for anything else? *Default: yes.*
- [ ] **Automation:** attacks and saves resolve against targets automatically, but damage and conditions are applied by the GM from the card? *Default: yes, as with Dungeon World.*
- [ ] **Movement:** track movement per turn and opportunity attacks, or leave them to the table? *Default: leave them, for now.*
- [ ] **Multiclassing** in the first version? *Default: later.*
- [x] **Diagonals:** default to 5.5e's one-square diagonals, with the GM able to switch per scene? *Decided (Oct 27): yes; the system sets the default and Scene settings switch it.*
- [x] **Targets:** kept by each player between actions, or picked for each action? *Decided (Oct 27): picked for each action; since Oct 28 in a bubble beside the control that started it.*

## Command palette and action index

A keyboard-first palette for finding and doing things without hunting through panels. Ctrl/Cmd \+ K opens a centred popover with one search field; typing filters a ranked list, Up/Down move, Enter runs the top choice, Escape closes. It is built **before the hotbar** in M4, because both read from the same **action index**.

**The action index** is one in-memory list of everything a player can do or look up, rebuilt when the campaign, the selected character or the system plugin changes. Each entry has:

| Field | Meaning |
| :---- | :---- |
| `id` | Stable id, such as `move:hack-and-slash` or `tool:ping`. The hotbar stores these, not copies |
| `kind` | `move`, `item`, `tool`, `command`, `entry` (compendium, notes, characters, scenes) or `setting` |
| `title` | Display name, plus `aliases` and `tags` for matching (*hack*, *H\&S*, *melee*) |
| `source` | Where it comes from: core, the game-system plugin, the campaign's homebrew, or the selected character |
| `available` | Whether it can run now (for example, a move the selected character doesn't have, or no character selected) |
| `run` | What happens on Enter: activate the move (see Characters, moves and items), start the tool, open the page |
| `open` | Optional secondary action, usually showing the entry's full text without running it |

- **Sources.** Core registers tools (select, pan, draw, ping, measure) and commands (fit to scene, undo, toggle chrome, new scene). The plugin's compendium (its Libraries) contributes moves, items, classes, monsters and tags. The campaign contributes characters, notes, scenes and homebrew. The selected character contributes their own moves and usable items, flagged so they rank first.
- **Ranking.** Fuzzy match on title, aliases and tags; then the selected character's own moves, recently used actions, and exact-prefix matches rise. Entries that are unavailable are shown dimmed with the reason, not hidden, so players can still read them.
- **Prefixes narrow the search:** `>` commands only, `/` moves, `@` characters, `#` notes and compendium entries. With no query it shows recent actions and the selected character's moves.
- **Moves run in place.** Choosing a move opens the same small input popover as from the sheet or hotbar, then rolls and posts a move card. Shift \+ Enter opens the move's text instead of rolling.
- **Visibility follows permissions.** Hidden characters, notes and GM-only compendium entries never enter a player's index (see Permissions).
- **Plugin hook.** A system can add its own entries through `index: { entries, aliases }`, so move text and tags become searchable without any UI code. The index is derived data and is not synced; every peer builds it from the same synced sources.
- **UI.** A bevelled panel in the usual style over the canvas, with a gold focus ring on the active row, each row showing an icon, title, source and shortcut hint. It animates like other popovers (about 280 ms) and respects reduced motion. The right-click menu and tool strip stay as they are; the palette is an extra way in, not a replacement.

The hotbar then becomes a pinned, ordered selection of index ids per character, so adding to it can be done from the palette (for example, Alt \+ Enter pins the highlighted action). Palette results also drag: onto the hotbar to pin them, and (moves, gear, characters and scenes) onto a character or into text like a link.

## UI and visual design

The canvas fills the window; all chrome floats over it as translucent dark panels tinted by the scene colour, with light text and a golden-yellow accent reserved for primary actions, selection.

**Interface text is succinct and purely functional.** Labels, buttons, placeholders and messages say what a thing is or does, and nothing else: no commentary, explanations of design decisions, reassurances, parentheticals, or asides ("a campaign plays one system for good" is out). Rules text from a system is content, not interface, and is exempt.

### Layout

- *Top centre, docked:* the tool strip, starting with the campaign menu (a hamburger button): Player settings…, Campaign settings… (GM only), Help and shortcuts…, a ticked item for each panel (Scenes, Chat, Characters, Libraries, Notes, Members; unticking one closes it), and Back to campaigns. It opens on the press below the button, like every menu, and its pop-ups morph out of their items.
- *Top edge, docked:* canvas tool strip — select, pan, draw, erase, shapes, text, measure, ping, walls and lights — with single-key shortcuts. It centres itself in the space between the sidebars.
- *Left and right edges, docked:* two sidebars with vertical tabs. By default Scenes and Characters are on the left and Chat, Libraries, Notes and Members on the right. The scene list (and, for the GM, the active scene's settings) is the Scenes tab; campaign actions are in the campaign menu. Tabs, tools and hotbar slots are picked up as soon as they are dragged and reorder along their bar, with a white line showing the drop point; the tool order is a per-device preference, and dropping a hotbar slot off the bar unpins it. Dragging a tab away from its strip floats it. There is no hide button: dragging a sidebar very narrow snaps it shut, and clicking its open tab toggles it. Each body slides in from past the window edge, pushing the tab strip ahead of it, and its inner edge can be dragged to resize it. Any tab can move to the other side (drag it onto that sidebar, or right-click it), float in a window, or be closed (right-click → Close, or untick it in the campaign menu); a closed panel comes back on its side when ticked again or when something needs it, such as a link to a page. A side with no tabs disappears until a window is dragged.
- *Chat panel:* dice tray above the message field; the message field takes `@` links.
- *Characters and Notes panels:* each is a list and a detail (a character's sheet, a note's page) with one layout choice, kept per device and per panel: **side by side** (the list's width can be dragged; double-click the divider to reset it), or **one at a time** (a stack: pick an entry to open it, go back to the list). A toggle in the title bar switches; when the panel is too narrow for two columns (under 381 px) it shows one at a time regardless, and the toggle stays in place, disabled, saying why. Both use one component, `ui/TwoPane.tsx`.
- *Customisability:* any panel can be dragged out into a floating window, resized from any edge, and docked back by dragging it to a sidebar; a window's close button closes the panel. Character sheets, item cards and note pages open as pop-ups.
- *Command palette:* Ctrl/Cmd \+ K opens a search over moves, items, tools, commands and library or campaign entries. See Command palette and action index.
- *Bottom centre:* the action hotbar — the selected character's moves and item actions, plus global actions like ping and measure — that each player can add to, remove from and reorder; keys 1 to 9 trigger its first slots. It pulls from the same action index as the command palette. Anything that drags (palette results, Libraries rows, links) can be dropped on it to pin it; a slot dragged off it can land on a character or in text, and anywhere else unpins it. What an action asks before it rolls appears in a bubble beside the slot.
- *Campaign list:* a lobby over a non-overlapping scatter of Game-icons that slowly swap.
- *Menus:* one shared menu component, for right-click menus (canvas, chat, characters) and the campaign menu, plus the scene menu. Menu text is 1rem. Every menu works as on macOS, on every platform: menus open on the press (right button for context menus, left for the campaign and scene menus), and holding, moving to an item and releasing chooses it, while releasing elsewhere closes the menu; a quick click leaves it open. Right-click menus open on the press even on Windows, where browsers would otherwise wait for the release; the keyboard menu key and touch long-press still open them. In the scene menu, releasing on a scene switches to it, and scene deletes (which have no confirmation) are never chosen by a release. An open scene menu sits above floating windows.
- *Lists:* one list design (`ui/List.tsx`) for every list of things in a panel: the character list and its folders, the Libraries' collections, and a sheet's moves and inventory. A row is a leading icon or avatar, a name, an optional tag chip (a stat, “NPC”) and quieter detail (weight, uses), then any buttons. Rows have no background: hovering turns the name and icon gold, and the selected row stays gold with a bar at its start. Groups (folders, collections) are foldable headings with a caret, an optional icon, the label and a count, with their rows indented beneath. Tags are tinted bevelled chips, not outlined boxes.
- *Pop-ups:* a pop-up emerges from the thing that spawned it and opens right there (from the spawner's top edge down, or where that won't fit, from its bottom edge up), not centred or anywhere else it would have to travel to. Menu items whose label ends in “…” open pop-ups, as on macOS: the menu closes at once and the item morphs into the dialog with a shared-element view transition. So do Scene settings in the Scenes tab and the campaign menu's items (player and campaign settings, help), and a move's tooltip morphs into its move window the same way when the move is clicked. The morphing box casts the window's shadow as it grows, so the shadow arrives with the window. Openers that can't run a transition still open in place and grow out of the spawner's rectangle. Only a pop-up with no spawner opens where it was last left, or centred. A pop-up that shows something (gear, a move, a sheet, a scene, a page, a linked token) has a *proxy icon* before its title, which drags like a link to it.
- *Anchored elements:* menus, the `@` list and pop-ups open below what they belong to, or above it when there isn't room below, and always stay inside the window (`ui/anchor.ts`). Tooltips open toward the middle of the screen or on a side the element asks for, and flip to the other side when they wouldn't fit.
- *Dragging things:* one drag (`table/entityDrag.ts`) carries moves, gear, characters, scenes and pages between the Libraries, the palette, the hotbar, links in text, pop-up proxy icons, characters, notes and the chat. A small copy of the thing follows the pointer, and the target under it is outlined, then flashes when it lands.

**Colour system (OKLCH, all derived from one scene hue `h`)**

| Token | Value | Use |
| :---- | :---- | :---- |
| `--surface` | oklch(20% 0.03 h / 0.82) \+ backdrop blur 12px | Panels |
| `--surface-raised` | oklch(26% 0.035 h / 0.9) | Popovers, active tab |
| `--surface-sunken` | oklch(14% 0.02 h / 0.7) | Inset fields, the dice tray and menu-footer bands |
| `--text` | oklch(93% 0.01 h) | Body text |
| `--text-muted` | oklch(72% 0.02 h) | Labels, timestamps |
| `--accent` | oklch(82% 0.15 85\) ≈ \#F0C23B | Primary buttons, focus ring, selection |
| `--accent-ink` | oklch(22% 0.04 85\) | Text on gold |

The hue transitions over 600 ms when the scene changes (`@property`\-registered custom property). Chroma stays low so that a vivid map never makes the UI garish, and text contrast is checked against the darkest and lightest tints (target WCAG AA 4.5:1).

### Shape language

- Buttons, inputs and panels use `border-radius` plus `corner-shape: bevel` (5px controls, 12px panels). Safari and Firefox get the same chamfer from a `clip-path` fallback.
- Prefer seperating regions separate by tone (sunken and raised fills) and spacing, rather than explicit borders.
- Use subtle alternating colour backgrounds for long lists.
- Panels clip their children (`overflow: clip`), so a tinted band at an edge never squares off a bevelled corner.
- **Edge-docked elements** sit flush against the window: no margin, no bevel and no outer edge on the docked side.
- **Icon strips** use a bevel as deep as the strip is wide, so each end reads as one diagonal running from the window edge.
- Primary button: gold fill, dark ink. Secondary: raised fill that turns gold on hover. Icon buttons: no chrome until hovered; gold tint when active.
- Avatars are circles; everything else is bevelled.

**Icons:** Game-icons.net first, with Material Symbols Rounded (filled) where no game icon fits. Generic glyphs like add, close and chevrons come from Material Symbols. Icons are compiled into the bundle at build time and named by meaning in one module, so swapping one is a one-line change. Small icons will be 22x22px, no smaller.

**Motion:** view transitions animate state changes where the moving parts can briefly become snapshots: docking a window into the sidebar, switching sidebar tabs (the content slides up or down to match the tab order), showing and hiding the sidebar, and lobby ↔ table. Anything the user may reach into mid-animation animates its live elements with CSS instead — the scene menu grows with `interpolate-size` and a `grid-template-rows` drawer, so it stays hoverable. Dialogs fade and rise in with `@starting-style`, and close by receding: shrinking slightly about their centre as they fade, as if sinking back into the table. Everything is about 280 ms and switches off under reduced motion.

**Type:** Cabin for controls and chat; Fraunces (optical sizing on, never small caps) for headings, move names and sheets.

## Milestone history

The roadmap changed as the application grew. These completed milestones record major implementation steps; the sections above describe current behavior.

### Completed work

1. **M5 step 3, actions end to end:** *Done (Oct 28).* Attacks per target against AC, saves as roll requests, long range, typed damage applied by the GM from the card.
2. **M5 step 4, combat:** *Done (Oct 28).* The turn tracker, timed conditions and pips, concentration, per-turn resets, rests.
3. **M5 step 5, the 5.5e plugin:** *Done (Oct 28).* Origins and subclasses as data, guided creation and levelling, declarative sheets, indexed libraries.
4. **M6, Notes Improvements:** *Done (Oct 28).* Secrets: the GM right-clicks text to make it secret, which moves it into the vault (a `secret:<id>` fragment) and leaves a placeholder in the page that players' editors don't show; the GM edits it in place, and can reveal or delete it. Live carets: each open subdocument can have its own awareness in the sync session (`awarenessFor`), sent only between peers with that page open, so notes show others' carets and names in their colours (GM pages through the vault's session). Images: pasted, dropped or inserted from the text menu, stored in the blob store like maps and fetched from peers (`table/noteExtensions.ts`).
5. **M7: Homebrewed:** *Done (Oct 28).* Interface text says gear, not items. A new Items panel (right sidebar) lists the campaign's homebrew gear and moves, kept in the root `homebrew` map, with forms to make, change and delete them: gear with weight, uses, tags, an icon, equippable, and effects (a bonus to rolls, optionally with one stat, or an amount added to a derived value); moves with a kind, trigger, text, an optional check (a set stat or one chosen when made) with an outcome per result, and targets with a range. `systemOf()` merges homebrew into the system (rebuilt only when homebrew changes), so homebrew is given, learned, linked and made like the system's own; the Libraries keep showing only the system's.
6. **M8: Canvas Creativity**: *Done (Oct 28).* The Shapes tool (R) drags out squares (corner to corner, Shift for square), circles (from the centre), lines and cones (from their origin, Shift for 45° steps), snapped to the grid and sized in whole cells, showing their size as they grow; they take the pen's colour and layer. The Text tool (X) types text where you click; double-click text to change it. Both are scene elements (`shape`, `text`) that select, move, resize and rotate like the rest. Actions can name an area (`TargetSpec.area`: sphere, emanation, cube, cone, line, in scene units); the targeting bubble offers to place it, the next press on the map puts it down (a drag aims a cone or line), it stays on the map under the tokens, and the tokens it covers, even partly, become the targets (`geometry.ts`: `shapeCovers`, `tokensCovered`). 5.5e's area spells and Breath Weapon have their areas. This also covers M5 step 6's areas; monster stat blocks remain.
7. **M9: Relationships**: *Done (Oct 28).* Every sheet, in any system, ends with a Relationships section: pick another character, say in a few words how this one sees them, and keep notes on it in rich text. Relationships are one-way (`relationships` map on the character, notes in `text:rel:<id>`). The web (campaign menu, palette, or Web on a sheet) draws everyone in a relationship as nodes with labelled arrows, laid out by a small force simulation (`characters/relationships.ts`); two-way pairs bow apart, nodes drag, and clicking one opens that character.
8. **M10: Chat Improvements**: *Done (Oct 28).* A message's menu offers Edit message (your own text; Enter saves, Escape cancels, and it's marked edited), Pin or Unpin message (GM), and Delete. `/pin text` sends a pinned message; `/timer 60s "World Ends"` (also `5m`, `1h30m`, `2:30`) posts a real-time countdown with a bar, which its starter or the GM can stop, resume or restart; `/count 0/8 "The cops arrive"` posts a counter with − and \+ (pips up to 12, a bar beyond), its maximum optional. Both pin themselves. Pins show in a strip above the log, where the GM unpins them. Messages stay immutable: edits, pins and the live state of timers and counters are in `messageState` (`table/ChatExtras.tsx`). Pins show for messages in the loaded part of the log.
9. **M12: Dynamics:** *Done (Oct 28).* The Walls (W) tool places wall segments that snap to grid corners and other walls' ends; Lights (L) places lamps with bright and dim radii. Right-click a wall to make it a door and open or close it (open doors don't block); right-click a light to pick its colour or make it flicker. Only the GM sees walls and lamps. Scene settings turn on dynamic lighting with a darkness level, where each light lifts the dark with a smooth falloff, stopped by walls with soft-edged shadows. Each lamp is drawn by a shader (`scene/lampShader.ts`, GLSL and WGSL) that accounts for how nearby walls occlude its disc. Player vision can be limited to line of sight from their character tokens; unseen tokens' names, bars and pips are hidden. The GM sees the darkness at half strength and does not use the player sight mask. Explored-area persistence, darkvision, per-token sight ranges and numeric light-radius editing are not implemented.

## Open questions

Each question has a proposed default; the first four are the ones that change the architecture.

- [x] **Sync between sessions:** pure P2P (edits spread only when peers overlap), or also an optional always-on relay peer the group can self-host? *Decided (Oct 25): pure P2P now, relay designed in as a plug-in provider.*

- [x] **Signalling:** public relays via Trystero (zero setup, depends on third-party Nostr/MQTT servers) or a tiny self-hosted signalling server? *Decided (Oct 25): Trystero, with a self-host option.*

- [x] **UI framework:** *Decided (Oct 25): Preact \+ Signals.*

- [x] **Browser support:** is Chromium-first acceptable (native `corner-shape`, OPFS, WebGPU), with Safari/Firefox on fallbacks? *Decided (Oct 25): yes.*

- [ ] **Plugin trust:** unsandboxed JS plugins (“only install what you trust”) acceptable for now? *Default: yes.*

- [x] **Move automation:** outcome side effects (damage, XP, hold) offered as buttons, or applied automatically? *Decided (Oct 26): buttons.*

- [x] **Dungeon World scope:** all eight classes are included; class-move coverage remains partial.

- [ ] **Player scene browsing:** players can choose scenes independently; scene visibility filters command-palette entries, but there is no GM setting to disable browsing.

- [x] **Name:** Make a Move (`makeamove`).

- [x] **Where the code lives:** `~/makeamove`.

## Decision log

Decisions made while building, newest first. Earlier answers are recorded in Open questions.

| Decision | Why |
| :---- | :---- |
| A pop-up showing something has a proxy icon in its title bar that drags like a link | As on macOS: the window's subject can be dropped anywhere a link can |
| Menus, lists and pop-ups open below their anchor, or above it when there's no room; tooltips flip side | Nothing anchored should ever open off screen |
| Links start with `@`; clicking opens a pop-up, except page-to-page links, which open the page | One gesture to see what a link is without leaving the page; reading on through pages stays in the panel |
| Long sheet text and the chat box use the notes editor; chat stores links as `@[text](kind:id)` | One linking and formatting model everywhere; chat stays plain text with markdown-lite |
| One drag for moves, gear, characters, scenes and pages, between every list, link, the hotbar, characters, notes and chat | Whatever you can see, you can drop where it's useful |
| Template tokens are copies: characters with `base` set, overriding the template field by field | Anything about one goblin can change from its sheet, and everything else follows the template |
| Token names and bars are drawn in screen space, at clamped sizes, and hidden when crowded | Readable at any zoom without crowding the map |
| Scenes have units and a diagonal rule; distances between tokens run edge to edge | Range checks work for 5.5e and other tactical systems |
| Dungeon World runs on a general rules core (M5 step 1\) before any 5.5e code | A second system tests the plugin API; porting the first proves it first |
| No data migrations until the first release | Test data is cheap to recreate; migrations would slow every change |
| Characters live in a root-doc `characters` Y.Map, not a subdoc each | A campaign has a handful of characters; one doc keeps sync and persistence simple. Revisit if sheets grow large |
| Move suggestions (XP, damage) are buttons on the card, never applied automatically | The GM stays in charge of fiction and consequences |
| Hotbar: drag to reorder, drag off to remove (Alt+arrows, Delete by keyboard) | Keyboard-accessible, and simple; drag can come later |
| Chat lives in 500-message chunk subdocuments, ordered by a hybrid logical clock | Long campaigns stay fast to open, and peers agree on order even when their clocks disagree |
| No blind rolls; whispers are hidden from the GM | If a player shouldn't see a result, the GM can roll it; “hidden from others” includes the GM |
| Quick dice pool for 1 s before rolling | Several dice from the bar (2d20, d20 \+ d6) become one roll and one chat entry |
| Build the command palette before the hotbar, on one shared action index | Both need a searchable list of moves, items and tools; the hotbar becomes pinned index ids instead of a second list |
| Render the canvas on demand; commit drags on release | An idle table uses no GPU; each drag is one undo step and one update for peers |
| Token images use texture fills, not masks; the world is a render group | Per-token stencil masks slow down in the hundreds, and the camera becomes one GPU transform (from the PixiJS skills) |
| The UI always tints from the main map; the canvas colour is Auto (a dark shade of the map) or the GM's pick | Tinting is never worth turning off; what people want to choose is the colour around the map |
| Small square images become tokens, the rest maps | No mode to pick when dropping files; right-click swaps them |
| Scene menu grows with CSS on live elements, not a view transition | It stays hoverable and clickable while it opens |
| Cut tagline and other marketing or explanatory copy | The UI should explain itself |
| Panels clip their children with `overflow: clip`, not `contain: paint` | Keeps bevelled corners without trapping `position: fixed` chil |
| View transitions for docking, tab switches (directional slides), sidebar and page swaps | Shows where things go; tab slides mirror the tab order |
| Icons: Game-icons first, Material Symbols Rounded (filled) as fallback, bundled | Weighty, on-theme, works offline |
| A new M5 for D\&D 5.5e and a general rules engine; notes and polish move to M6 | A second system tests the plugin API; tactical rules (targets, range, turns) are best designed in before more polish |
| Campaign actions live in a menu at the start of the tool strip | They're about the campaign, not scenes, and stay reachable whichever tabs are open |
| Presence avatars move into Chat; avatars are circles | Keeps the top edge clear |
| Drag a tab or docked title out to float a panel; drop it on the sidebar to dock | Direct manipulation; no pop-out button |
| Two sidebars (left: characters, right: chat) with vertical tabs; tools on the top edge; tabs move between sides or float | Character sheet beside the map and chat opposite; tools out of the way of both |
| Right sidebar with vertical tabs, sliding in from the edge; dice tray inside Chat | Tabs read as one column with the content |

## TODO

- [ ] Campaign Import/Export as a single `.makeamove` zip, for backups and moving between machines.
- [ ] Preserve Panel order when hiding/showing panels.
- [ ] Add visibility and lock flags to entities (Notes, Tokens, Maps, Characters) which the GM can edit
- [ ] At a player option to ‘claim’ a character as their Player Character. This will make that character the default subject for actions and add a sidebar tab for that character specifically (with its avatar as the icon)
- [ ] Add a ‘reroll’ entry to the context menu for roll cards.
