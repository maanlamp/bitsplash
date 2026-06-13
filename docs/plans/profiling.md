# Profiling — Architectural Plan

Status: **planned** (no implementation yet). README has the summary; this is the
pick-up brief.

## 1. Goal

Per-system CPU profiling + memory profiling, on top of the existing whole-frame
fps/frametime widget. Chrome-only APIs acceptable. Engine collects, editor
visualizes, and the profiler is usable during fullscreen playtest.

## 2. Where we are today

- `engine/game.ts` — measures one whole-frame `performance.now()` delta
  (`lastFrameTime`) + `fps`; exposes `frameTime`/`fps` getters. No phase or
  per-system breakdown.
- `engine/ecs.ts` — `update`/`render` just iterate systems calling
  `system.update(ctx)` / `system.render(ctx)`. No timing hook.
- `editor/perf-monitor.tsx` — React widget on its own RAF; draws a 120-sample
  frametime graph + min/avg/max to a 2D canvas. Editor-only; rendered as a canvas
  overlay inside the canvas panel.
- `play()` in `editor/app.tsx` calls `requestFullscreen()` on the **bare canvas
  element** → nothing can render over it during playtest.

## 3. Locked decisions

1. **Auto loop-hook timing + User Timing bridge** — ECS times each system when a
   profiler is attached (zero-cost off); emits `performance.measure` for DevTools.
2. **Memory = `performance.memory` + engine accounting** (asset budget + ECS
   census); `measureUserAgentSpecificMemory` optional later.
3. **Engine collects, editor visualizes**; profiler is **debug chrome** (React OK).
4. **Playtest overlay via fullscreen wrapper** — fullscreen a container (canvas +
   React debug-overlay layer), not the bare canvas.

## 4. Engine: the profiler

```
class Profiler {
  enabled: boolean
  // ring buffer of recent frames
  frames: FrameSample[]            // bounded (e.g. 600)
  beginFrame(t), endFrame(t)
  beginSpan(name), endSpan(name)   // phase or system; nestable
  sampleMemory(), sampleCensus(ecs)
}

type FrameSample = {
  frame: number
  total: number
  phases: { input, update, physics, render, composite, present }
  systems: { [name: string]: number }   // update + render, keyed by ctor name
  heap?: { used, total, limit }
  census?: { entities: number, components: Record<string, number> }
}
```

- **Loop hook:** `ecs.update`/`render` wrap each `system.*` call: if a profiler is
  attached, `beginSpan(system.constructor.name)` / `endSpan`; else the existing
  fast path (no timing call). `Game` brackets phases (`input`, `update`,
  `physics`, `render`, `composite`, `present`) the same way.
- **User Timing:** `beginSpan`/`endSpan` also call `performance.mark` +
  `performance.measure(name, startMark, endMark)` when enabled, so DevTools'
  Performance panel shows labeled spans. Cleared each frame to avoid buffer
  growth (`performance.clearMeasures`).
- **Timestamps:** use `performance.now()` here (this is measurement, not
  deterministic sim — the `Date.now` ban is about determinism, `performance.now`
  for profiling is correct).
- **Zero-overhead-off:** the loop checks one boolean; when disabled there is no
  per-system call overhead beyond that branch.

### Memory accounting

- **JS heap:** `performance.memory` (Chrome) sampled each frame or every N frames.
- **Assets/GPU:** read the AssetManager budget totals (resident bytes, per-type,
  texture bytes) — the `sizeOf` accounting from `asset-lifecycle.md`. The only
  reliable "GPU memory" signal (no browser VRAM API exists).
- **ECS census:** entity count + per-component-type counts from the ECS (cheap
  walk; sample every N frames). Per active scene once Scenes land.

## 5. Editor: profiler view

The current widget grows into a dockable editor view (`perf`, per
`editor-docking.md`), reading the engine profiler's ring buffer:

- **Frame graph** — phase-stacked frametime over the window (not just total),
  target line at 16.7ms, spike coloring (kept from today).
- **Per-system breakdown** — bars/table sorted by cost (avg + max over window);
  surfaces the hot system instantly.
- **Memory** — heap graph + asset-bytes breakdown + census counts.
- **Spike capture** — on a frame over threshold, freeze and show that frame's full
  per-system breakdown (the "what caused the hitch" view). (Phase 2.)

## 6. Playtest overlay

- Change `play()` to `requestFullscreen()` on a **wrapper** element containing the
  game canvas + a `debug-overlay` layer (absolutely-positioned, `pointer-events`
  as needed). React debug views (profiler, future inspectors) **portal** into that
  wrapper, so they appear over the fullscreened game.
- Rationale: the profiler is **debug chrome**, not game UI — the canvas-only rule
  governs _game_ UI (HUD/menus). This keeps one React implementation for editor +
  playtest and unblocks other playtest debug overlays.
- Toggle hotkey to show/hide the overlay during playtest.

## 7. Layering

- **Engine:** `Profiler`, the loop hook in ECS + Game phase brackets, memory
  sampling, census. Attach/detach so production builds pay nothing.
- **Editor:** the profiler dockable view; the fullscreen-wrapper change to
  `play()`; the debug-overlay portal layer.
- **Reads from:** AssetManager budget (memory), Scene system (per-scene census) —
  soft deps; works without them, richer with them.

## 8. Migration path

1. `Profiler` + ring buffer + the ECS loop hook + Game phase brackets (collection
   only).
2. Point the existing widget at the profiler; add the phase-stacked graph +
   per-system breakdown.
3. User Timing bridge (DevTools spans).
4. Memory: `performance.memory` graph + ECS census; wire asset-bytes once the
   asset budget exists.
5. `play()` fullscreen-wrapper + debug-overlay portal; show the profiler in
   playtest.
6. Spike capture; optional `measureUserAgentSpecificMemory`.

## 9. Open sub-decisions / handoffs

- **Sampling cadence** for memory/census (every frame vs every N) — lean every
  ~10–30 frames; tune.
- **`measureUserAgentSpecificMemory`** needs cross-origin isolation (COOP/COEP) —
  deferred; flag the header/embed/CORS implications before enabling.
- **Asset-bytes** depends on `asset-lifecycle.md` `sizeOf`; **per-scene census**
  depends on the Scene system. Both soft.

## 10. Primary files touched

- New: `engine/profiler.ts`, editor profiler view (grown from
  `perf-monitor.tsx`), a `debug-overlay` portal layer.
- Changed: `engine/ecs.ts` (loop timing hook), `engine/game.ts` (phase brackets +
  attach profiler), `editor/app.tsx` (`play()` fullscreen wrapper),
  `engine/assets.ts` (expose budget totals).
