# Host & Render Unification

- **Type:** refactor
- **Date:** 2026-07-29
- **Status:** accepted

## Goal

Collapse the two hand-written game hosts and three hand-written render paths into one `Host` and one `renderWorld`, with the variable parts as seams rather than config. Give the sprite editor the same document/history separation the scene editor already has, expose the renderer's batching counters, and add a dev-only probe into the running app. The point is seams: after this, testing and the QA skill are just consumers of APIs the app already exposes.

## Context & problem

The game runs through two hosts. `Game.updateScene` (`game.ts:177-206`) and `RunHost.stepWorld` (`run-host.ts:195-225`) independently implement one frame — build the `UpdateContext`, step actions, `ecs.update`, `flushDestroyed`, each inside the same `ui.step` / `ui.layout` sandwich. Runtime construction is already shared (`platformer-runtime.ts:57` serves both), so this was never two games; it is two frames. They have drifted:

- **Action edges.** `Game` resets them when the input source changes (`game.ts:188-190`). `RunHost` doesn't — and it is the one that swaps sources, flipping between `real` and `muted` when edit-while-running toggles (`run-host.ts:168`). Toggling that mode can leave a stale pressed edge latched.
- **Profiling.** Enabled only in the editor (`run-host.ts:93`). The bundled game and the playtest populate no frame profile at all, so a stutter cannot be measured where it is felt.
- **The dt clamp exists twice** — `MAX_FRAME_MS` (`game.ts:23`) and `MAX_DT` (`app.tsx:185`), same value, free to diverge.

Rendering exists three times: `Game.renderScene` (`game.ts:208`), `SceneView.render` (`scene-view.ts:367`), `SceneView.renderRunWorld` (`scene-view.ts:406`). All three run `beginFrame` → pick camera → `ecs.render` → `sceneTarget` → `renderSceneToTexture` → `composite`. The frame pairing sits at different levels — inside the method for the `SceneView` paths, in the caller for `Game` — and is currently correct only because each renderer has exactly one caller (`game.ts:59`, `scene-view.ts:189`). Nothing enforces it, and the probe adds callers.

Two further gaps:

- **`SpriteDocument` tangles the DOM into the document.** `CelStore` is already the pure canvas-free core — its own comment says so (`cel-store.ts:123`) — but tools write through `SpriteDocument`, which calls `document.createElement("canvas")` and carries 47 canvas references. The scene side has no such tangle: `SceneDocument` + command router + `Journal` is a clean separation, and it is why editor scene edits can be driven headlessly while sprite edits cannot.
- **Renderer batching is unobservable.** `quadVerts`, `tileVerts`, and the layer map are internal, so a regression that breaks batching is invisible until it is felt as a stutter.

Constraints: the editor is a tool, not a product, so nothing here may make daily iteration slower. No debug capability may reach a shipped build, and the guarantee must be structural. Asset resolution across build types belongs to `2026-07-12-refactor-asset-resolution-core.md` (accepted, unimplemented) and is out of scope. Run-mode semantics are settled in `docs/roadmap.md`; run-toolbar placement stays there.

## Decision

**One engine-owned `Host`** owns the frame with no conditionals: dt clamp, clock advance, the `ui.step` / `ui.layout` sandwich with gameplay inside the callback so UI focus still masks input, action stepping including edge-reset-on-source-change, `ecs.update`, `flushDestroyed`, event clearing, profiling. Everything that legitimately differs is a seam it is handed — `SceneSource`, `InputSource`, `HostPlugin` — so editor and game behavior arrive as plugins rather than flags.

**The host steps; each side renders.** That seam is deliberate. The editor's per-view freezing during a run, per-view profiling spans, and focused-versus-unfocused paths are not generic, and forcing them into a shared target loop would grow editor-shaped hooks on an engine type.

**Full host merges are rejected.** Document-backed scene resolution, command-router rebinding, `isRuntimeEntity` poke routing and `rebuildLive()` are inherently editor; save/load, the menu phase machine, toasts and F5/F9 are inherently game. One host with both is a config-flag monster.

**One `renderWorld`, reached through a scoped frame.** `renderer.frame(cb)` brackets `beginFrame`/`endFrame`; `renderWorld(scope, …)` lives at the world layer so the renderer stays ignorant of worlds. `FrameScope` is exported but carries a `#private` brand so it cannot be forged, `frame` returns `void` so it cannot be returned out, and a stale scope throws. Escape is possible but useless and loud — the same posture as the save tripwires.

