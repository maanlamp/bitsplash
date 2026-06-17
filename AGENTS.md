# Bitsplash

A 2D platformer game running in the browser on an HTML `<canvas>`, built with a
hand-rolled Entity-Component-System (ECS) and the **planck** physics engine
(JavaScript port of Box2D).

## Tooling

This project uses **Bun**, not npm/node. Run commands with `bun`:

- `bun install` — install dependencies
- `bun run dev` — starts Vite and Electron together; opens the editor as a desktop app (not a browser tab)
- `bun check` — verify changes: lint, format, and typecheck (`oxlint --fix`, `oxfmt`, `tsc -b`)
- `bun run build` — typecheck (`tsc -b`) and build (`vite build`)
- `bun run preview` — preview the production build (the web game, not the editor)
- `bun run fix` — lint and format (`oxlint --fix` then `oxfmt`)

Linting/formatting is via **oxlint** + **oxfmt** (not ESLint/Prettier).
TypeScript is configured across `tsconfig.app.json` (app) and the root
`tsconfig.json`. Vite + React (`@vitejs/plugin-react`, React Compiler) host the
canvas.

Always run `bun check` before declaring a task complete.

## Directory Structure

```
src/
  desktop/          # Electron main process + preload (IPC bridge)
  editor/           # Editor UI (React); never imported by engine or game
    audio/
    font/
    sprite/
    styles/
    systems/
    timeline/
    workspace/
  engine/           # Reusable engine; never imports editor or game code
    animation/
    assets/
    audio/
    bt/
    components/
    dialogue/
    fsm/
    gl/
    ink/
    input/
    render/
    scene/
    serialization/
    systems/
    tilemap/
  game/             # Game-specific code; never imports editor code
    assets/
    components/
    entities/
    fsm/
    ink/
    levels/
    prefabs/
    quest/
    quests/
    scenes/
    systems/
  style/            # Global CSS reset, tokens, body defs
docs/
  plans/            # Detailed architectural plans per system
```

## Architectural layers

The codebase is split into three strict layers. Dependencies only point inward:

```
Engine <- Editor
Engine <- Game
```

**Engine** may import: engine modules, third-party libraries, browser/platform APIs.
**Engine** must never import: editor code, game code.

**Editor** may import: engine modules, editor modules, third-party libraries.
**Editor** must never import: game code.

**Game** may import: engine modules, game modules, third-party libraries.
**Game** must never import: editor code.

Violating these boundaries is never acceptable, regardless of convenience.

## ECS rules

- Behavior lives in **systems**, not in component classes or object hierarchies.
- **No entity hierarchy, ever.** No parent/child relationships, no scene graph trees. Entities relate by id-references stored in components; multi-entity constructs are spawned and wired by id from a system.
- Use the established decorator/registry patterns (`@serializable`, `@valueType`, `@fsm`). No inline `instanceof` special-casing.
- Prefer **data-driven** content (JSON scenes, prefab files, metadata-in-assets) over imperative code for anything that is authored content.

## Conventions

- No comments.
- Do not handroll your own components; check `base-ui` (https://base-ui.com/llms.txt) first.
- When picking npm packages, prefer common, well-maintained ones over handrolling.

## Editor UI

Full styling rules are in `docs/EDITOR_STYLING.md`. Key points:

- **No inline `style={{}}`** for static values. Use CSS modules colocated with their component.
- For dynamic per-render values, pass a CSS custom property via `style` and consume it in the stylesheet.
- **Spacing:** `var(--unit-N)` tokens only. Never hardcode px or rem.
- **Type:** `--text-xs…2xl` and font role tokens (`--font-body`, `--font-heading`, etc.).
- **Borders are never 1px.** Minimum is `var(--border-width)` (2px).
- **Floating surfaces are always glassy.** Use `@include g.glass-surface(...)` from `src/editor/styles/_glass.scss`. Never hand-roll `backdrop-filter`.
- Every visual state change is animated — `--duration-fast` (100ms) and `--ease-standard`.
- Modal dialogs use `surface.dialogPopup`, are viewport-centred, and are driven by an `open` prop — never `{cond && <Dialog/>}`.

## UX decisions are not yours to make

Never make a user-experience decision without asking the user first. This applies to anything that shapes how a user (game author or player) experiences a flow: error handling and where/how failures surface, field interaction, validation behavior, when/whether something blocks an action, notifications, navigation, and the like. When such a choice arises, stop and ask — even if a default seems obvious, and even mid-task. This applies across all parts of the project (editor, game runtime, serialization, save/load).

Exception: trivial, conventional accessibility/correctness choices (e.g. "a clickable element should be a `<button>`") are fine to make without asking.
