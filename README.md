# Make a Move

A local-first, peer-to-peer virtual tabletop. Dungeon World is the first game system.
Design doc: https://claude.ai/artifact/6detFmrS8TMt5hUcUSGr6C

## Run it

```sh
npm install
npm run dev
```

`npm run build` type-checks and produces an installable PWA in `dist/`.

## Layout

- `src/store/` – Yjs documents persisted to IndexedDB: the device identity, the
  local campaign registry, and the campaign root document (members, scene index).
- `src/table/` – the tabletop shell: scene bar, tool palette, sidebar, dice tray.
- `src/lobby/` – campaign list and creation.
- `src/styles/` – design tokens (OKLCH, tinted by `--scene-hue`), bevelled
  components (`corner-shape: bevel` with a `clip-path` fallback) and layout.

## Icons

All icons come from `src/ui/icons.tsx`, named by meaning. Game-icons.net is
used first; Material Symbols Rounded (filled) fills the gaps. Both are compiled
in at build time by `unplugin-icons`. Game-icons.net is CC BY 3.0, so keep the
credit in the Help dialog.

## Shortcuts

- `V H P R T M G F` – canvas tools (F is GM-only fog)
- `Ctrl/Cmd + \` – hide or show all UI chrome

## Status

Milestone 0 (foundations) is done. Next: M1, the PixiJS scene canvas.