**`SpriteEditCore` gives the sprite editor the scene editor's shape.** A canvas-free edit core over `CelStore`; `SpriteDocument` keeps the composite canvas, stroke preview and thumbnails and holds a core. This is not a new architecture — it makes sprite match the pattern the scene side already proves.

**Renderer counters become public** — draw calls, vertex counts, layer count and scratch churn. These are exact integers for a given scene, so they are lockable. Real frametimes are not lockable and are measured separately, against the built game via a debugging port rather than through the probe, so nothing we inject perturbs the number.

**The probe is a `HostPlugin` injected by a serve-only Vite plugin.** Vite plugins are build-time code that never enters a bundle, so under `bun game` (which runs `vite build`) the probe is not in the module graph at all — absent by construction, no `import.meta.env` guards in app code. Under `bun dev` it is present, including in the playtest the editor spawns, which gets `BITSPLASH_DEV_URL` (`main.cjs:761`) and loads from the dev server. Its implementation lives in `qa/`, outside `src/`, so no app module can import it.

## Alternatives considered

- **Merging `RunHost` and `GameShell` wholesale.** Rejected above — most of the divergence is legitimate.
- **A shared frame-step core only, leaving render duplicated.** Cheaper, but the camera-pick ordering already drifted on the render side, so it unifies one seam and leaves its twin to drift.
- **`renderWorld` as a method on `Renderer2D` with the frame parts private.** A stronger compiler guarantee, but it makes a low-level draw API depend on `World`/`ECS` and fights the first pass that draws something world-less — which a debug overlay is.
- **Not exporting `FrameScope` so it cannot be named.** Incompatible with `renderWorld` at the world layer, and it never prevented capture anyway (`let stolen; renderer.frame(s => stolen = s)` compiles via inference).
- **A native canvas shim (`@napi-rs/canvas`) instead of extracting the core.** No production change, but `canvas-native-blend.ts` delegates blend modes to the browser compositor, so Skia may not match Chromium and composite assertions could pass while being wrong on screen.
- **`import.meta.env.DEV` guards plus a post-build tripwire for the probe.** Loud on leak, but a leak stays possible and every dev build carries the bridge; unrepresentable beats crashes-loudly.
- **A separate dev-only entry point for the probe.** Also unrepresentable, but it diverges the dev and shipped entry graphs — the class of problem the playtest's asset resolution already causes.

## Approach / steps

**A** and **B** are independent. **C** depends on A's `InputSource` seam.

Shared contract: `Host` is constructed with `{ sceneSource, inputSource, plugins }`, exposes `step(dt, time)` and `world`, and never renders. `HostPlugin` exposes `onSceneChanged(id, world)`, `onRuntimeChanged(runtime)`, `onStop()`.

### Workstream A — Host and render

1. **`src/engine/render/frame-scope.ts`.** `FrameScope` carrying a `#gen` brand. `Renderer2D.frame(cb: (scope: FrameScope) => void): void` brackets `beginFrame`/`endFrame`, bumps the generation on exit, and every scope method validates its generation, throwing a message that names the mistake.

2. **`src/engine/render/render-world.ts`.** One `renderWorld(scope, { world, camera, time, uiScale, overlays, presentation })` owning `ecs.render` → overlays → `sceneTarget` → `renderSceneToTexture` → `composite`. `presentation` is the scene supplying clear colour and target key, which `renderRunWorld` deliberately takes from the view rather than the world it draws. Retarget `game.ts:208`, `scene-view.ts:367`, `scene-view.ts:406`; delete their bodies.

3. **Public renderer counters.** Expose draw calls, `quadVerts`, `tileVerts`, live layer count, and scratch targets disposed per frame. Read-only, reset with the frame.

4. **`src/engine/runtime/host.ts`.** `Host` plus the seam types, as described in the Decision. One dt clamp constant replaces `MAX_FRAME_MS` and `MAX_DT`. Profiling becomes a runtime toggle rather than an editor-only fact — on by default in dev, off in a build, enabled by a flag for a perf run. Per-system timing is itself observer overhead, so it must not be unconditional in the artifact whose performance is being measured.

5. **Perf measurement targets the built game, not the probe.** `bun game` produces the stripped-down window with no probe and no editor integration; Electron accepts `--remote-debugging-port` on it, so real frame timing comes from Chromium's own tracing rather than anything injected. The game's `FrameProfile` is emitted on a flag when per-system numbers are wanted, accepting that enabling it perturbs what it measures. Headless counters (step 3) cover batching structure; this covers wall-clock.

