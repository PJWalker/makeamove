# Make a Move

A local-first, peer-to-peer virtual tabletop. Dungeon World is the first game system.
Design doc: <https://claude.ai/artifact/6detFmrS8TMt5hUcUSGr6C>

## Run It

```sh
npm install
npm run dev
```

`npm run build` type-checks and produces an installable PWA in `dist/`.
`npm test` runs the unit tests (Vitest).

## Layout

- `src/store/` – Yjs documents persisted to IndexedDB: the device identity, the
  local campaign registry, and the campaign root document (members, scene index);
  plus the content-addressed image store in OPFS (`blobs.ts`).
- `src/scene/` – the scene canvas: each scene's Yjs sub-document (`sceneDoc.ts`),
  the PixiJS renderer, the input controller, and pure maths for the grid,
  camera, geometry, and strokes (unit-tested in `__tests__`).
- `src/table/` – the tabletop shell: scene bar, tool palette, sidebar, dice tray,
  and `SceneCanvas.tsx`, which is lazy-loaded so PixiJS stays out of the lobby.
- `src/lobby/` – campaign list and creation.
- `src/styles/` – design tokens (okLCH, tinted by `--scene-hue`), bevelled
  components (`corner-shape: bevel` with a `clip-path` fallback) and layouts.

## Icons

All icons come from `src/ui/icons.tsx`, named by meaning. Game-icons.net is
used first; Material Symbols Rounded (filled) fills the gaps. Both are compiled in at build time by `unplugin-icons`. Game-icons.net is CC BY 3.0, so keep the credit in the Help dialog.

## Shortcuts

- `V H P E` – select, pan, draw, erase (shapes, text, measure, ping, and fog come later)
- Space + drag or middle-drag – pan; scroll or pinch – zoom; `Shift+1` fit, `Shift+0` 100%
- `Ctrl/Cmd + Z`, `Ctrl/Cmd + Shift + Z` – undo and redo your own changes
- `Ctrl/Cmd + D` duplicate, `Delete` delete, arrows nudge (Shift for a cell), Alt-drag to move a token off-grid
- `Ctrl/Cmd + \` – hide or show all UI chrome

Drop or paste images onto the canvas: small square ones become tokens, the rest maps.
Right-click for everything else. In dev builds the scene controller is on `window.mamScene`.

## Status

M0 (foundations) is done. M1 (scenes and canvas) is complete; next is M2, peer-to-peer play.
