# Asset Lifecycle — Architectural Plan

Status: **planned** (no implementation yet). README has the summary; this is the
pick-up brief.

## 1. Goal

Give the in-game asset manager a real lifecycle (resident keep-set, eviction,
memory budget, debug) **without** dragging the editor into it. The editor stays
React-land with plain, lifecycle-free loading.

## 2. Where we are today

- `engine/assets.ts` — `AssetManager` is a thin immediate-mode cache: one
  `Map<string, Asset<unknown>>` keyed by url (or `url@size`, `families@url@size`).
  `getImage(url)` returns the ready image or kicks off a load and returns `void`
  (callers poll each frame). **No refs, no unload, no eviction, no size.** Loaded
  = forever.
- `engine/load.ts` — `loadImage` (8 trivial lines) + heavy font rasterization
  (glyph masks, weight matching, bold/italic synthesis). `loadImage`/`loadFont`
  are `@deprecated Use assetmanager instead` — i.e. don't call loaders directly,
  go through the manager.
- `engine/audio/audio.ts` — `AudioManager` loads its own buffers, **outside** the
  asset manager (third, uncoordinated domain).
- `engine/serialization/field-enums.ts` — the `@file(accept?)` decorator already
  marks component fields that hold asset urls. **This is the metadata the keep-set
  scan uses.**

## 3. Locked decisions

1. **Boundary = consumer, not file type.** In-game `AssetManager` owns lifecycle;
   the **editor never uses it** — editor loads via plain React (promises /
   `<img>` / object URLs), reclaimed by GC + browser cache. (No loader-registry
   refactor — explicitly out of scope.)
2. **Reachability keep-set** — resident set = assets referenced by loaded scenes'
   content + their spawnable prefabs (`@file` fields) + pins; recomputed at scene
   load/unload.
3. **Decoupled eviction** — never on zero live instances; only at clear points
   (scene unload) + budget LRU.
4. **In-game audio buffers** go through the asset manager; playback stays in
   `AudioManager`.
5. **WeakRef** is secondary / editor-side only, never the in-game primary.

## 4. The keep-set (the core mechanism)

The resident set is **reachability**, not a usage refcount. At each clear point
(scene load/unload) the manager recomputes:

```
keepSet = pins
        ∪ for each loaded scene S:
            assetUrls(S.config)                      // tileset, decoration sheets
          ∪ assetUrls(@file fields of S's live entities' components)
          ∪ for each prefab name referenced by S
              (prefab instances + SpawnPoint.prefab):
                assetUrls(@file fields of resolvePrefab(name).components)
```

- `assetUrls(component)` reads the `@file`-marked fields (existing decorator).
- Including **spawnable prefabs** is what kills thrash: the arrow sprite is
  reachable via the arrow prefab the whole time the scene is loaded, even with
  zero live arrows. No load→despawn→reload churn.
- `pins` = `pin(url)/unpin(url)` for always-on assets (UI font, global cursor).
  The explicit escape hatch.

Anything resident but **not** in `keepSet` is a candidate for eviction.

## 5. Eviction

- **Clear point (deterministic):** on scene unload, recompute keepSet; evict
  candidates. A short grace (skip eviction if a transition is mid-flight) avoids
  freeing assets the incoming scene also needs.
- **Budget LRU (reactive backstop):** track total resident size; if over the
  budget cap, evict eviction-candidates in least-recently-used order until under.
  LRU timestamp updated on `get*`. (Timestamps passed in / sourced from the
  Clock, not `Date.now()`.)
- **Unload teardown:** freeing an asset must free its downstream resources —
  notably the **renderer's GPU texture** keyed by that image, and audio buffers.
  The manager invokes a per-type teardown. (Renderer texture-cache eviction is a
  required coordination point — see §8.)

## 6. API additions

- `preload(urls: string[]): Promise<void>` — promise-based, for scene transitions
  to await before swapping (the Scene transition async hook).
- keep immediate-mode `getImage/getFont/getAudioBuffer` for render/update systems.
- `pin(url)` / `unpin(url)`.
- introspection for the editor debugger: `inspect(): AssetInfo[]`
  (`{ url, type, status, size, reachableBy[], lastUsed }`), `forceUnload(url)`,
  `reload(url)`.
- `sizeOf` per asset type (image: w*h*4; audio buffer: length*channels*4; font:
  atlas/mask bytes).

## 7. Editor side (no lifecycle)

- The editor loads sprites/sounds with a small React utility (a `useImage(url)`
  hook over a promise + object URLs, or just `<img>`), independent of
  `AssetManager`. GC + HTTP cache reclaim them. A `FinalizationRegistry` is
  acceptable here purely as a "dispose object URL when unreferenced" convenience.
- The **in-editor asset debugger** panel reads the _in-game_ manager's `inspect()`
  when a scene is being simulated/previewed — it observes the runtime lifecycle,
  it doesn't impose one on the editor's own loads.

## 8. Layering & coordination

- **Engine:** keep-set computation, eviction, budget, teardown hooks, preload,
  introspection.
- **Renderer:** must expose GPU-texture eviction so unload actually frees VRAM
  (currently the renderer caches textures by image — that cache needs an
  `evict(image)`). **Hard dependency.**
- **Scene system:** scene load/unload are the clear points; transition preload
  uses `preload`. (Depends on Scene system.)
- **Editor:** asset debugger panel; the editor's own loading stays separate.
- **Profiling (task 8):** the memory profiler reads the budget/size totals.

## 9. Migration path

1. Add `sizeOf` + a resident-size total + LRU timestamps to the manager (no
   eviction yet — just measure).
2. Add the renderer GPU-texture `evict(image)` + the manager teardown hook;
   implement `forceUnload` + `inspect`.
3. Add `pin`/`unpin` + `preload`.
4. Implement keep-set reachability scan (needs `@file` field enumeration over
   components + prefab resolution) and clear-point eviction (needs Scene system).
5. Add budget LRU backstop.
6. Editor asset debugger panel.
7. Route in-game audio buffer loading through the manager.

## 10. Open sub-decisions / handoffs

- **Renderer texture-cache eviction API** — must be designed with the renderer;
  blocks real VRAM frees.
- **Budget value + over-budget behavior** — hard cap (evict aggressively) vs soft
  (warn + best-effort). Lean soft with a warning surfaced to the profiler.
- **Transient `getImage(url)` of non-reachable urls** — evicted next clear point
  unless pinned; acceptable, document it.
- **Depends on Scene system** for clear points and **prefab resolution** for the
  keep-set scan.

## 11. Primary files touched

- Changed: `engine/assets.ts` (lifecycle), `engine/renderer-2d.ts` (texture
  evict), `engine/audio/audio.ts` (buffers via manager),
  `engine/scene/scene-manager.ts` (clear-point hooks + preload).
- New: `engine/assets/keep-set.ts` (reachability scan), editor asset-debugger
  panel + a React `useImage`-style loading util.
