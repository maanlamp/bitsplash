# Scene System — Architectural Plan

Status: **planned** (no implementation yet). This doc is the pick-up brief for
when we build scenes. README has the roadmap-level summary; this has the detail.

## 1. Goal

Partition the game into independently-simulated **scenes** (levels, house
interiors, main menu, pause overlay) instead of one hardcoded `World`. The editor
should open and edit any scene the way it currently edits the single demo world,
and eventually show several side-by-side.

## 2. Where we are today

The "scene" already exists — it's just singular and hardcoded across two files:

- `engine/game.ts` — `Game` constructs **one** `World` (ECS + physics + its own
  `EventBus` + fixed-timestep accumulator) and exposes `game.world` / `game.ecs`.
  The frame loop calls `ecs.update(ctx)` then `ecs.render(ctx)` then
  `renderActiveCamera(renderer, ecs, uiScale)`.
- `game/fantasy-platformer.ts` — the real scene assembly. Its constructor:
  - owns a `TileGrid` and bridges it to the World via `new TileCollisionBaker`,
  - builds decoration sources from the grid,
  - registers an **always-on** set of render systems (so the editor shows the
    world while paused),
  - holds a **toggled** set of gameplay update systems, added on
    `setSimulating(true)` and removed on stop,
  - loads content (`loadDemoLevel`),
  - implements play/edit as serialize-snapshot → simulate → `world.clear()` +
    re-`loadLevelEntities` (restore), and `spawnRuntimeEntities` on play.

So a scene is conceptually: **own World + tilemap + a system set + authored
content + a play/edit lifecycle.** The work is generalizing this bundle and
making `World` non-singleton.

## 3. Locked decisions

1. **Scene = own World** (own ECS + physics + event bus + optional tilemap). Full
   isolation; kills the `Game.world` singleton.
2. **Code factory + content data** — scene _kind_ = TS factory (rules/systems);
   scene _content_ = serialized data file (tiles + entities + config).
3. **Additive stack** of simultaneously-active scenes; each entry has explicit
   flags.
4. **Persistence: state persists, player re-spawns.** Persistent scene holds
   non-physical cross-scene state only; physical entities are per-scene content
   restored from that state.
5. **In-game UI = canvas screen-space entities** inside a scene's world (React is
   editor-only).
6. **Event-driven transitions** + async load hook.

## 4. Architecture

### 4.1 `Scene` (engine)

```
class Scene {
  readonly name: string
  readonly kind: string
  readonly world: World           // own ECS + physics + events
  readonly tileGrid?: TileGrid    // platformer scenes have one; menus may not
  // the gameplay (toggled) update systems for this scene
  // render systems are added at build time (always on)
  // play/edit state: simulating flag + snapshot
}
```

The render-vs-gameplay system split from `FantasyPlatformer` is preserved on the
`Scene`: render systems are registered when the scene is built (so an idle/edited
scene still draws); gameplay update systems are toggled by the play/edit
lifecycle.

### 4.2 Scene registry + factories (engine framework, game-defined kinds)

```
type SceneBuildContext = {
  config: SceneConfig          // gravity, tileset url, layers... from the file
  services: GlobalServices     // assets, audio, input, clock (read at build)
}
type SceneFactory = (ctx: SceneBuildContext) => Scene
registerScene(kind: string, factory: SceneFactory)
```

`game/scenes/platformer.ts` becomes essentially today's `FantasyPlatformer`
constructor body, refactored into a factory. `game/scenes/main-menu.ts` is a
second factory with a UI-only system set and no tile collision. This keeps the
engine's code-first / factory-spawn convention — systems stay TS classes with
real constructor args; only content is data.

### 4.3 `ActiveScene` stack entry + `SceneManager` (engine)

