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

## Debugging & validation

Do not declare something fixed until you have validated it. A change is
"done" only when a check that failed before the change passes after it.

- **Reproduce first.** Before fixing, make the failure observable — ideally a
  test that fails today. Fixing by inspection and declaring victory is how the
  same bug returns three times.
- **Prefer headless integration tests over isolated unit tests** for anything
  stateful: lifecycle, serialization, save/load, scene entry/exit, camera. Boot
  a real `ECS` + the relevant systems with no Electron, step N frames with
  scripted input, then `capture → construct a fresh Runtime → restore →
continue stepping → assert`. `test/support/sequence-harness.ts`
  (`SequenceFixture`) is that harness; extend it rather than mocking pieces.
- **Test the artifact, not just the mechanism.** A filter/guard can be green in
  isolation while the real product it protects (a committed `*.scene.json`, a
  save blob, an exported level) is already corrupt — often because a second
  code path bypasses the guard. Assert against the actual artifact so a leak on
  any path fails CI.
- **When behavior is genuinely visual** (framing, feel) and can't be asserted
  headlessly: add temporary `console` logging, run `bun run dev`, read the
  stdout, then remove the logs. State in your summary what you ran and what the
  output showed — never infer that pixels are correct from code alone.

## Serialization provenance

`serializeWorld(ecs)` serializes a world **whole** — every serializable
component, including transient runtime state (camera pose, sequence run-state).
It has one meaning and one code path: there is no scope parameter and no
per-component `runtime` flag. The two serialization products are separated by
_which world is serialized_, never by filtering components:

- **Runtime snapshot** (save-games, scene freeze/thaw, cutscene skip/resume) —
  serialize the live world whole. Cameras, fades, and running sequences are
  captured so a mid-cutscene save resumes correctly.
- **Authored scene document** (`*.scene.json`) — produced **only** by
  `SceneDocument.save()`: replay the scene's edit journal onto its file-derived
  baseline in a **scratch world that has never simulated**, then serialize that
  scratch world whole. No live world — and never a simulating one — is ever
  serialized into a scene file.

Because the journal records only authored edits (the command router poke-routes
runtime-entity edits live-only, never journaling them), the scratch world holds
only authored entities, so serializing it whole yields authored data _by
construction_. The authored artifact has exactly one writer
(`SceneDocument.save`); provenance is enforced by construction, not by call-site
discipline, and guarded by:

- the **command router** (`SceneDocument.record`) — edits to document entities
  are journaled; edits to runtime-spawned entities poke the run world live-only
  and are discarded on stop;
- the **save tripwires** (`SceneDocument`) — a round-trip check on every save
  and, while idle, a replay-diff check against the live edit world; both
  hard-crash rather than write a corrupt file.

**Never** reintroduce a component-type blocklist, an `instanceof` check, or a
serialize "scope" to keep runtime state out of level files — the
journal-onto-scratch construction is what makes leaks unrepresentable.

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

- Document APIs using JSDoc comments. Clearly document what things do, don't be too verbose. Provide examples. Public APIs missing comments should have them added.
- No inline comments, except for very specific cases of required but inpenetrable code to explain it. Note that code that's not autological should initially be treated as a candidate for refactoring so it's clear, and only if that genuinely won't work or produces way more LOC, then a comment is ok.
- Comments can and _will_ rot. Make sure any code you touch is reflected in the comments surrounding it, if at all. Prefer removing comments if they're not longer correct instead of trying to fix them. Same two rules above apply.
- Do not handroll your own components for the editor UI; check `base-ui` (https://base-ui.com/llms.txt) first.
- When picking npm packages, prefer common, well-maintained ones over handrolling.
- **Do not use memory**: Do not use the memory tool or any persistent memory store — it corrupts reasoning silently. Anything important to the way we work must live in AGENTS.md, not in memory.
- **UX decisions are not yours to make**: Never make a user-experience decision without asking the user first. This applies to anything that shapes how a user (game author or player) experiences a flow: error handling and where/how failures surface, field interaction, validation behavior, when/whether something blocks an action, notifications, navigation, and the like. When such a choice arises, stop and ask — even if a default seems obvious, and even mid-task. This applies across all parts of the project (editor, game runtime, serialization, save/load). Exception: trivial, conventional accessibility/correctness choices (e.g. "a clickable element should be a `<button>`") are fine to make without asking.
- **No sliders in player-facing game UI.** This rule is scoped to the **game
  runtime's** player-facing settings/options; the **editor UI is exempt** —
  sliders there are fine when appropriate. In the game, any player-configurable
  numeric value (sensitivities, input thresholds, timings, rates) is entered as a
  raw number input with an explicit unit label, and — where the raw value is an
  opaque
  coefficient — a live preview and/or a meaningful derived unit (e.g. `cm/360°`
  for aim sensitivity, `ms` for input timings, with a "hold/tap here to feel it"
  test affordance). Validate only against the invalid domain (e.g. `> 0`); never
  clamp to arbitrary min/max ranges. Arbitrary floors/caps (the classic
  can't-go-below-0.1 sensitivity slider) exclude users for no reason. Irreversible
  or accident-prone actions triggered by a hold surface a visible progress fill
  rather than firing silently.
