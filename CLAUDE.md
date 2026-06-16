# Bitsplash

A 2D platformer game running in the browser on an HTML `<canvas>`, built with a
hand-rolled Entity-Component-System (ECS) and the **planck** physics engine
(JavaScript port of Box2D).

## Tooling

This project uses **Bun**, not npm/node. Run commands with `bun`:

- `bun install` — install dependencies
- `bun run dev` — start the Vite dev server
- `bun check` — verify changes: lint, format, and typecheck (`oxlint --fix`, `oxfmt`, `tsc -b`)
- `bun run build` — typecheck (`tsc -b`) and build (`vite build`)
- `bun run preview` — preview the production build
- `bun run fix` — lint and format (`oxlint --fix` then `oxfmt`)

Linting/formatting is via **oxlint** + **oxfmt** (not ESLint/Prettier).
TypeScript is configured across `tsconfig.app.json` (app) and the root
`tsconfig.json`. Vite + React (`@vitejs/plugin-react`, React Compiler) host the
canvas.

## Project

Reference README.md for more information about the project, what goals we have, what rules to follow, etc.

## UX decisions are not yours to make

NEVER make a user-experience decision without asking the user directly first. This applies to
anything that shapes how a user (game author or player) experiences a flow: error handling and where/how
failures surface, field interaction, validation behavior, when/whether something blocks an action,
notifications, navigation, and the like. When such a choice arises, stop and ask — even if a default seems
obvious, and even mid-task. This is crucial across **all** parts of the project (editor, game runtime,
serialization, save/load — each may have different consumers with different needs; do not lock one
decision across all of them).

Exception: trivial, conventional accessibility/correctness choices (e.g. "a clickable element should be a
`<button>`") are fine to make without asking.
