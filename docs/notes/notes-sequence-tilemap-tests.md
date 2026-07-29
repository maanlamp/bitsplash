# Sequence / tilemap / harness facts (verified) — for W3, W4, W8

## PLAN CORRECTION 1 — there is no `finish` hook on an op

`OpExecutor` (`op-registry.ts:26-41`) is **`arm` / `poll` / `skip` / optional `skippable`**.
The weather plan step 11 says "despawn on op `skip`, on sequence `finish`, and on queued-def
rollover" — "finish" is a _sequence_-level concept: `SequenceSystem.finish`
(`sequence-system.ts:189-214`), called only from `tickComponent` `:140-142`.

- `arm` runs **EVERY TICK** the step is live, not once. Ops self-guard with
  `if (memory.issued === true) return;` (`fadeExecutor`, `engine-ops.ts:30-32`) or a run-state
  key (`spawnExecutor`, `game-ops.ts:530`). `memory` is `run.memoryFor(stepId)` — serialized,
  so the guard survives save/load. That IS the idempotence mechanism.
- `poll` → `true` marks the step done. `skip` → `false` HALTS the whole fast-forward pass.
- `skippable?` defaults true; returning false makes the ENTIRE sequence unskippable
  (`nodeSkippable` is `every`-over-children, `interpreter.ts:187-191`).

## PLAN CORRECTION 2 — rollover discards run-state wholesale

`SequenceSystem.finish` `:189-214`: non-exclusive → `ecs.destroy(id)`; else shift `queue`;
empty → `ecs.destroy(id)`; else reuse the entity and **`component.run = new SequenceRunState()`
at line 211** — `ownedOverrides` is silently dropped there. Despawn BEFORE that line.

## PLAN CORRECTION 3 — explicit despawn cannot be "unrepresentable"

`spawnedRefs` (`sequence-run-state.ts:21`) is a name→id binding table for actor resolution,
NOT an ownership list: only 3 sites touch it (`:21`, `interpreter.ts:52`,
`game-ops.ts:530/549`) and **nothing iterates it on finish/skip/rollover**. There is no
automatic despawn anywhere; `lost-critter` deliberately outlives its sequence
(`test/sequence-smoke.test.ts:174-205`).
Explicit despawn at finish+skip+rollover still misses the sequence entity being
`ecs.destroy`ed outright — which tests do (`sequence-smoke.test.ts:104-106`).
**The architectural precedent for real ownership is the camera borrow**:
`borrowCameraFollow(ecs, owner)` `camera-2d-follow-system.ts:23-51` +
`reclaimFromDeadBorrower` `:140-160`, which releases by **polling whether the owner entity
still exists**: `if (owner !== null && ecs.componentsOf(owner).length > 0) return;` (`:153`).
Its comment `:133-139` says that is "the only release path, so it covers ended, skipped, and
destroyed-outright".
=> DECISION: do both. Record `ownedOverrides` + explicit despawn at skip and before `:211`,
AND give `WeatherOverrideComponent` an owner id + a poll-based reclaim. That is what makes a
leak actually unrepresentable, which is the plan's stated goal.
`ECS.onDestroy(cls, hook)` `ecs.ts:105-110` exists (only user: physics teardown,
`world.ts:50-55`) but is per-ECS-instance so it needs wiring in every composition — which is
why the camera used polling.

## Adding the `weatherOverride` op — exact touch list

1. `builder.ts`: add to the `OP_TYPES` `as const` record (`:76-91`) + a
   `WeatherOverrideParams` type + a typed `weatherOverride(stepId, params)` factory calling
   `leaf(OP_TYPES.weatherOverride, stepId, params)` (`leaf` at `:31-35`). This `as const`
   record is how the codebase avoids magic strings; `PREDICATE_IDS` is at `:93-98`.
