# fantasy-platformer

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
