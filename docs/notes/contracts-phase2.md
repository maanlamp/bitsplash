# Phase-1 API surface — the contracts Phase 2 builds on

All of this is ALREADY on `feature/2026-07-21-weather-system` and green (968 tests / 150 files).
Do not reimplement any of it. Read the real files for detail; these are the signatures.

## Weather core (`src/engine/weather/`)

```ts
// climate-registry.ts
registerClimateCatalog(authored: AuthoredClimateCatalog, source: string): void  // replaces, not latched
clearClimateCatalog(): void
hasClimates(): boolean            // false = weather disabled (no registration at all)
resolveClimate(id: string | null): Climate   // null -> default; dangling -> throws
resolvePreset(id: string): ClimatePreset     // catalog-wide table; miss -> throws
climateIds(): readonly string[]
climatePresets(): readonly ClimatePreset[]
defaultClimateId(): string | null

// ambient-clock.ts   — the SHARED time base for gusts, sway, and VFX
ambientTime(ecs: ReadonlyECS): Seconds
advanceAmbientClock(ecs: ReadonlyECS, dt: number): void
class AmbientClockSystem implements UpdateSystem      // @profiler("Ambient clock", "Weather")

// effective-weather.ts
type WeatherTargets = Readonly<{ presetId: string | null; wind: number;
                                precipitation: number; direction: number }>
type EffectiveWeather = Readonly<{ climateId: string | null; presetId: string | null;
  indoor: boolean; wind: number; precipitation: number; direction: number;
  visibleWind: number; visiblePrecipitation: number }>
sceneClimateId(ecs): string | null
sceneIndoor(ecs): boolean
activeClimate(ecs): Climate | null
activeOverride(ecs): WeatherOverrideComponent | null
weatherTargets(ecs): WeatherTargets
effectiveWeather(ecs): EffectiveWeather
```

**THE CONSUMPTION SPLIT — get this right:**

- **Visual** consumers read `visibleWind` / `visiblePrecipitation` and `sampleWind`. These are
  **indoor-masked**: indoors, wind reads calm and precipitation reads 0, so foliage stills and
  particles stop.
- **Audio** consumers read the **raw** `wind` / `precipitation` and attenuate with the exposure
  muffle. Muffled is not silent — the storm is heard through the walls.

```ts
// weather-frame.ts — per-frame coherence store (non-serialized)
type WeatherFrame = EffectiveWeather-shaped + { time: Seconds; gust: number }
publishWeatherFrame(ecs): WeatherFrame     // called by WeatherPresentationSystem
weatherFrame(ecs): WeatherFrame            // published value, else derived on demand

// sample-wind.ts
sampleWind(ecs: ReadonlyECS, _x: number, t: Seconds): number   // SIGNED; `_x` reserved, ignored

// gust.ts
gustBand(t: Seconds): number                 // 0..1
gustEnvelope(t: Seconds, wind: number): number   // ~0.6..1.8, never negative

// preview.ts — editor preview store, WeakMap-keyed by ECS, invisible to journal/tripwires/saves
setWeatherPreview(ecs, preview: WeatherRequest | null): void
weatherPreview(ecs): WeatherRequest | null

// weather-scheduler-system.ts   — gameplay ONLY (it creates a serializable component)
type WeatherSchedulerOptions = Readonly<{ seed?: () => number; tau?: number }>
class WeatherSchedulerSystem implements UpdateSystem   // @profiler("Weather scheduler", "Weather")
// ALSO owns override reclaim (poll for a dead `owner`), deliberately here and not in
// presentation, because reclaim calls ecs.destroy which would trip the edit-world save tripwire.

// weather-presentation-system.ts
class WeatherPresentationSystem implements UpdateSystem // @profiler("Weather presentation","Weather")

// weather-override-component.ts   @serializable("WeatherOverride"), NOT persistent
//   fields: presetId|null, wind|null, precipitation|null, direction|null, priority=0,
//           owner: EntityId|null
//   Setting `owner` to the spawning sequence entity is what makes a leak unrepresentable:
//   WeatherSchedulerSystem destroys the override as soon as that entity is gone.
//   owner === null means an authored override that lives as long as its scene.

// scene-climate-component.ts  @serializable("SceneClimate"): climateId: string|null = null, indoor = false
// weather-state-component.ts  @serializable("WeatherState"), tagged PersistentComponent by the
//   scheduler's lazy self-ensure. Fields incl. serialized `rng` PRNG state.
```

