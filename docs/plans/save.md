# Save System — Architectural Plan

Status: **planned** (no implementation yet). README has the summary; this is the
pick-up brief. Designed jointly with `scenes.md` and `prefabs.md` (shared format).

## 1. Goal

A runtime progress-save system that **consumes** the existing serialization rather
than duplicating it, giving a clean partition: low-level codec → authored scene
content → runtime saves. Slots-as-files, full world-state snapshots, versioned
best-effort migration, checkpoint + auto-save built on top.

## 2. Where we are today

- `serialization/serialize.ts` — `serializeWorld(ecs)` walks every entity, every
  component, every plain/`Vector2` field → `SerializedWorld`. Non-plain objects
  (e.g. the planck `Body` on `RigidbodyComponent`) encode to `undefined`, so
  derived runtime state is naturally excluded.
- `serialization/value.ts` — `encode/decodeValue`, `$type: "Vector2"` marker.
- `game/levels/demo.ts` — `loadDemoLevel` loads `demo.json` (`tiles` + `entities`)
  into the World; `spawnRuntimeEntities` spawns player/camera/bow on play.
- `game/fantasy-platformer.ts` — `setSimulating(true)` snapshots the live world
  (`serializeWorld`) and restores it on stop (`world.clear()` +
  `loadLevelEntities`). **So runtime snapshot+restore already exists** — the save
  system generalizes and persists it.

The "no runtime snapshots" principle (`serialization-derive-not-store` memory)
governs the **authored level file**, not a ban on snapshotting; the save system is
the sanctioned home for runtime snapshots.

## 3. Locked decisions

1. **Full world-state snapshots** — every save captures all loaded scenes'
   runtime/entity state + the scene stack + the persistent scene. One format; no
   delta, no checkpoint-vs-snapshot duality.
2. **Files only** via the **File System Access API** (Chrome); download/upload
   fallback. No IndexedDB / localStorage for saves.
3. **Best-effort migration + report** — linear N→N+1 registry; drop unresolved
   bits, load the rest, report what was dropped.
4. Tiles: authored tiles **referenced** by scene-content id+version, not
   duplicated; only runtime-**mutated** tiles are snapshotted. (Honors
   derive-not-store; flagged open — see §7.)

## 4. The three-layer partition

- **Serialization** (engine, low): entity/component ↔ plain JSON
  (`serialize.ts` / `deserialize.ts` / `value.ts`). Unchanged; everyone uses it.
- **Scene content** (authored): a scene file = tiles + prefab-instances + config,
  written by the **editor**. The baseline. (See `scenes.md` §4.8.)
- **Save** (runtime): a versioned, slotted, file-persisted snapshot of progress,
  written by the **game at runtime**. New.

The editor's "save scene" and the game's "save progress" are different operations
on the same codec — this is the "more useful divide" the rethink is for.

## 5. Save blob format

```
{
  "version": 3,
  "savedAt": <number>,            // stamp passed in (no Date.now in engine code)
  "meta": { "slot": "...", "label": "...", "playtimeSeconds": ... },
  "stack": [                      // the active scene stack, bottom..top
    { "kind": "platformer", "contentId": "world-1", "contentVersion": 2,
      "flags": { "update": true, "render": true, "blocksUpdateBelow": false, "blocksInputBelow": false },
      "entities": [ ...SerializedWorld... ],
      "tileDelta": [ ... ] | null            // only if tiles mutated at runtime
    }
  ],
  "persistent": { "entities": [ ...SerializedWorld... ] }   // the persistent scene
}
```

- `entities[]` reuse the exact `SerializedEntity` shape from serialization.
  (Note: prefab provenance is generally not needed in a save — runtime entities
  serialize their full live components; the `{prefab,overrides}` form is an
  authoring-time concern. Confirmed handoff with `prefabs.md`.)
- `contentId`/`contentVersion` let load rebuild a scene's immutable parts (tiles)
  from authored content while restoring mutable entity state from the save.

## 6. Engine `SaveManager`

- `capture(sceneManager, stamp, meta): SaveBlob` — serialize the persistent scene
  - each active scene's entities (+ tile delta if any) + stack flags.
- `restore(sceneManager, blob): void` — for each saved scene: build it via its
  registered factory by `kind` (NOT loading authored entities), restore tiles from
  authored content (+ apply tile delta), deserialize saved entities into its
  world; rebuild the stack + flags; restore the persistent scene. Bypasses
  authored entity content entirely — the save is authoritative for runtime state.
- `migrate(raw): SaveBlob` — run the version chain; collect a `MigrationReport`
  of dropped components/fields/override-keys; loadable result.
- **File backend** — `pickSaveDirectory()` (FS Access dir handle) → slots are
  files; `write(slot, blob)`, `read(slot)`, `list()`, `delete(slot)`. Handle is
  re-used across the session for silent overwrites. `exportToFile` / `importFile`
  via Blob download + `<input type=file>` as the portable fallback.

`Date.now()`/`new Date()` are unavailable in engine code that must stay
deterministic; the timestamp is passed into `capture` by the caller.

## 7. Game-layer: checkpoints + auto-save

- **`CheckpointComponent`** + `CheckpointTriggerSystem` — on overlap/interact,
  emit a save to a checkpoint slot. A checkpoint is just an automatic full-save
  trigger; no special format.
- **Auto-save system** — periodic (timer) or event-driven save to a dedicated
  `autosave` slot. Engine save API only; policy is game-side.
- **Slot UI** — in-game load/save menu renders as canvas screen-space entities
  (UI principle); the editor may get a React save-debug/inspector panel.

## 8. Layering

- **Engine:** `SaveManager`, save blob types, migration registry + report, FS
  Access file backend.
- **Game:** checkpoint component/system, auto-save system, in-game slot UI,
  the migration functions for game component schema changes.
- **Editor:** optional save inspector / debug panel; the editor's own
  scene-content save is separate (not part of this system).

## 9. Migration path

1. Extract a `SaveManager.capture/restore` from the existing `setSimulating`
   snapshot/restore, operating on a single scene. No persistence yet.
2. Add the FS Access file backend (pick dir, write/read/list/delete).
3. Generalize capture/restore to the full scene stack + persistent scene (needs
   the Scene system).
4. Add `version` + migration registry + best-effort report.
5. Game: checkpoint component/system + auto-save; in-game slot UI.

(Steps 3+ depend on the Scene system landing.)

## 10. Open sub-decisions / handoffs

- **Tile snapshotting** — reference-authored vs always-dump. Recommended:
  reference + runtime tile-delta. Confirm once destructible terrain (if ever) is
  real.
- **Migration registry shape** — linear `migrations[fromVersion] = fn`; whether
  migrations are engine-global or per-component. Lean global save-blob
  migrations + a component-field validation pass.
- **Save format ↔ scene content version skew** — a save references
  `contentVersion`; if authored content changed since the save, the save's entity
  state still wins, but tile references may drift. Validate on load, include in
  the report.
- **Depends on Scene system** for the stack/persistent capture; can be prototyped
  single-scene first.

## 11. Primary files touched

- New: `engine/save/save-manager.ts`, `engine/save/format.ts`,
  `engine/save/migrate.ts`, `engine/save/file-backend.ts`,
  `game/components/checkpoint.ts`, `game/systems/checkpoint.ts`,
  `game/systems/autosave.ts`, in-game save UI.
- Changed: `game/fantasy-platformer.ts` (snapshot/restore → SaveManager),
  scene/scene-manager (capture/restore hooks).
