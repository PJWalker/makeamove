# Project Instructions

- This project is active development, it's not a production system. Prefer improving the underlying design over preserving historical implementation decisions.
- Do not consider backwards compatibility. Breaking changes are good if they improve the design. It is ok if existing campaigns break.
- Keep the codebase coherent. Prefer improving existing implementations over introducing parallel approaches. Refactor existing code instead of working around it. When changing functionaly, consider whether the current name still accurately reflects its purpose and update it across the codebase if not.
- Prefer established language and framework patterns over custom solutions.
- Prefer composition over inheritance and favor small, reusable components and functions.
- Avoid duplicating logic; extract shared functionality into utilities or hooks.
- Keep components focused on a single responsibility and avoid bloated components.

- When requirements are ambiguous, make reasonable assumptions for minor details and ask about consequential decisions.
- Explain significant design trade-offs concisely, and ask the user for input.