## Engine root primitives (new)

```ts
// engine/rng.ts     rngNext(state: number): readonly [value: number, next: number];  randomRngSeed(): number
// engine/noise.ts   hash1(n, salt): number;  smoothstep(t): number;  valueNoise1(t, salt): number
//                   (engine/hash.ts was left untouched — hashCell's never-time-based contract intact)
```

## Exposure (`src/engine/weather/`) — pure derived data, no system

```ts
// tilemap/tile-layer-component.ts
export const RAIN_BLOCKING_MODES = ["auto", "blocks", "passes"] as const;
export type RainBlockingMode = (typeof RAIN_BLOCKING_MODES)[number];
// field, right after `collision`: @serialize({options: RAIN_BLOCKING_MODES}) rainBlocking = "auto"
// tilemap/occupancy.ts
rainBlockingLayers(ecs): ReadonlyArray<readonly [EntityId, TileLayerComponent]>

// weather/exposure.ts
INDOOR_OPENNESS_CEILING = 0.2
rainHeightAt(ecs, gx: number): number | null   // GRID ROW of the topmost blocking tile;
                                               // null = column open all the way down.
                                               // Multiply by TILE_SIZE for world Y.
                                               // Covers EVERY authored column, not just the window.
exposureAt(ecs, x, y): number                  // soft openness 0..1, already indoor-clamped
type RainAudioAnchor = Readonly<{ distance: number; centroid: Vector2 }>
rainAudioAnchor(ecs, x, y): RainAudioAnchor    // WORLD UNITS, mixable with entity positions
// weather/exposure-field.ts
exposureField(ecs): ExposureField   // cached; poll per frame.  disposeExposureField(ecs)
ExposureField#rainHeight(gx), #sample(worldX, worldY): {openness, distance, centroidX, centroidY}
exposureFieldNeedsRebuild(cached, next): boolean   // the ECS-free, unit-tested predicate
EXPOSURE_MAX_DISTANCE = 2048, EXPOSURE_RADIUS_TILES = 8, EXPOSURE_MAX_TILE_DISTANCE = 64
```

Sealed room falls out as openness 0 / distance `EXPOSURE_MAX_DISTANCE` / centroid = sample point,
with no special case. Temporal smoothing belongs in CONSUMERS (a few hundred ms), not here.
Window centres on `pickActiveCamera2D(ecs)`, falling back to world origin.

## Renderer (`src/engine/render/`)

```ts
type QuadBlend = "normal" | "additive"        // blend.ts
applyQuadBlend(gl, mode: QuadBlend): void     // replaced applyLayerBlend
quantizeToTexel(value: number, zoom: number): number   // quantize.ts

// renderer-2d.ts
type DrawCornerQuadOpts = Readonly<{
  px: ReadonlyArray<number>;   // 4 corners, order TL, TR, BR, BL
  py: ReadonlyArray<number>;   // WORLD Y IS DOWN -> indices 0,1 are the TOP corners
  image?: TileSource;          // OMIT => solid `tint` via whiteTex, on ONE shared merge key
  uv?: ReadonlyArray<number>;  // 8 floats, corner order; default [0,0,1,0,1,1,0,1]
  tint?: ColorInput; alpha?: number; blend?: QuadBlend;
}>
drawCornerQuad(id: number, opts: DrawCornerQuadOpts): void
// DrawImageOpts gains:  shear?: number  (world units, TOP TWO CORNERS only, applied after
//   rotateCorners, default 0)  and  blend?: QuadBlend.
//   `shear` also reaches drawImageOutline (shared imageQuad) — an outline follows its sprite.
// blend? also on DrawTileOpts / DrawRectOpts / DrawTextOpts. drawStaticBatch forces "normal".
```

