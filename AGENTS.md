# Project Instructions

- This project is in active development, not a production system. Prefer improving the underlying design over preserving historical implementation decisions.
- Do not consider backwards compatibility. Breaking changes are good if they improve the design. It is ok if existing campaigns break. Don't write migration code.
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
- When requirements are ambiguous, make reasonable assumptions for minor details and ask about consequential decisions.
- Explain significant design trade-offs concisely, and ask the user for input.
- Animate changes on the scene canvas tokens - when something about a token changes (its stats, its conditions, its turn), play out the change so players notice it, rather than just redrawing the new state. Respect reduced motion. See src/scene/barChange.ts and src/scene/render/conditions.ts for the house style.