2. `engine-ops.ts`: the executor + one `registerOpType` line inside
   `registerEngineSequenceOps()` (module-latched, `:291-309`).
   `OpParams = Readonly<{[key: string]: SerializableValue}>` (`op.ts:3`) — untyped inside
   executors (`params.x as number` everywhere); typing lives on the authoring side only. There is
   NO runtime param validation; `sequenceDef()` only checks unique/non-empty stepIds
   (`builder.ts:320-335`) and rejects reserved structural types (`:337-345`).
   `validateRunState` (`interpreter.ts:25-46`) runs on every tick/skip and catches def drift.
   Adding an OP does not touch `test/sequence-manifest.test.ts` (it only pins the shipped **def**
   id list `:107-120`).
   `OpContext` (`op-registry.ts:14-24`) = `{ecs, world, events, assetManager, audio, dt: Seconds,
entityId, sequenceClass, run}`. Exclusivity-assert precedent: `takeCamera` `engine-ops.ts:59-66`
   throws for ambient sequences and is called in BOTH `arm` and `skip`, BEFORE the memory guard.
   Factory-op precedent (two ops from one body): `controlExecutor(released)` `:250-264`.

## `SequenceRunState` — adding a field is free

`@serializable("SequenceRunState")`, a **ValueType** on `SequenceComponent.run`
(`sequence-component.ts:12`). Absent fields on load are **skipped, not nulled**
(`value.ts:104`), so `@serialize() ownedOverrides: EntityId[] = []` needs no migration.
`EntityId = ReturnType<typeof crypto.randomUUID>` = string (`ecs.ts:16-18`) → serializes as a
JSON string array for free.
**oxlint `require-default-fields-oxc-plugin.ts:59-84` FAILS THE BUILD on any field without an
initializer inside a `@serializable` class.**

## Tilemap

`TileLayerComponent` (`tile-layer-component.ts`, 30 lines, complete):
`@serializable("TileLayer")`; `name="layer"`, `tilesetRef=new AssetRef("image/*")`,
**`@serialize({options:["none","solid"]}) collision: TileCollisionMode = "solid"` at `:15-16`
— THE PICKER PRECEDENT**, `renderLayer="terrain"`, `order=0`, `readonly grid = new TileGrid()`
(not serialized directly), `visible = true` (not serialized), and a serialized
getter/setter pair `cells: TileRect[]` `:23-29`.
`rainBlocking` goes immediately after `collision`. `SelectOption = string | {label, value}`
(`serializable-value.ts:15-23`) so human labels are available. Inspector reads it at
`inspector.tsx:87-100` via `fieldOptions(typeName, fieldKey)` (`registry.ts:56-60`).
No scene migration needed (absent field skipped). `test/scene-document-save.test.ts:201-233`
is a self-consistency round-trip, not file equality → a defaulted field passes unchanged.
`migrate-legacy-tiles.ts:32-39` picks it up automatically.
Editor setter precedent if a panel control is wanted: `setTileLayerCollision`
`editor/tile-layer-commands.ts:187-196`.

`TileGrid` (`grid.ts`, 96 lines): private `Set<string>` keyed `` `${gx},${gy}` ``;
**public `version = 0`** bumped on every mutation; `setTile/removeTile/hasTile/occupiedCells/
bounds/clear/onChange`.

- **`onChange` fires in a `queueMicrotask` (`:89`) → useless mid-frame. Poll `version`.**
- No dimensions field; `bounds()` is an O(cells) scan returning null when empty.
- `occupiedCells()` allocates + `Number`-parses every key every call.
- **No world↔grid conversion on TileGrid at all.** `TILE_SIZE = 32` (`tilemap/tile.ts`);
  cell origin top-left, cell (gx,gy) covers `[gx*32,(gx+1)*32)`.
  world→grid `Math.floor(x / TILE_SIZE)`; grid→world corner `gx * TILE_SIZE`;
  center X `(gx+0.5)*32`, feet Y `(gy+1)*32`.
  Do NOT copy `editor/sprite/tile-paint.ts:104-107` (HALF_TILE offset lattice = sprite space).