```
type ActiveScene = {
  scene: Scene
  update: boolean
  render: boolean
  blocksUpdateBelow: boolean
  blocksInputBelow: boolean
}

class SceneManager {
  registry: Map<string, SceneFactory>
  stack: ActiveScene[]            // bottom .. top
  persistent: Scene | null        // always-bottom, never unloaded

  // event-driven (see 4.6)
  load(kind, content)             // replace gameplay scene
  push(kind, content, flags)      // overlay (pause menu, dialog scene)
  pop()
}
```

**Update order:** walk the stack top → bottom; update entries with `update:true`;
stop descending when an entry has `blocksUpdateBelow:true` (pause menu freezes the
gameplay scene below it).

**Input routing:** top entry receives input; an entry with `blocksInputBelow:true`
prevents lower entries from receiving it. (Input itself stays a global service —
this is a routing flag, not a per-scene `Input`.)

**Render order:** bottom → top (painter's), each scene rendered with its own
camera (see 4.5).

### 4.4 Context split + `Game` refactor

The update/render context currently mixes global services with the single
world/ecs/events. Split cleanly:

- **Global services** (live on `Game`, passed to every scene's context):
  `input`, `assetManager`, `audio`, `clock`/`time`, `renderer`.
- **Per-scene** (vary by which scene's context is being built): `ecs`, `world`,
  `events`.

The frame loop becomes: for each active scene (per update/render rules), build a
context with the global services + that scene's ecs/world/events and run
`ecs.update` / `ecs.render`. `ecs.update(ctx)` is already per-ECS, so this is
mostly a loop + context-assembly change, not an ECS rewrite.

`Game` stops owning a `World`; it owns a `SceneManager`. `game.world` / `game.ecs`
become conveniences resolving to the top updating scene (or are removed in favour
of code operating inside a system's own context). The existing two-bus reality
(`Game.events` vs `World.events`) maps naturally: **global bus** = cross-scene +
transition events; **per-scene `world.events`** = intra-scene gameplay events.

### 4.5 Rendering decoupling (enables editor side-by-side)

`renderActiveCamera(renderer, ecs, uiScale)` is generalized to
`renderScene(renderer, scene, target?, uiScale)` — finds the scene's active
camera and composites it onto a target. The game runtime calls it per active
stack entry into the shared frame. The editor calls it per panel into per-panel
targets.

Rendering **N live scenes to N canvases with one WebGL context** is the genuinely
hard part and is **deferred to Editor docking** (task 2) and the renderer
split-screen item already tracked under "WebGL2 renderer deferred". The scene
model only needs to _not preclude_ it — hence `renderScene` taking renderer +
target as parameters rather than Scene owning the global renderer.

### 4.6 Transitions

Events on the **global** bus:

- `LoadScene { kind, contentRef }` — replace the gameplay scene.
- `PushScene { kind, contentRef, flags }` — overlay (pause, dialog).
- `PopScene` — remove the top overlay.
- `ReplaceScene` — swap without touching the stack below.

`SceneManager` handles them: await asset preload for the incoming scene → run an
optional transition (fade) hook → build scene via factory → load content →
swap/unload (`World.clear` tears down physics bodies + ECS) → release outgoing
scene's asset refs. The fade overlay is itself a screen-space draw (ties into the
screen-space UI pass).

### 4.7 Persistence

- The **persistent scene** is built once at game start and pinned to the bottom of
  the stack; transitions never unload it.
- It holds **non-physical** entities only: save state, inventory, run managers,
  audio controllers. No tilemap, no player body.
- Player & other physical entities are **per-scene content**, spawned into each
  gameplay scene (reusing `spawnRuntimeEntities` on play) and **restored from
  persistent state** at spawn time.
- Cross-scene read access: `SceneManager.persistent.world` is reachable from
  gameplay systems via the context, OR persistent values are surfaced as shared
  engine-stub resources (the pattern already used for `time`). **Open
  sub-decision — see §7.**

### 4.8 Scene content file format

Generalizes `demo.json` + serialized entities into one scene file:

```
{
  "version": 1,
  "kind": "platformer",
  "config": { "gravity": {...}, "tileset": "dirt.tileset.png", ... },
  "tiles":    [...],            // current demo tile data
  "entities": [...]             // current serializeWorld output (authored only)
}
```

This is the authored baseline. **Saves are runtime snapshots of the same shape**,
so this format must be designed hand-in-hand with the Save system (task 3),
including the `version` field for migration. The serialization "derive not store"
principle still holds for the authored file; the save system is the thing that
layers runtime snapshots on top.

`entities[]` entries are the union fixed by `docs/plans/prefabs.md`: a prefab
instance `{ id, prefab, overrides }` or a bare entity `{ id, components }`. Scene
content authored in the editor uses prefab instances where possible so prefab
edits propagate and files stay small.

## 5. Layering

- **Engine:** `Scene`, `SceneManager`, `ActiveScene`, scene registry, transition
  events, `renderScene`, the play/edit lifecycle (snapshot/simulate/restore).
- **Game:** concrete scene factories (`platformer`, `main-menu`, `persistent`),
  scene content files (replacing the hardcoded `demo.ts`; `demo.json` becomes a
  scene file), the persistent scene definition. (Per system+component-same-layer:
  the scenes' systems stay game-layer.)
- **Editor:** scene management panel, multi-scene viewports, per-scene play/edit
  controls.

## 6. Migration path (incremental, keeps the demo working each step)

1. **Extract `Scene`** wrapping the existing single World + TileGrid + system
   sets; have `Game` hold one `Scene` instead of a bare `World`. No behaviour
   change.
2. **Move play/edit lifecycle** (snapshot/simulate/restore, spawn-on-play) from
   `FantasyPlatformer` onto `Scene`. `FantasyPlatformer` becomes a thin factory.
3. **Introduce `SceneManager`** with a single-entry stack; route the frame loop
   through it. Still one scene — proves the context split.
4. **Add the registry + factories**; convert `FantasyPlatformer` into a registered
   `platformer` factory; convert `demo` into a scene content file.
5. **Additive stack + flags**; add a trivial overlay scene (e.g. pause) to
   exercise `blocksUpdateBelow` / `blocksInputBelow`.
6. **Transition events + async load**; add a second gameplay scene + a door/portal
   that emits `LoadScene`.
7. **Persistent scene**; move save/inventory-style state into it; restore player on
   spawn.
8. **Editor scene management**; open/close scenes, set start scene. (Side-by-side
   rendering waits on Editor docking.)

## 7. Open sub-decisions / handoffs

- **Cross-scene data access** (persistent → gameplay): persistent-scene-world
  reachable via context, vs. shared engine-stub resources. Lean: start with
  context access; promote to shared resources if it spreads.
- **Global vs per-scene event bus routing** — confirm the split (cross-scene =
  global, gameplay = per-scene `world.events`) survives contact with real
  cross-scene features (e.g. a kill in a scene updating persistent score).
- **Scene content file format** — finalize jointly with the **Save system**
  (task 3); the `version` field is the migration seam.
- **Multi-target / N-canvas rendering** — owned by **Editor docking** (task 2) +
  renderer split-screen; scene model stays renderer-agnostic via `renderScene`.
- **Transition effects** — depend on a usable screen-space draw path.

## 8. Primary files touched

- New: `engine/scene/scene.ts`, `engine/scene/scene-manager.ts`,
  `engine/scene/registry.ts`, `engine/scene/events.ts`,
  `game/scenes/*.ts` (factories), `game/scenes/*.scene.json` (content).
- Changed: `engine/game.ts` (own a `SceneManager`, context split, loop),
  `engine/systems/camera-2d.ts` (`renderActiveCamera` → `renderScene`),
  `game/fantasy-platformer.ts` (collapse into a factory),
  `game/levels/demo.ts` (→ scene content), `editor/app.tsx` + editor systems
  (operate on the focused scene).
