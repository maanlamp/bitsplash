# ECS / serialization / compositions / editor facts (verified) — for W3, W5, W6, W7, W10

## GOTCHA #1 (highest value) — the edit-world save tripwire

`SceneDocument.save()` `scene-document.ts:275-281` → `replayAuthored(config)` `:366` (replays
baseline+journal into a **scratch World**, serializes it) → `assertRoundTrips` `:454` →
**`assertMatchesLive` `:479-487`, which diffs the replay against
`serializeWorld(this.scene.world.ecs)` — the LIVE EDIT WORLD, SERIALIZED WHOLE, no filter.**
Both tripwires `throw` with a `firstDiff` report `:490`.
`ambientSystems()` in `editorEdit` runs in every focused editor edit world
(`scene-view.ts:336`). Therefore ambient/edit systems must:

- **NEVER `createEntity` with a `@serializable` component.** This is exactly why
  `NavGraphComponent` (created by `NavGraphSystem` in the edit world) is deliberately NOT
  `@serializable` (`nav/nav-graph-component.ts:5`); same for `CameraShakeComponent`
  (`camera/camera-shake-component.ts:1`).
- **NEVER write any `@serialize`d field of an authored component.**
- Non-serialized fields, system-instance state, and module-level WeakMap-keyed-by-ECS stores
  are all invisible to the tripwire. **Precedent for the WeakMap store: `editor/pick-index.ts:154`
  `new WeakMap<ReadonlyECS, PickIndex>()` + `getPickIndex(ecs)` / `disposePickIndex(ecs)`
  (disposed from `scene-view.ts:423`).** That is the exact shape for `setWeatherPreview(ecs, …)`
  AND for the ambient clock AND for the weather presentation system's published params.
  => Keeping the scheduler (which ensures `WeatherStateComponent` + `PersistentComponent`) in
  `gameplaySystems` ONLY is load-bearing, not stylistic.

## GOTCHA #2 — `import.meta.glob` throws under `bun test`

Documented at `game/reaction/loader.ts:39-44`. The climate catalog must therefore use
**static JSON imports keyed off a `const` tuple**, the `reaction/loader.ts` pattern:
static imports keyed by `REACTION_TABLE_IDS` (`reaction/reaction-table-ids.ts:22-24`),
validated at module load, `invalid(table, msg)` errors naming the file (`loader.ts:50-51,132-148`),
accessors `reactionsFor(table)` `:156` / `reactionDef(id)` `:167` (hard-throws on a miss).
NOT `import.meta.glob` (which is what `registrations.ts:24-44` uses for scene files, and which
is why scene files aren't reachable from bun tests).

## GOTCHA #3 — MUST VERIFY BEFORE WIRING: possible double-step

The brief claims "anything added to `editorEdit` also runs in the bundled game's scene worlds
built through `registerScene('platformer')`" because `game/scenes/platformer.ts:22-31` applies
`editorEdit({settings, gravityY})` inside the **`SceneFactory`**, while the shipped game applies
the `game` composition via `platformer-runtime.ts:40-55` `registerSystems`.
If BOTH paths hit one world, `ambientSystems()` double-steps in the shipped game — precisely the
hazard the VFX plan documents about `editWorldSystems`. BUT `editWorldSystems` would already
double-step today under that reading, so the claim is suspect: the shipped game most likely
builds scenes via `toSceneDefinition(authored)` (`game/runtime/scene-runtime.ts:135-150`), a
different path from the `Scene`-class factory (editor-only, `project.ts:39`).
**W3 must read both paths and establish which worlds get which composition, then wire
`ambientSystems()` so it is stepped exactly once per world, and state the finding.**

## Serialization

`@serializable(name)` `serializable.ts:21-25`; `@serialize(options?)` `:27-36` — works on
**fields AND getters** (getter+setter pairs supported, cf. `TileLayerComponent.cells`).
`SerializeOptions = {required?, options?: readonly SelectOption[], group?}`
(`serializable-value.ts:19`); `SelectOption = string | {label, value}` `:15`; `group` renders
fields side-by-side in one inspector row (`editor/inspector/grouping.ts:11-41`).
Registry (`serialization/registry.ts`): `registerSerializable` `:27`, `serializableTypeName` `:47`,
`serializableType` `:52`, `fieldOptions(typeName, field)` `:56`, `componentClass` `:62`,
`registeredComponents()` `:66` (filters out value types).
`serializeWorld(ecs, predicate?)` `serialize.ts:60-68` — **the predicate is the ONLY partition
knob** (used for the persistent/scene split). No component filtering, ever.
`reconstruct` `value.ts:117` does **`new ctor()` with NO ARGS**, then assigns only present
fields; value-type fields are filled **in place** (`fillValueType` `:90`). Absent fields are
skipped, not nulled (`:104`).
=> Every `@serializable` class must be zero-arg constructible with working defaults, enforced by
the custom lint rule `require-default-fields-oxc-plugin.ts` ("must have a default initializer";
constructor param defaults also satisfy it).
Value types additionally implement `get [VALUE_TYPE](): true` (precedent
`scene/scene.ts:25-34` `SceneConfig`).
**Component modules are registered by a GLOB SIDE EFFECT**: `game/registrations.ts:17-20`
eagerly imports `../engine/**/*-component.ts` and `./*/*-component.ts`.
=> **a new engine component file MUST be named `*-component.ts`** or it is absent from the
registry: game/prefab paths then **silently skip** it (`UnknownComponentPolicy` default `"skip"`,
`deserialize.ts:21-39`) while the editor's open path (`createScene(id, services, "throw")`,
`project.ts:39`) throws.