`occupancy.ts` (59 lines, complete): `tileLayers(ecs)` `:5`, `solidTileLayers(ecs)` `:10`,
`isSolidCell(ecs,gx,gy)` `:15` (**zero call sites — dormant**), `mergedSolidCells(ecs)` `:24`
→ `Set<string>`, `solidBounds` `:55`, `tileBounds` `:58`.
**Nothing is cached** — `mergedSolidCells` rebuilds the whole Set per call and `isSolidCell`
re-queries + re-filters per call. NEVER call them inside a BFS.
The caching precedent, used identically twice (`tile-collision-system.ts:23-32` and
`nav-graph-system.ts:22`):

```ts
const signature = solidTileLayers(ecs)
	.map(([id, l]) => `${id}:${l.grid.version}`)
	.join("|");
if (signature === this.signature) return;
```

Signature includes layer **ids** so add/remove invalidates. For exposure, extend to
`id:version:collision:rainBlocking` so a tri-state flip invalidates too.
`rainBlockingLayers(ecs)` belongs next to `solidTileLayers` in `occupancy.ts`:
`l.rainBlocking === "blocks" || (l.rainBlocking === "auto" && l.collision === "solid")`.
Export the cache-invalidation **decision function** separately and unit-test it away from the
ECS — precedent `tileBatchNeedsRebake` (`tilemap-render-system.ts:35-39`) tested by
`test/tilemap-rebake.test.ts` (29 lines, 4 tests).
`ReadonlyECS.query` builds a fresh array per call (`ecs.ts:185-217`) — hoist out of loops.

## Physics seam (do NOT use for rain occlusion)

Only `World.raycast(from, to, filter): RaycastHit | null` (`world.ts:78-84` →
`rapier-physics.ts:198`). No point/overlap/containment query is surfaced anywhere.
Tile solids are baked as **static chains (edge loops, not filled boxes)**
(`tile-collision-system.ts:34-54`), so a point-in-tile test via physics is wrong, would hit
dynamic bodies, and could not honour a per-layer `rainBlocking` flag. Derive from tile grids.

## Compositions (partial — confirm by reading the file)

`editWorldSystems(gravityY)` `:84-87` = `[TileCollisionSystem(Layer.Terrain),
NavGraphSystem(...)]`, docstring `:79-83` calls it "world-derivation, not gameplay", present in
the bundled game AND editor edit mode. `gameplaySystems(settings)` `:94-146`
(`SequenceSystem` `:132-135`, `TimerSystem` `:136`). `renderSystems()` `:152-175`.
`game` `:181-190`, `editorRun` `:197-203`, `editorEdit` `:210-215`.
**`ambientSystems()` does not exist yet.**

## Time units — THE most likely bug

`Time = {elapsed: Seconds; dt: Seconds; scale: number}` (`clock.ts:3-7`).
`Clock.snapshot` `:17-23`: `dt = (deltaMs * scale)/1000` → **`time.dt` is SECONDS and SCALED**.
**`UpdateContext.dt` is MILLISECONDS and UNSCALED** (`system.ts:15`).
They differ by 1000x and by scale. **New weather/ambient code uses `ctx.time.dt`.**
`World.step(dt)` takes seconds as a plain number, fixed 1/60 substeps, `MAX_FRAME = 0.25`.
**Pause:** `Game.start` `:114-159` calls `clock.advance` + `snapshot` UNCONDITIONALLY at
`:125-126`, before the pause check `:130`. So the Clock keeps ticking while paused and
`time.elapsed` JUMPS on resume; only `ecs.update` is gated. Rendering continues (`:149` is
outside the guard) so anything driven by `time.elapsed` at render time keeps animating while
paused. => The plan's system-ticked ambient-clock accumulator is exactly right and is the only
pause-respecting time source. `Game.setPaused`/`get paused()` `game.ts:82-96`.
`MAX_FRAME_MS = 100` clamps hitches (`game.ts:23`).

## Test harness — `test/support/sequence-harness.ts` (375 lines)

