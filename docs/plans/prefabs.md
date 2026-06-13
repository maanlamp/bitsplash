# Prefabs & Composition — Architectural Plan

Status: **planned** (no implementation yet). README has the summary; this is the
pick-up brief.

## 1. Goal

Turn the rudimentary prefab into a real authored-template system: engine-level,
with variants and instance overrides, so scenes can instance templates compactly
and prefab edits propagate. Keep it single-entity and data-driven; no hierarchy.

## 2. Where we are today

- `game/prefabs.ts` — glob-loads `game/prefabs/*.json` into a `Map<name, def>`.
  A prefab def is `{ components: Record<typeName, fields> }` — i.e. **a serialized
  entity without an id**. `spawnPrefab(world, name, position, id?)` runs
  `deserializeEntity`, then overwrites `Transform.position`.
- Only consumer: `game/systems/spawn.ts` (`SpawnSystem` reads
  `SpawnPointComponent.prefab`).
- Files: `player.json`, `enemy.json`, `arrow.json` — flat component dicts with
  literal defaults; `$type: "Vector2"` markers for vectors.
- No inheritance, no overrides, no nesting, no editor authoring, game-layer only.

A prefab is therefore already "a serialized entity template." The gap is
_capability_, not concept.

## 3. Locked decisions

1. **Data prefab is the core concept**, promoted to the **engine**. A "bundle" is
   an optional thin code helper — sugar, not a parallel system.
2. **Single-inheritance variants** (`extends`), resolved by field-level merge.
3. **Instances = prefab ref + overrides** (not baked copies). This is the scene
   content entity format.
4. **No entity hierarchy, ever** — prefabs are single-entity; groups are a
   spawner-system concern wiring entities by id.

## 4. Architecture

### 4.1 Prefab definition (data, extended)

```
{
  "extends": "enemy",          // optional: one base prefab
  "components": {              // add/override components & fields
    "Patrol": { "speed": 80 }
  }
}
```

**Resolution (at load/registration):** walk the `extends` chain to a root, then
merge **field-level** from base → derived: a derived component's fields overwrite
the base's same-named fields; components only in the base are inherited whole;
new components are added. Result is a flattened component set identical in shape
to today's prefab def. Cycle detection on the `extends` chain.

### 4.2 Engine prefab registry + resolution

Mirror the component registry pattern. Engine owns:

- `registerPrefab(name, def)` / `resolvePrefab(name): ResolvedPrefab`
- inheritance flattening + cycle detection
- `instantiate(world, name, overrides?, id?): EntityId` — resolve → apply
  overrides → `createEntity`. Generalizes today's `spawnPrefab` (position becomes
  just a `Transform.position` override).

The game wires its JSON in via the existing `import.meta.glob` and calls
`registerPrefab` (same polarity as component registration — engine provides the
mechanism, game provides the data).

### 4.3 Instance format (prefab ref + overrides)

Scene/level entity entries become a union:

```
// prefab instance
{ "id": "...", "prefab": "fast_enemy", "overrides": {
    "Transform": { "position": { "$type": "Vector2", "x": 32, "y": 16 } },
    "Patrol":    { "speed": 120 }
} }

// bare entity (no prefab) — today's full form, still supported
{ "id": "...", "components": { ... } }
```

**Instantiation:** resolve prefab (incl. inheritance) → deep-merge `overrides`
field-level over the resolved components → revive. Bare entities skip the prefab
step. `deserializeEntity` gains a prefab-aware path; `deserializeWorld` /
scene-content loading dispatches on presence of `prefab`.

**Override semantics:** an override is recorded per `component.field`. Adding a
component not in the prefab is allowed (full component in `overrides`). Removing a
prefab component on an instance — out of scope initially (flag if needed).

### 4.4 Editor authoring flow

- **Create prefab:** select an entity → "Save as prefab" → serialize its
  components into a new `*.json`.
- **Place instance:** placing a prefab creates `{ prefab, overrides:{} }`.
- **Edit instance:** the inspector compares each edited field to the resolved
  prefab value; differing fields are written to `overrides`; matching fields are
  removed from `overrides`. Per-field **"revert to prefab"** clears an override.
  Overridden fields get a visual marker (Unity-style).
- **Edit prefab:** editing the prefab updates all instances' un-overridden fields
  on next load (no live-link runtime propagation needed — resolution happens at
  instantiation).

### 4.5 Bundles (optional code sugar)

A bundle is just a function returning component instances, composable:

```
const physicsSprite = (o) => [new TransformComponent(o.pos), new SpriteComponent(o.url), new PhysicsBodyComponent(o.body)]
```

Used in scene factories / runtime spawning where code-first is preferred. The
engine may ship a couple of common ones, but it's a convention, not a framework.
**Bundles and data prefabs are independent** — we deliberately do not build a
bridge between them; the data path (prefab + overrides) and the code path
(factories + bundles) coexist. (Keeps scope minimal per defer-optimization.)

### 4.6 No-hierarchy consequence

Cross-entity wiring is by id, set at spawn — exactly how `SpawnSystem` already
sets `respawn.spawnPoint = event.spawnPoint`. A "multi-entity prefab" (boss +
turrets) is a **spawner system** that instantiates several prefabs and writes each
other's ids into the relevant components. There is no prefab sub-tree and never
will be.

## 5. Layering

- **Engine:** prefab registry, inheritance resolution, override merge,
  `instantiate`, the instance/bare-entity format in (de)serialization.
- **Game:** the prefab JSON files + their `import.meta.glob` registration.
- **Editor:** save-as-prefab, instance override tracking + revert UI, prefab
  browser.

## 6. Migration path

1. Move prefab registry/resolution into the engine; `game/prefabs.ts` becomes
   thin glob-registration. `spawnPrefab` → engine `instantiate` (position as a
   Transform override). No behaviour change.
2. Add `extends` resolution + cycle detection; add a variant prefab to prove it.
3. Add the `{prefab, overrides}` instance form to (de)serialization alongside the
   bare-entity form; teach scene-content loading to dispatch.
4. Editor: instance override tracking + revert; save-as-prefab.
5. (Optional) introduce a couple of code bundles where factories are verbose.

## 7. Open sub-decisions / handoffs

- **Override migration** — prefab field rename/removal leaves dangling override
  keys. Handled jointly with the **Save system** (task 3) versioning + a load-time
  validation that drops/warns on unknown override keys.
- **Scene content format** — this doc fixes the entity entry as the
  `{prefab, overrides}` / bare-entity union; update `docs/plans/scenes.md` §4.8
  accordingly (done).
- **Component removal on instances** — deferred; add only if a real need appears.

## 8. Primary files touched

- New: `engine/prefab/registry.ts`, `engine/prefab/resolve.ts`,
  `engine/prefab/instantiate.ts`.
- Changed: `engine/serialization/deserialize.ts` (prefab-aware path),
  `game/prefabs.ts` (→ thin registration), `game/systems/spawn.ts` (use engine
  `instantiate`), `game/prefabs/*.json` (may adopt `extends`), editor inspector
  (override tracking).