`px/py/uv` are `ReadonlyArray<number>` NOT tuples, deliberately, so a particle hot loop can reuse
mutable scratch arrays with no casts.
**Additive is `blendFuncSeparate(SRC_ALPHA, ONE, ONE, ONE_MINUS_SRC_ALPHA)`** — the VFX plan's
`(SRC_ALPHA, ONE, ZERO, ONE)` was wrong (it assumed a premultiplied scratch; textures are
straight-alpha) and the plan has been corrected.
**Render-layer cost trap:** every distinct `(layer, order)` numeric id owns a full-viewport
RenderTarget = 1 clear + 1 full-screen blit + texW*texH*4 VRAM per frame. **Particles must use ONE
`(layer, order)`** and rely on within-layer command order. `resolveRenderLayer` does a full
`ecs.query(RenderLayersComponent)` per call — hoist it out of per-particle loops. Layers:
`["background","entities","foreground","terrain","overlay"]` (note `terrain` sorts above
`foreground`); an unknown name silently sorts above everything.

## Animation (`src/engine/animation/`) — added BESIDE the old easing/tween, which is untouched

```ts
Timeline  @serializable("Timeline"): duration/elapsed: Seconds, rate: number (all @serialize'd,
  settable); tick(dt: Seconds), t(), done(), remaining(), restart(duration?).
  `duration` is a branded Seconds NUMBER, not the `Duration` value type.
Ease  @serializable("Ease"): readonly x1,y1,x2,y2,label; at(phase) [phase clamped 0..1,
  RESULT UNCLAMPED so overshoot survives]; copy(); 10 frozen static presets
  (Linear, In/Out/InOutQuad, In/Out/InOutCubic, In/Out/InOutBack).
Keyframes<T> abstract + KeyframesNumber (static fromTo(from,to,ease?)) + KeyframesColor.
  keyframe(t, value, ease?) factory. Ctor throws on out-of-time-order keys; sample(t) throws
  with no keys; out-of-range t holds the endpoint. Per-segment ease belongs to the key that
  STARTS the segment (CSS convention).
```

**TRAP: `deserialize` fills value-type fields IN PLACE, so a `@serialize`d field holding a FROZEN
preset throws on load.** A container's default must be an unfrozen instance: `new Ease()` or
`preset.copy()`.
**`KeyframesColor` interpolates numeric `RGBA` (`[r,g,b,a]`, 0..1), NOT the css-string `Color`.**
=> a def loader must convert authored colour strings to RGBA ONCE at load. `sample()` allocates a
fresh tuple per call; there is no zero-alloc `sampleInto` yet — add one if a hot path needs it.

## compositions.ts as it now stands

```ts
const ambientSystems = (): UpdateSystem[] => [
	// line ~167
	new AmbientClockSystem(),
	new WeatherPresentationSystem(),
];
// game.update:      [...editWorldSystems(gravityY), ...gameplaySystems(settings), ...ambientSystems()]
// editorEdit.update: [...editWorldSystems(gravityY), ...ambientSystems()]
// renderSystems(): the shared-instance factory (SurfaceDecorations/TileDecorations built locally,
//   handed to DecorationsRenderSystem) — the pattern for a paired update+render VFX factory.
```

**VERIFIED: `ambientSystems()` is stepped exactly once per world.** `editorEdit` reaches worlds
only via the `SceneFactory` in `game/scenes/platformer.ts:22`, whose module is imported only by
`src/main.tsx` (editor entrypoint), never `game-main.tsx` — so it builds **editor edit worlds
only**. The shipped game and the editor's RUN world both come from
`platformer-runtime.buildRuntime` on a fresh World with the `game` composition alone.
`editorRun` is dead; its docstring now says so.

## Non-negotiables

- Nothing in `ambientSystems()` may `createEntity` a serializable component or write a
  `@serialize`d field: `SceneDocument.save()` diffs a journal replay against the live edit world
  **serialized whole** and hard-crashes on drift. Run-state goes in system-instance fields or a
  WeakMap keyed by ECS (precedent `editor/pick-index.ts:154`).
- Every update system needs `@profiler("Name", "Group")`.
- Every `@serializable` class: zero-arg constructible, EVERY field has a default initializer
  (a custom oxlint rule fails the build otherwise).
- New engine component files MUST be named `*-component.ts` or the registration glob misses them
  and deserialization silently skips them.
- Use `ctx.time.dt` (**seconds**, scaled), never `ctx.dt` (milliseconds, unscaled).
- `import.meta.glob` throws under `bun test` — use static imports for anything tests must reach.
- `test/scene-document-save.test.ts:77-79` compares `doc.save()` **byte-for-byte against the
  committed `demo.scene.json`**. If your change alters how an authored component serializes, that
  test fails and the ARTIFACT is what gets updated, not the test.
