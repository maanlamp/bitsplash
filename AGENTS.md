# Bitsplash

A 2D platformer game running in the browser on an HTML `<canvas>`, built with a
hand-rolled Entity-Component-System (ECS) and a **physics** layer behind an
engine-owned abstraction (`src/engine/physics/`), backed by **Rapier**. Game and
editor code never reference the physics backend directly.

## Tooling

This project uses **Bun**, not npm/node. Run commands with `bun`:

- `bun install` — install dependencies
- `bun run dev` — starts Vite and Electron together; opens the editor as a desktop app (not a browser tab)
- `bun check` — verify changes: lint, format, and typecheck (`oxlint --fix`, `oxfmt`, `tsc -b`)
- `bun test` — run the test suite (Bun's built-in runner)
- `bun run build` — typecheck (`tsc -b`) and build (`vite build`)
- `bun run preview` — preview the production build (the web game, not the editor)
- `bun run fix` — lint and format (`oxlint --fix` then `oxfmt`)

Linting/formatting is via **oxlint** + **oxfmt** (not ESLint/Prettier).
TypeScript is configured across `tsconfig.app.json` (app) and the root
`tsconfig.json`. Vite + React (`@vitejs/plugin-react`, React Compiler) host the
canvas.

Always run `bun check` before declaring a task complete.

## Testing

Tests run on Bun's built-in runner (`bun test`). Test files live in `test/`
(outside `src/`), named `*.test.ts`. They are typechecked by `tsc -b` via a
dedicated `tsconfig.test.json` (referenced from the root `tsconfig.json`) that
includes `test/` and pulls in `@types/bun` for the `bun:test` module.

Write tests for **stateful / simulation logic** — AI, FSMs, anything whose
behavior emerges over many frames and can't be trusted by reading the code
alone. Reaching for the running app to check such logic is slow and
unreliable; a stepped simulation is fast and repeatable. The enemy AI
(`test/enemy-brain*.test.ts`) is the reference example, using two tiers:

- **Logic / FSM tests** exercise a pure definition directly (e.g. the enemy
  brain's transition table), including _invariants_ such as "every engaged
  state can reach `patrol` once the target is gone" — this is what guards
  against dead-end states.
- **Integration tests** construct a real `ECS`, add the actual components, and
  step the real systems (e.g. `EnemyBrainSystem` + `StateMachineSystem`) over
  many frames with **scripted inputs** (perception, nav status) in place of
  physics. This covers the system seam — parameter derivation, transitions,
  and actuation together — which is where behavior bugs actually live.

When fixing a behavior bug, add a test that fails before the fix and passes
after. Run `bun test` alongside `bun check` before declaring behavior work
complete.

## Project architecture

Within `engine/` and `game/`, code is organized as **vertical feature
slices**: one folder per feature holding all of its code — components,
systems, FSM defs, renderers (e.g. `game/health/`, `game/quest/`,
`engine/camera/`, `engine/tilemap/`). There are no type-based buckets
(`components/`, `systems/`); never create one. Core engine primitives
(`ecs`, `world`, `vector2`, ...) live at the engine root.

Rules:

- One class per file; file name is the class name in kebab-case
  (`health-component.ts`, `patrol-def.ts`, `quest-marker-render-system.ts`).
- Named exports for components and systems.
- New code joins the feature slice it belongs to; a new feature gets a
  new slice folder.
- Authored data (JSON, `.ink`, art, fonts, audio) goes under
  `game/content/`, never next to code. Code slices are pure code.

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
- Use the established decorator/registry patterns: `@serializable("Name")` on the class (components _and_ value types) + `@serialize(options?)` to opt a field into persistence. No inline `instanceof` special-casing.
- State machines are **code-defined** with `defineMachine<Ctx>()({ … })` from `engine/fsm/machine` (a pure, hierarchical kernel — no decorator, no registry). Each feature owns its run-state via an embedded `MachineState` value type (`engine/fsm/machine-state`) on its own component, statically imports its machine const, and calls `step()` itself; the kernel reports `entered`/`exited` and the feature system performs the side-effects. The guard context is transient — rebuilt each frame from real components, never serialized.
- Prefer **data-driven** content (JSON scenes, prefab files, metadata-in-assets) over imperative code for anything that is authored content.

## Conventions

- No comments.
- Do not handroll your own components; check `base-ui` (https://base-ui.com/llms.txt) first.
- When picking npm packages, prefer common, well-maintained ones over handrolling.
- **Do not use memory**: Do not use the memory tool or any persistent memory store — it corrupts reasoning silently. Anything important to the way we work must live in this file (AGENTS.md), not in memory.
- **UX decisions are not yours to make**: Never make a user-experience decision without asking the user first. This applies to anything that shapes how a user (game author or player) experiences a flow: error handling and where/how failures surface, field interaction, validation behavior, when/whether something blocks an action, notifications, navigation, and the like. When such a choice arises, stop and ask — even if a default seems obvious, and even mid-task. This applies across all parts of the project (editor, game runtime, serialization, save/load). Exception: trivial, conventional accessibility/correctness choices (e.g. "a clickable element should be a `<button>`") are fine to make without asking.
