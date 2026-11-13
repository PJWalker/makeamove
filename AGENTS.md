# Project Instructions

- This project is in active development, not a production system. Prefer improving the underlying design over preserving historical implementation decisions.
- Do not consider backwards compatibility. Breaking changes are good if they improve the design. It is ok if existing campaigns break. Don't write migration code.
- A broken or incompatible item (a scene element, character, item, note, etc.) must never break the whole app. Log the problem to the console once, naming the item and what's wrong with it, and leave that one item out (or show it as unavailable) while everything else carries on. Leave its stored data untouched. Check it once, where it's read from storage or a peer, by declaring it in the schema layer (src/data/schema.ts: field guards, and a collection's `parse`, as `parseElement` in src/scene/schema.ts does), rather than scattering guards through the code that uses it.
- Prefer clean code to unchanging code. When changing functionality, consider whether the current name still reflects its purpose; if not, rename it across the codebase using the TypeScript language server.
- Keep the codebase coherent. Prefer using existing components in new places over introducing parallel approaches. Refactor existing code instead of working around it.
- Use consistent interfaces across the app. Avoid multiple slightly different versions of components, and especially avoid inconsistent interactions.
- Give immediate feedback: settings and options apply as soon as they change, so the user sees the effect straight away and undo reverses it. Text fields commit on blur or Enter. Only use Save/Cancel dialogs when a change truly can't apply piecemeal (such as a multi-step creation that would leave half-made state, or an expensive or destructive action that needs confirming).
- Prefer browser APIs, established packages, and framework patterns over custom solutions. Support current versions of Chrome & Safari, don't worry about older ones.
- Prefer composition over inheritance and favor small, reusable components and functions.
- Avoid duplicating logic; extract shared functionality into utilities or hooks.
- Keep components focused on a single responsibility and avoid bloated components.
- Minimise ad-hoc guards and band-aid solutions.
- When something needs to expand to cover a new use case, look to generalise the overall behaviour where possible, rather than switching between multiple branches / implementations.
- Always look for chances to simplify code, including code next to what you're working on. Where you see special cases, look for the general rule that covers them all, and replace the special cases with that rule. If a simplification is larger than the task at hand, point it out.
- When requirements are ambiguous, make reasonable assumptions for minor details and ask about consequential decisions.
- Explain significant design trade-offs concisely, and ask the user for input.
- Animate UI that appears and disappears. Dialogs, pop-ups, menus and option rows grow out of the control that spawned them and shrink back into it when they close; where there's nothing to go back into (a context menu that has closed, a keyboard shortcut), fade out while shrinking slightly. Keep it snappy (roughly 120–240 ms, easing out) and respect reduced motion. Prefer view transitions (src/ui/transition.ts) that share a `view-transition-name` between the spawner and what it spawns, over hand-rolled animation. Use the shared helpers rather than one-off animations: openPopup/closePopup for pop-up windows, and showFromOrigin and leave in src/ui/morph.ts for anything else.
- Animate changes on the scene canvas tokens - when something about a token changes (its stats, its conditions, its turn), play out the change so players notice it, rather than just redrawing the new state. Respect reduced motion. See src/scene/barChange.ts and src/scene/render/conditions.ts for the house style.