`HarnessConfig` `:65-86` = `{initialScene, seed(world), resolveScene(id), registerSystems?(world),
now?, collisionMatrix?, input?, actions?, audio?, assetManager?}`.
`SequenceFixture.makeRuntime(config)` `:122`, `static async create(config)` `:136`
(awaits `loadRapierHeadless` `:55-63` — **real physics runs headlessly** via rapier2d-compat),
getters `runtime/world/ecs/assetManager`, `step(frames=1)` `:189`, `saveAndReload()` `:200`,
`dispose()` `:212`.
`step()` per frame: `buildContext()` → `ecs.update(ctx)` → `world.step(FRAME_MS/1000)` →
`ecs.flushDestroyed()` → `world.events.clear()`. **`FRAME_MS = 1000/60` fixed — dt cannot vary.**
**No render pass ever runs** → nothing render-side is assertable. **Events are cleared every
frame** → an event must be consumed the frame it is emitted. Destroys flush AFTER physics.
`saveAndReload` `:200-210`: `manager.capture` → `makeRuntime(config)` fresh → `manager.restore`
→ dispose old → returns `this` (mutates in place; `fixture.ecs` is a getter). `Runtime.restore`
throws unless the runtime is fresh (`runtime.ts:115-120`).
`Runtime.snapshot` `:91-113` splits by `PersistentComponent` presence (`isSceneContent` `:137-142`);
`despawnSceneContent` `:151-158` destroys every non-persistent entity on scene exit.
=> **`WeatherStateComponent` MUST carry `PersistentComponent`**; `WeatherOverrideComponent`
must NOT, so it dies with its scene by construction.
**Throwing stubs** `:88-98`: `stubService(label)` is a Proxy whose `get` trap throws
("a system under test reached for it"). Defaults for `input` `:180`, `actions` `:181`,
`audio` `:184`. Holding `ctx.audio` is safe; touching any member throws.
`NULL_ACTIONS` (`input/bindings/action-provider.ts:42`) is a ready non-throwing no-op provider.
No input _scripting_: inject a `DeviceSnapshot`/`ActionProvider` once and mutate it between
`step()`s. Sequence tests bypass input via `sequenceSceneConfig(def, {skipHeld: () => true})`
(`test/support/sequence-scene.ts:159-163`).
Support files: `counter-fixture.ts` (56 lines — **the template for a new WeatherFixture**),
`sequence-scene.ts` (`registerTestSequenceOps()` latched, calls `registerEngineSequenceOps()`;
`sequenceSceneConfig(def, opts)` registers only `SequenceSystem` + `ScreenFadeSystem`),
`game-sequence-scene.ts` (`gameSequenceSceneConfig({def, seedScene?, seedSequence?, skipHeld?,
preSystems?, extraSystems?})` `:77-109` — **`extraSystems` is the hook for a weather system**),
`real-fonts.ts`, `committed-story.ts`, `ui-fixture.ts`.
Test style to match: `import {describe, expect, test} from "bun:test"` first line; relative
`../src/...` imports; small local reader helpers above `describe`; per-test
`create → step(n) → assert → await saveAndReload() → step(n) → assert not re-fired → dispose()`
(no `afterEach`); loud-failure via `expect(() => fixture.step()).toThrow(/regex/)`;
guarded-loop idiom `while (cond && guard++ < 120) fixture.step(1)`
(`sequence-smoke.test.ts:150-166`).

## Registration side-effects tests must perform (all latched/idempotent)

`registerEngineSequenceOps()`; `registerSequenceContent()` (self-invokes on import,
`sequence-manifest.ts:45`); `registerSequenceDef(def)`; `registerPrefab(name, json)` before any
spawn op.
**`@serializable` registration is an IMPORT side-effect** (`serializable.ts:21-25`). A component
class never imported is absent from the registry and `deserializeWorld`'s default `"skip"`
policy **silently drops it** (`deserialize.ts:30-39`) → the save/restore assertion passes
VACUOUSLY. Weather components must be imported by whatever the test loads.
