# Bitsplash

Bitsplash is a hand-rolled 2D game engine and its editor, focused on 2D platformers. It runs on an HTML `<canvas>` with a hand-rolled Entity-Component-System (ECS) and a **physics** layer. Game and editor code never reference the physics backend directly.

**Naming.** "Bitsplash" is the engine and toolchain, not the game. The game being built with it has the working title **Fantasy Platformer**; that is the name players see (start screen, game window title). Do not label the game itself "Bitsplash" — the engine namespace (`bitsplash.*`, `bitsplash-fs://`, the editor's own title bar) is a separate, correct use.

## Tooling

This project uses **Bun**, not npm/node. Run commands with `bun`:

- `bun install` — install dependencies
- `bun run dev` — starts Vite and Electron together; opens the editor as a desktop app (not a browser tab)
- `bun check` — verify changes: lint, format, and typecheck (`oxlint --fix`, `oxfmt`, `tsc -b`)
- `bun test` — run the test suite (Bun's built-in runner)
- `bun run build` — typecheck (`tsc -b`) and build (`vite build`)
- `bun run preview` — preview the production build (the web game, not the editor)
- `bun run fix` — lint and format (`oxlint --fix` then `oxfmt`)

Linting/formatting is via **oxlint** + **oxfmt** (not ESLint/Prettier). TypeScript is configured across `tsconfig.app.json` (app) and the root `tsconfig.json`. Vite + React (`@vitejs/plugin-react`, React Compiler) host the canvas.

## Testing

Tests run on Bun's built-in runner (`bun test`). Test files live in `test/` (outside `src/`), named `*.test.ts`. They are typechecked by `tsc -b` via a dedicated `tsconfig.test.json` (referenced from the root `tsconfig.json`) that includes `test/` and pulls in `@types/bun` for the `bun:test` module.

### A test is a lock. Do not write one for anything still moving.

A test's existence is a claim that the behaviour it asserts is settled. That claim has a price: it fails when you deliberately change the thing, so it taxes exactly the iteration you are doing. Writing a test because you just built a feature is the wrong reason, and it is how this suite reached 161 files while the locked foundations — physics, tile batching, the renderer — had none at all. The prune that followed cut it to 93.

So the first question is never "how do I test this" but **"is this behaviour locked in?"** If it is not, write no test. Much of the game layer is not locked; neither is the sprite editor. `docs/design/game-design-document.md` and the chapters it indexes record what is. Locking something new is a decision taken deliberately, never a side effect of finishing a plan step.

### What a test must clear

Four bars, all of them:

1. **Driven through the real path against real data.** Not structures the app never
   builds. A hand-made `PixelBuffer` fed to a fill algorithm proves the algorithm,
   not the feature, and will not catch the bug that ships.
2. **Asserts an outcome, not the formula.** If the expected value is the function's
   body written out, the test can only fail when someone deliberately edits that
   function. A real setup does not redeem a restated assertion.
3. **Asserts behaviour someone has actually validated.** Otherwise it cements
   whatever the code happened to do the day it was written and lends it authority.
4. **Protects something needed**, rather than recording that a feature exists.

One narrow exception earns a permanent test regardless: **failures nobody can see.** Silent corruption of a `*.scene.json`, a component skipped at load, a codec writing bytes that break in three months, two code paths quietly diverging. Those need a tripwire because nothing else will ever surface them.

### How to write one

- **Reproduce first, but reproducing is not locking.** Always make the failure
  observable before fixing it; fixing by inspection and declaring victory is how the
  same bug returns three times. Whether that reproduction survives as a committed test
  depends on the rule above. If the broken behaviour is locked, the failing check stays
  — filed with the existing tests for that behaviour, never in a new file named after
  the bug. If it is not locked, reproduce it however is cheapest, confirm the fix, and
  discard the scaffolding. Do not invent a test or a fixture to hold a bug in unsettled
  behaviour: that locks the unsettled behaviour while looking like diligence, and it is
  how a suite becomes a museum of past bugs one file at a time.
- **Prefer headless integration over isolated units** for anything stateful:
  lifecycle, serialization, save/load, scene entry/exit, camera. Boot a real `ECS`
  plus the relevant systems with no Electron, step N frames with scripted input,
  then `capture → construct a fresh Runtime → restore → continue stepping →
assert`. `test/support/sequence-harness.ts` (`SequenceFixture`) is that harness;
  extend it rather than mocking pieces.
- **Test the artifact, not just the mechanism.** A guard can be green in isolation
  while the product it protects (a committed `*.scene.json`, a save blob, an
  exported level) is already corrupt, usually because a second code path bypasses
  it. Assert against the real artifact so a leak on any path fails.
- **Seams, not scaffolding.** Expose the API the app itself uses and let the test be
  one more consumer of it. `SceneDocument` + command router + `Journal` is the shape
  to copy: it is why editor scene edits can be driven headlessly.

## Verification

QA means driving the real thing. `bun check` is its mechanical slice, not the whole
of it.

After the prune, `bun check` runs lint, format, typecheck, and 49 test files: the
provenance tripwires, the file-format codecs, locked editor-shell behaviour,
selection and journalling, two serialization round-trips. **It covers no gameplay,
no sprite editor, no weather, VFX, sequences or dialogue, no physics, and nothing
about how the game looks or feels.** A green `bun check` means the build is sound
and the tripwires held. It is not evidence that a feature works.

So a change is not done because `bun check` passed. It is done when a check that
failed before it passes after it, and when the actual behaviour has been observed.

- **Run `bun check` before declaring any task complete.** Necessary, not sufficient.
- **Verify the change the way a person would.** `bun dev` for the editor and the
  dev-served playtest, `bun game` for the built game. Say in your summary what you
  ran and what you observed.
- **When behaviour is genuinely visual** (framing, feel, anything about pixels) it
  cannot be asserted headlessly. Add temporary `console` logging, run it, read the
  output, remove the logs. Never infer that pixels are correct from code alone.
- **Audio cannot be verified by an agent at all.** Any claim about how something
  sounds is the user's to make.

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

### VFX run-state is deliberately not restorable

A runtime snapshot resumes everything — with one documented exception. **VFX run-
state (particle pools, spawn accumulators) is never captured and never
restored.** It does not live in components at all: it lives in typed arrays owned
by the VFX system instance (`engine/vfx/vfx-store.ts`), so `serializeWorld`, the
edit journal, and the save tripwires cannot see it. On thaw, emitters re-derive
from their authored `EmitterComponent` config and their host entities, and
continuous emitters **seed by age** — the steady-state population appears on the
first frame with randomized ages, so a restored save looks continuous rather than
empty.

This is a choice, not an oversight: serializing pools would bloat every save with
cosmetic state that seeding reproduces indistinguishably. Do not "fix" it by
making particles entities, by decorating a pool with `@serialize`, or by adding a
capture hook. It is also what makes live emitter preview in the editor's edit
world safe by construction — nothing VFX writes is representable in the document.
`test/vfx-snapshot.test.ts` is the tripwire.

## Saves & schema stability (pre-ship)

We have not shipped. Until a note in this repo says otherwise (likely years
away), **do not spend any effort preserving or migrating user saves or runtime
snapshot schemas**. A breaking schema change should simply crash, loudly — that
is the desired signal to fix the data or the code _now_, before shipping.
Graceful recovery, save migration, and backward-compatible versioning of
runtime state are out of scope and actively hamper development; don't design
for them, don't ask about them. Any schema already carrying versioning
machinery needs a very good reason to keep it if touched. (Authored content
migrations — scene files, editor documents — are a separate concern and remain
legitimate.)

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
- Comments can and _will_ rot. Make sure any code you touch is reflected in the comments surrounding it, if at all. Prefer removing comments if they're no longer correct instead of trying to fix them. Same two rules above apply.
- Do not handroll your own components for the editor UI; check `base-ui` (https://base-ui.com/llms.txt) first, fall back to react-aria, and only if none of those provide building blocks can you look at handrolling.
- Compose React `className` values with `clsx`, never raw string interpolation or ternaries: `className={clsx(styles.base, active && styles.active)}`.
- When picking npm packages, prefer common, well-maintained ones over handrolling.
- **No magic strings for cross-references — make them impossible by construction.** Any identifier that points at other content — ink knots, sequence ids, spawn/cast roles, prefab names, sequence tags, chronicle flags — must be reached through a type-safe mechanism, never a bare string literal at a call site. The mechanism fits the source of truth: for **TS→TS**, import/export a shared `const` (and derive literal-union types from it) so `tsc` checks every use; for content **TypeScript cannot see on its own** (e.g. ink knots compiled from `.ink`), codegen a branded accessor module from the authored source (the `scripts/gen-ink.ts` → `knots.gen.ts` pattern: run by `bun run gen`, wired into `check`/`build`/`pretest`). Either way the reference is **validated so a dangling one fails loudly** — at build for code, at load or build-over-artifacts for authored data (`.scene.json` etc.) — never silently swallowed. The bar is architectural: structure the code so a magic string _can't_ be used, not so it's merely discouraged.
- **Rendering vocabulary is fixed, and it is defined in one place.** "Pixel space" is the bare canvas at 1:1; "art space" is that painted grid with the screen scale factor applied. Sampling is `NEAREST` everywhere and there is no anti-aliasing, ever. Manipulation happens in pixel space and is projected into art space by integer upscale, so grid-exact is the default and a free transform is the justified exception. Use these terms as defined in `docs/design/game-design-document.md` (Art direction) and do not coin new ones — this vocabulary exists because vaguer phrasings caused a real misreading of what the code does.
- **Per-frame code allocates nothing.** Every render system, and every update system that runs each frame, must not allocate on its steady-state path — no object or array literals, no `map`/`filter`/`slice`/spread, no closures created per entity, no strings built per frame. Write into caller-owned buffers and reuse instance-owned scratch (`sampleInto`-style out-parameters, parallel `px`/`py` arrays, pooled typed arrays) — the VFX store and `render/ribbon.ts` are the shape to copy. This is not a micro-optimisation: a frame loop running at hundreds of hertz turns small per-entity allocations into tens of megabytes a second, and the resulting collections are seen as stutter, not as memory. Allocate at construction, on state change, or when a pool grows — never per frame.
- **Do not use memory**: Do not use the memory tool or any persistent memory store — it corrupts reasoning silently. Anything important to the way we work must live in AGENTS.md, not in memory.
- **UX decisions are not yours to make**: Never make a user-experience decision without asking the user first. This applies to anything that shapes how a user (game author or player) experiences a flow: error handling and where/how failures surface, field interaction, validation behavior, when/whether something blocks an action, notifications, navigation, and the like. When such a choice arises, stop and ask — even if a default seems obvious, and even mid-task. This applies across all parts of the project (editor, game runtime, serialization, save/load). Exception: trivial, conventional accessibility/correctness choices (e.g. "a clickable element should be a `<button>`") are fine to make without asking.
- **No sliders where precision is load-bearing.** This rule is scoped to the **game runtime's** player-facing settings/options; the **editor UI is exempt** — sliders there are fine when appropriate. The ban is about what the value does, not what it looks like: where the exact number decides whether the game plays correctly — aim sensitivity, input thresholds, timings, rates — a slider's resolution is the wrong instrument, and the value is entered as a raw number input with an explicit unit label, plus — where the raw value is an opaque coefficient — a live preview and/or a meaningful derived unit (e.g. `cm/360°` for aim sensitivity, `ms` for input timings, with a "hold/tap here to feel it" test affordance). Where coarse resolution is genuinely fine, a slider is the right control: **volume and weather quality are sliders.** Nobody needs 0.4237 of a volume, and the player judges the result by ear, not by the number. Either way, validate only against the invalid domain (e.g. `> 0`); never clamp to arbitrary min/max ranges. Arbitrary floors/caps (the classic can't-go-below-0.1 sensitivity slider) exclude users for no reason. Irreversible or accident-prone actions triggered by a hold surface a visible progress fill rather than firing silently.
