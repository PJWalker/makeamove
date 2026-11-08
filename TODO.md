# Make a Move — TODO

What's left before Make a Move is a complete, publishable virtual tabletop. Drawn from `design.md` (roadmap, improvement opportunities, open questions) and checked against the code on 2026-11-08. Ordered by priority within each section.

## 1. Before a public release (blockers)

- [x] **Campaign backup and restore.** `.makeamove` export/import (Settings → Backup, lobby), plus a live backup folder via the File System API (Chromium only) in `campaign/folderBackup.ts`.
- [ ] **Licensing review of bundled rules text**, per system (DW1, DW2 beta `paths.ts`, D&D 5.5e SRD, Blades SRD, Daggerheart SRD). Remove or gate anything not redistributable.
- [ ] **Purge `Dungeon-World-2-Beta-v3.docx` from git history** if it must not ship with the repo.
- [ ] **TURN fallback** for strict NATs (the Trystero transport has no ICE server config).
- [ ] **Clear message for stale or dead invites.** With the epoch dropped from invite links, an old invite opens an empty campaign and waits forever; show a timeout state that explains no peer has the campaign.
- [ ] **Commit or finish the current working tree** (combat panel, condition animations in `scene/render/conditions.ts`, `sheetParts`, D&D sheet, panel tests; `tests/zz-probe.spec.ts` deleted).
- [ ] **Deploy pipeline.** CI has no deploy job; add one for the static PWA (e.g. GitHub Pages) once licensing is settled.
- [ ] **README** with what the app is, how to run it, and how to join a campaign. Only `design.md` exists.

## 2. Core table features

- [ ] GM-editable visibility and lock flags on notes, tokens, maps and characters (scene elements have `locked`; nothing else does, and nothing has visibility).
- [ ] Claim a character as your player character: default subject for actions, own sidebar tab with its avatar as the icon.
- [ ] Reroll entry in the roll card context menu (reroll exists as a card control in `RollCards.tsx`, not in the menu).
- [ ] GM "pull everyone to this scene" control.
- [ ] More than one GM: promote a member to GM and share the vault key with them (only the creator can be GM today).
- [ ] Room key rotation when a player is removed.
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

## 4. Game systems

- [ ] **Dungeon World:** complete starting and advanced class moves, level-up move selection, spell preparation; Fronts, Dangers and Steadings as note templates; "choose N" move options as checkboxes.
- [ ] **Dungeon World 2:** automate remaining class/Path passives, Struggles, class-change reassignment, magic item and Artifact selection.
- [ ] **Daggerheart:** tier-specific advancement slot quotas, equipment restrictions, downtime and death workflows, feature-use tracking.
- [ ] **Blades in the Dark:** named crew and playbook catalogs beyond the SRD toolkit, structured claims/factions/cohorts, creation dot constraints, score and downtime bookkeeping.
- [ ] **D&D 5.5e:** multiclass progression, feature and condition automation, monster actions, legendary and recharge workflows, remaining spell-specific behaviour.
- [ ] **Triangle Agency** (new): Agency/Anomaly character model, d4 resolution, campaign rules.
- [ ] **PF2e** (evaluate): rules coverage, actions, proficiency and conditions.

## 5. Decisions to settle (M5 open questions)

- [ ] Automation: attacks and saves resolve against targets automatically, GM applies damage and conditions from the card? Default: yes.
- [ ] Movement: track movement per turn and opportunity attacks? Default: leave to the table.
- [ ] Multiclassing in the first version? Default: later.

## 6. Code health

- [ ] Split large mixed-responsibility files: each system's `index.ts` (stats, actions, derive, catalog — as `dungeon-world-2/` started), `table/diceRenderer.ts` into its own dice module, `table/SceneCanvas.tsx`.
- [ ] Move per-campaign module stores (16 modules, plus `setBlobFetcher`) onto the `Campaign` object or a context.
- [ ] Fold `core/` and `src/graphics.ts` into existing modules.