6. **Migrate `GameShell`.** Game plugins: a `SaveDriver` plugin for `onRuntimeChanged` (`game-shell.ts:272`), and the menu/pause/toast UI. Runtime swapping stays with whoever constructed the host — `Host` must not hold a runtime reference across a load, or loading a save breaks.

7. **Migrate `RunHost` and the `app.tsx` loop.** Editor plugins: a document plugin for `bindRun`/`unbindRun`/`rebuildLive`/`visited` (`run-host.ts:227-260`), a mode-switching `InputSource` returning real or muted, and a `SceneSource` reading the open `SceneDocument` with a fallback to `gameModule.resolveScene`. `app.tsx` keeps its per-window loop, view freezing and per-view profiling spans, calling `host.step` then rendering each view.

   ⚠ Checkpoint: unverified until built — `app.tsx:1278-1330` is a 1917-line file's frame loop with no test covering it, and its per-view logic may not survive delegating the step. If it cannot be retargeted without regressing view freezing or profiling spans, leave the loop calling `Host.step` directly and keep the per-view branch inline rather than generalizing it.

8. **The `resetEdges` fix ships with a reproduction** — toggle input mode mid-hold, observe the stale latched edge before step 4 and its absence after. This is the one behavior change in the workstream, so it does not land on inspection.

### Workstream B — Sprite edit core

9. **Extract `SpriteEditCore`** (`src/editor/sprite/sprite-edit-core.ts`): the canvas-free edit surface over `CelStore`. `SpriteDocument` keeps the composite canvas, stroke preview and layer thumbnails and holds a core; tools and commands retarget to it. **The 40 existing sprite tests stay green across this refactor as its only safety net**, and are removed afterwards as part of the separate prune — not before.

   ⚠ Checkpoint: unverified until built — `refreshStrokePreview` and the `beginStroke`/`commitStroke`/`clearStroke` trio may be entangled with the preview surface rather than cel state. If they cannot be split cleanly, leave stroke preview on `SpriteDocument` and have the core expose commit-only stroke writes, accepting that live stroke preview stays outside the core.

### Workstream C — Probe

10. **`vite-qa-bridge.ts`** at the repo root beside `vite-babel-cache.ts`, `apply: "serve"`. Resolves a virtual module implemented in `qa/` and injects it into the game entry. It supplies a `HostPlugin` (world dumps, frame profile, renderer counters) and an `InputSource` override, since injection must replace input rather than observe it.

11. **`scripts/probe.ts`.** CLI over a local transport: `entities --with <Component,…>`, `profile --frames N`, `render --frames N` for the counters, `session <script>` for scripted input. Component and action names come from typed constants.

    ⚠ Checkpoint: unverified until built — a scripted session against the live renderer may not be reproducible enough to be useful, since real frame timing varies. If runs diverge, restrict the probe to measurement (`entities`, `profile`, `render`) and leave reproduction to headless fixtures, which are deterministic by construction.

## Research findings that drove this

- **`platformer-runtime.ts:57`** already unifies runtime construction across both hosts, which shrank this from a ~700-line rewrite to an extraction: the duplication is one frame implemented twice, not one game built twice.
- **`GameModule` (`game-module.ts:80`)** is already this seam pattern pointing the other way — game capabilities injected into the editor, constructed in `main.tsx` because composition entrypoints are the one place allowed to cross layers. The plugin design follows an existing grain.
- **`cel-store.ts:123`** documents itself as the pure canvas-free core with `SpriteDocument` as the DOM wrapper, so the split finishes a separation the code already describes rather than proposing a new one.
- **Frame pairing is currently correct by accident.** `beginFrame` resets vertex counters and clears layer command lists (`renderer-2d.ts:1545`); `endFrame` ages unused layers and disposes their scratch targets past `MAX_IDLE` (`:2223`). It balances only because each renderer has exactly one caller today.
- **The probe's reach is bounded by design.** Serve-only means it exists under `bun dev` and not under `bun game`, so build-specific behavior — asset resolution above all — is exactly what it cannot investigate. That is the never-ships guarantee working, not a defect to engineer around.
- **Renderer performance splits cleanly.** Batching structure (draw calls, vertex counts, layer churn) is deterministic and countable headlessly; frametimes are not and need the real GPU. Only the second half requires driving the app headed.