## ECS

`EntityId = ReturnType<typeof crypto.randomUUID>` `ecs.ts:16`.
`createEntity(components = [], id = crypto.randomUUID())` `:63` (**throws on duplicate id** `:67-71`),
`addComponent` `:80` (registers under EVERY ancestor ctor `:85-89`, so base-class queries work),
`getComponent` `:93`, `removeComponent` `:100`,
`onDestroy(cls, hook)` `:105`, `destroy` `:112` (**deferred**), `flushDestroyed()` `:124`,
`first` `:160` (**exists but unused in src/**), `find` `:172`, `query(...classes)` `:185`
(full linear scan, fresh array每 call — no archetypes, no caching),
`entities()` `:218`, `componentsOf` `:222`, `addUpdateSystem` `:238`, `addRenderSystem` `:281`.
`ReadonlyECS = Pick<ECS, "query"|"getComponent"|"entities"|"componentsOf"|"first"|"find">` `:332`.
**Singleton idiom in this codebase is `ecs.query(X)[0]?.[1]`**, not `first()`
(`game/hitsplat/hitsplat-system.ts:17`, `game/combat/damage-shake-system.ts:26`).
**Lazy self-ensure precedent (what the weather scheduler wants)** — `nav/nav-graph-system.ts:26-32`:

```ts
let entry = ecs.query(NavGraphComponent)[0];
if (!entry) {
	const c = new NavGraphComponent();
	c.gravity = this.gravity;
	ecs.createEntity([c]);
	entry = ecs.query(NavGraphComponent)[0]!;
}
```

**Every update system needs `@profiler("Name","Group")`** (`profiling/profiler.ts:19-22`) or
editor worlds (always profiled: `scene-view.ts:129`, `run-host.ts:93`) log a warning per class
and run it untimed. Duplicate labels get `#2`/`#3` suffixes (`ecs.ts:259-279`).
Systems are plain classes `implements UpdateSystem`, constructed by hand in composition
factories — no DI container.

## PersistentComponent

`scene/persistent-component.ts` is the whole file: `@serializable("PersistentComponent") class
PersistentComponent {}` — a pure marker. Behavior is all in `runtime/runtime.ts`:
`isSceneContent(id)` `:137` = `getComponent(id, PersistentComponent) === undefined`;
`freezeSceneContent` `:144`; `despawnSceneContent` `:151` (destroys every non-persistent entity
on scene exit); `goToScene` `:70`; `snapshot()` `:91` = `{activeSceneId, persistent:
serializeWorld(!isSceneContent), scenes: {id: serializeWorld(isSceneContent)}}`;
`restore` `:115`; `newGame` `:59` (second call throws).
One `World` for the whole run; persistent entities are never destroyed across scene changes.
Real user: `game/runtime/new-game-seed.ts:12-33` (player + 3 global singletons each
`[XComponent, new PersistentComponent()]`), wired as `RuntimeOptions.seed` at
`game/shell/platformer-runtime.ts:66`. Test precedent `test/support/counter-fixture.ts:36`.
=> a lazily self-ensured weather state entity must add `PersistentComponent` **itself at
creation time** to land in the persistent partition.

## compositions.ts — exact edit sites

| lines   | symbol                                                                                                                |
| ------- | --------------------------------------------------------------------------------------------------------------------- |
| 84-87   | `editWorldSystems(gravityY)` (module-private) = `[TileCollisionSystem(Layer.Terrain), NavGraphSystem(abs(gravityY))]` |
| 94-146  | `gameplaySystems(settings)` (module-private), 45 systems                                                              |
| 152-175 | `renderSystems()` (module-private)                                                                                    |
| 181-190 | `export const game: Composition`                                                                                      |
| 197-203 | `export const editorRun: Composition`                                                                                 |
| 210-215 | `export const editorEdit: Composition`                                                                                |

`gameplaySystems` tail order `:142-145`: Camera2DFollow, ScreenFade, CameraTransition,
**CameraShake — the very LAST entry**. So `...ambientSystems()` spread after
`gameplaySystems(settings)` is strictly post-camera, satisfying the VFX ordering requirement.

```ts
export const game: Composition = ({ settings, gravityY }) => ({
	// :181-190
	update: [
		...editWorldSystems(gravityY),
		...gameplaySystems(settings),
	], // insert at :187
	render: renderSystems(),
});
export const editorEdit: Composition = ({ gravityY }) => ({
	// :210-215
	update: editWorldSystems(gravityY), // :213 → [...editWorldSystems(gravityY), ...ambientSystems(...)]
	render: renderSystems(),
});
```

`CompositionContext` supplies only `{settings, gravityY, hud?}` (`runtime/game-module.ts:28-35`)
— extend it if `ambientSystems()` needs more.
**Paired update+render factory sharing one instance:** the `renderSystems()` body `:153-168`
constructs the shared stateful object locally then hands the SAME instance to each system
(`DecorationsRenderSystem(surfaceDecorations)`). For a cross-list pair the established shape is
a factory returning `{update, render}` — `game/ui/editor-hud.ts:25-51` `createEditorHud`, typed
as `CompositionSystems`/`GameUi` in `runtime/game-module.ts:38-41,54-58`.
**`editorRun` IS dead code — confirmed.** Only references: the type field
(`game-module.ts:90`), the definition (`compositions.ts:197`), and the import + object literal
publishing it (`platformer-runtime.ts:18,93`). Nothing calls it. The real editor run world is
`RunHost` → `gameModule.createRuntime` (`run-host.ts:89`) → `buildRuntime`
(`platformer-runtime.ts:57-69`) → `registerSystems` `:40-55`, which adds the **`game`**
composition; the HUD is added separately by `RunHost.mountUi()` `run-host.ts:262-270`.
Its stale docstring `compositions.ts:192-196` is wrong on both sentences → fix it (plan step 20).

## Inspector

`FieldControl` dispatch order (`editor/inspector/inspector.tsx:67-117`):

1. `isValueObject(value) && getValueRenderer(value)` → value renderer with `binding.sub([key])` `:78-85`
2. `fieldOptions(typeName, fieldKey)?.options` → `<EnumSelect>` `:92-100`
3. `typeof value === "number"` → `NumberInput` `:102`
4. fallback `TextInput` `:111`
   **There is NO null handling** — a `string | null` field with no renderer and no `options` lands
   in `TextInput value={null}`. So `climateId: string | null` NEEDS a custom renderer.
   `ComponentSection` `:241`: `getValueRenderer(component)` `:250` — **a whole-component renderer
   REPLACES the entire field list** `:277-287` and receives the component-level binding `:278`
   (so paths are `["climateId"]` / `["indoor"]`, no `.sub`).
   `registerValueRenderer(ctor, renderer)` `editor/inspector/value-renderers.ts:14`,
   `getValueRenderer(value)` `:21` (keyed on `value.constructor`). Registrations in
   `editor/inspector/register-renderers.tsx` (Angle 24, Duration 28, Percent 32, Color 36,
   EntityRef 40, Easing 44, AssetRef 48, Vector2 52, FontSettings 69, **SpriteComponent 73 =
   whole-component precedent**); module imported for side effects at `editor/app.tsx:44`.
   `FieldBinding` (`editor/commands.ts:266-277`) = `{resolve, commit(path, after), record(path,
before, after), sub(prefix)}`; `commit` no-ops when unchanged `:294-297`. Constructors:
   `entityFieldBinding(document, entity, componentType)` `:314`, `multiEntityFieldBinding` `:355`,
   `configFieldBinding(document)` `:410`.
   **Dynamically-sourced dropdown with a None→null sentinel — the exact precedent** is
   `editor/inspector/entity-ref-picker.tsx:10-29`:

```tsx
const NONE = "";
const options: SelectOption[] = [{label: "None", value: NONE}, ...ids.map(...)];
<EnumSelect value={value.id ?? NONE} options={options}
  onCommit={(v) => binding.commit(["id"], v === NONE ? null : (v as EntityId))} />
```

`EnumSelect` is `editor/inspector/inputs.tsx:114-168` (base-ui `Select`, portalled via
`usePortalContainer()`); `optionEntries` `:105` accepts bare strings or `{label,value}`.
Tri-state `options` precedents: `tilemap/tile-layer-component.ts:15`,
`game/faction/faction-component.ts:9`, `physics/physics-body-component.ts:19`,
`game/pickup/pickup-component.ts:17`, `text/font-settings.ts:33`.
⚠️ `TileLayerComponent` fields are ALSO edited by the bespoke `editor/tile-layers-panel.tsx`
(own base-ui Select + `COLLISION_MODES` map `:41-45`) journalling via
`setTileLayerCollision` → `entityFieldBinding(document, id, "TileLayer").commit(["collision"], v)`
(`editor/tile-layer-commands.ts:187-196`). Mirror that 6-line command for `rainBlocking` if the
layers panel should carry the control too.
Add-component palette: `editor/entity-context-menu.tsx:158-186` — `registeredComponents()`
filtered by attached names, `new ctor()` + `addComponent(document, entity, …)`.

## Editor scene view: toolbar, popover, ticking

`FloatingToolbar` `editor/floating-toolbar.tsx:6-24` (`{children, align?: "top"|"bottom"}`,
stops mousedown/contextmenu propagation, wraps a `TooltipProvider`).
The scene view toolbar is `editor/toolbar.tsx:29-92`, ending with
`<DebugOverlaysPopover flags={debugFlags} />` `:89`; mounted at
`editor/scene-view-panel.tsx:297-308` in `styles.canvasStack` beside `<PerfOverlay>` `:286`
and `<PlaybackBar>` `:287`, fed `debugFlags={view.debugFlags}` `:307`.
**Popover-off-toolbar precedent to copy verbatim** — `editor/debug-overlays-popover.tsx:47-79`:
`Popover.Root` > `Tooltip` > `Popover.Trigger render={<Button variant="icon">…}` +
`Popover.Portal container={usePortalContainer()}` > `Popover.Positioner sideOffset={8}` >
`Popover.Popup className={clsx(surface.surface, styles.popup)}`.
Row state via `useEditorValue(flags, f => f.get(id))` `:22` over a `Subscribable`
(`editor/subscribable.ts`); store precedent `editor/debug-flags.ts` (`DEBUG_OVERLAYS` catalog
`:18-50`, localStorage-backed `class DebugFlags extends Subscribable` with `get/set/toggle`
`:82-103`), instantiated as `useRef(new DebugFlags())` at `app.tsx:338`.
Styles precedent `debug-overlays-popover.module.scss`.
**Focused-view ticking** — the real loop is `startWindowLoop` `editor/app.tsx:1270-1365`
(the plan's "app.tsx:779-784" reference is STALE; that range is the dirty-guard helper).
Per-window rAF + own `Clock`, `MAX_DT` clamp `:1287`. Key lines:
`if (host && isRunAnchorWindow && !isGuardDialogOpen()) host.frame(dt, now)` `:1303-1305`;
`if (host && view !== host.view) continue` `:1319-1321` (one run at a time, others frozen);
**`if (viewId === focusedId) view.update(dt, now)` `:1328-1329` else `view.rollInput()` `:1331`;
`view.render(now)` `:1333` always.**
=> **only the focused scene view ticks its edit world**, so "weather audio plays only for the
focused view" comes FREE — but an unfocused view freezes mid-gust while still rendering.
`SceneView.update(dt: Milliseconds, time: Time)` `editor/scene-view.ts:322-344`: `input.update()`,
builds `UpdateContext` with `actions: NULL_ACTIONS` and `camera: this.displayCamera()` (the
EDITOR camera), then `scene.world.ecs.update(ctx)` `:336` ← where `editorEdit` + `ambientSystems()`
run. **`SceneView.update` never calls `world.step()` and never `flushDestroyed()`** — the edit
world never simulates physics and never drains destroys.
`render(time)` `:353-384`. Ctor `:72-78`:
`new SceneView(id, document, store, debugFlags, services)`, constructed at `app.tsx:491-497`
in `ensureSceneView` — the one place to thread a new per-view store.

## Pause

`Game.setPaused` `game.ts:94-96` (`private isPaused` `:51`, `get paused()` `:82`) gates ONLY
`updateScene`: `runGameplay` `:129-133` is `if (!this.isPaused) this.updateScene(...)`;
`this.renderScene(now)` `:149` is outside the guard. Clock advance, UI stepping and event
clearing all continue while paused. Callers: `game/shell/game-shell.ts:104,151,158,174,199,240`.
`RunHost` `editor/run-host.ts:70-281`: `get paused()` `:103`, `setPaused` `:137`, `togglePause`
`:142`, `step()` `:147` (paused-only; one `FIXED_DT_MS = 1000/60` update with **muted input**,
`this.muted = new Input(document.createElement("div"))` `:73`), `frame(dt,time)` `:163`
(`if (!paused) stepWorld(...)`), `endFrame()` `:175`, `stepWorld` `:195`.
=> paused ⇒ no `ecs.update` ⇒ no ambient clock tick ⇒ no weather tick, while rendering
continues. **Pause freezes stepping rather than signalling it, so any "suspend the ambience"
behaviour must be host-driven** (`Game.setPaused`, `RunHost.setPaused`/`step`) — a system cannot
observe pause. (This is why the notes-audio decision #2 staleness-ramp works: no ticks → the
graph ramps itself down.)
Pause is also implicitly forced by the dirty-guard dialog (`app.tsx:1303`,
`editor/workspace/guard-signal.ts`). Editor plumbing: `app.tsx:1137`, `app.tsx:1250`,
buttons in `editor/playback-bar.tsx`.
