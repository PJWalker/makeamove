# Make a Move

Make a Move is a shared tabletop for role-playing campaigns. Create a campaign,
invite your group, and prepare scenes with maps, grids, tokens, and drawings.
Keep characters, moves, rolls, and conversation together as you play. Dungeon
World, Dungeon World 2, D&D 5.5e, Blades in the Dark, and Daggerheart are supported systems.

## Run It

```sh
npm install
npm run dev
```

`npm run build` type-checks and produces an installable PWA in `dist/`.
`npm test` runs the unit tests (Vitest). For browser workflows (Playwright),
install the browsers once and then run the suite:

```sh
npx playwright install chromium webkit
npm run test:e2e
```

Use `PLAYWRIGHT_PORT=5175 npm run test:e2e` to test against an isolated dev
server while another server is running. System coverage and remaining rules
work are tracked in [design.md](design.md#system-roadmap).

## UI Foundation

The interface uses React and headless React Aria controls with the existing CSS
theme. Signal state uses `@preact/signals-react`; Vite applies its compiler
transform to subscribe components automatically. Yjs remains the collaborative
data model.

Segmented choices and popup tabs support arrow-key navigation and a single Tab
stop. Searchable pickers retain focus in search while navigating results;
Escape clears a nonempty query before dismissing the picker. Context-menu
actions close immediately, without the former hold-release selection or blink.
Colour pickers remain embedded in light menus.

## Token Transfers

Drag a linked token from the canvas onto a compatible panel target to move it:
items into inventory, moves onto character sheets, characters into relationships,
or entity links into notes and chat. Supported entities can also be pinned to the
hotbar. Hold Command or Control when releasing to keep the original token on the
scene. Only the token is removed by a move, not the underlying campaign entity.
Invalid drops and Escape leave the token where it started.

## Icons

All icons come from `src/ui/icons.tsx`, named by meaning. Game-icons.net is
used first; Material Symbols Rounded (filled) fills the gaps. Both are compiled in at build time by `unplugin-icons`. Game-icons.net is CC BY 3.0, so keep the credit in the Help dialog.
