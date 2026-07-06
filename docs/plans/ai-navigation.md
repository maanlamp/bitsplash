# AI Navigation — Pathfinding, Intent, Cutscene Movement

Status: **planned**. Depends on `play-in-editor.md` (Run mode) landing first —
nav debugging means watching agents path in the viewport with overlays on
while the editor stays live. Supersedes the earlier draft of this document;
the perception/decision-policy pipeline from that draft is retained only as
future work (§9).

## 1. Goal

General platformer pathfinding (walk/jump/fall over the tile grid) that NPC AI
can build on, and a cutscene `moveTo` verb that routes entities properly.
Today NPCs have exactly one behavior — time-based patrol writing
`linearVelocity.x` — and the only movement verb, `walkTo`
(`src/game/cutscene/verbs.ts`), is x-only, obstacle-blind, hangs forever when
blocked, and has divergent player (`scriptedMoveDir`) vs NPC (raw velocity)
paths.

One-way platforms were prototyped and backed out; nav must accommodate them
later **additively** (§8), without implementing them now.

## 2. Design overview

```
producers: PlayerIntentSystem | PatrolSystem | NavAgentSystem (path execution) | cutscene verbs
                     \_______________ MovementIntentComponent _______________/
consumers: PlayerMovementSystem (player feel, game-side) | LocomotionSystem (generic NPC, engine)
```

- **Unified intent, two actuators.** Everyone writes the same
  `MovementIntentComponent`. The player's actuator stays game-side (the
  feel-critical variable-jump/multi-jump/wall-jump/dash logic in today's
  `player-input-system.ts` is preserved verbatim, re-sourced from intent);
  NPCs get a small generic engine `LocomotionSystem`. One intent truth, no
  regression risk from genericizing player feel, engine never imports game.
- **Nav graph in `src/engine/nav/`**, built from the tile grid behind a
  `NavSurface` seam — nav code never touches `isSolidCell` directly.
- **Capability-tagged edges**: one graph serves all agents; A\* filters edges
  by the querying agent's jump/move/drop/height capability.
- **Path execution emits intent**; the cutscene `moveTo` verb points a
  `NavAgentComponent` at a target and waits.

## 3. Milestone 1 — Intent seam (game plays identically after)

New engine slice `src/engine/locomotion/`:

- `movement-intent-component.ts` — `@serializable("MovementIntent")`,
  all-runtime fields: `moveX` (-1..1), `jumpPressed` (edge), `jumpHeld`
  (level, variable height), `jumpSpeed: number | null` (scripted arc
  override), `wantDrop` (reserved for one-way drop-through, unused now).
- `locomotion-component.ts` — NPC tuning: `maxSpeed`, `acceleration`,
  `deceleration`, `airControl`, `jumpSpeed`; runtime `grounded`, `facing`.
- `locomotion-system.ts` — queries intent + locomotion +
  `PhysicsBodyComponent`; same approach-impulse math as the player
  (`applyImpulse(mass * (newVx - vx))`, air-control factor); grounded jump
  sets `linearVelocity.y = -(intent.jumpSpeed ?? loco.jumpSpeed)`. No
  dash/wall/multi-jump. The player never has `LocomotionComponent`, so no
  double actuation.
- `src/engine/physics/grounded.ts` — `computeGrounded(body)` extracting the
  `normal.y > 0.5` contact scan from the (currently player-only)
  `GroundDetectionSystem`; both it and `LocomotionSystem` use it.

Player split (game layer):

- New `src/game/player/player-intent-system.ts`: keyboard → intent (`moveX`,
  `jumpPressed`/`jumpHeld` edge detection moves here). Writes nothing while
  `isCutsceneActive` (zeroing intent on cutscene start) so verbs/nav own
  intent during cutscenes. Dash key stays in the movement system —
  actuation-adjacent, accepted impurity rather than inventing
  `ActionIntentComponent` now.
- Rename `player-input-system.ts` → `player-movement-system.ts`: identical
  logic, `dir` from `intent.moveX`, jump from intent; honor `intent.jumpSpeed`
  (clamped to `maxJumpSpeed`, skipping the min-jump early-release cut so nav
  arcs aren't truncated). Keeps writing `moveDir`/`facing` (animation
  untouched). Preserve the `frozen` → `jumpWasHeld` bookkeeping. Delete
  `scriptedMoveDir` from `PlayerInputComponent`.
- `PatrolSystem` writes `intent.moveX` instead of velocity;
  `PatrolComponent.speed` superseded by `Locomotion.maxSpeed` (remove `speed`
  and the dead `direction` field). Enemy prefab gains `MovementIntent` +
  `Locomotion` (maxSpeed 48, high accel — visually identical); drop the stale
  `EnemyTag`/`PatrolTag` keys. Player prefab gains `MovementIntent`.
- `walkTo`: write `intent.moveX` when the entity has intent; keep the
  direct-velocity fallback for entities without it.

Registration in `src/game/scenes/platformer.ts` (producers before consumers):
`PlayerIntentSystem` → `StateMachineSystem` → `PlayerAnimationSystem` →
`SpriteAnimationSystem` → `PatrolSystem` → *(M3: `NavAgentSystem`)* →
`PlayerMovementSystem` → `LocomotionSystem` → `GroundDetectionSystem` →
`PhysicsSystem` → rest unchanged.

## 4. Milestone 2 — Nav surface, graph, A\* (no movement yet)

- `nav-surface.ts` — **the walkability seam and one-way anchor**:

  ```ts
  type SupportKind = "none" | "solid";        // later: | "one-way"
  class NavSurface {                          // snapshots merged solid cells via occupancy.ts
    supportAt(gx, gy): SupportKind;           // can you stand ON this cell
    blocksAt(gx, gy): boolean;                // does it block movement THROUGH
    bounds(): GridBounds | null;
  }
  ```

  Today the two coincide; all nav code queries only these. The single place
  encoding "full 32px solid square".
- `nav-graph.ts` — `NavNode { id, gx, gy, clearance }` (standing cell = empty
  cell with support below; clearance = empty cells above, capped 4).
  `NavEdgeKind = "walk" | "fall" | "jump"` (later `"drop"`, `"climb"`).
  `NavEdge { to, kind, cost, requiredJumpSpeed, requiredMoveSpeed, dropHeight,
  requiredClearance }`. `NavGraph { version, nodes, edges(id), nodeAt,
  nearestNode(worldPos, maxDrop) }`.
- `nav-graph-builder.ts` — `buildNavGraph(surface, params)`. Deterministic
  against gravity 640 px/s², tile 32:
  - **walk**: adjacent standing cell, same row (1-tile step-up = jump edge;
    step-down = fall edge).
  - **fall**: off-ledge column scan down to `maxFallTiles` (default 8), fall
    column non-blocking; `dropHeight = k*32`.
  - **jump**: for Δx 1..4, Δy -2..+4 to an existing node, solve the exact
    arc — `apex = max(0, -Δy*32) + apexMargin(16)`,
    `vJump = sqrt(2·g·apex)`, airtime from the descending root,
    `vX = |Δx|·32 / T`; reject if `vX` exceeds the build cap (4·TILE_SIZE).
    **Validate** by sampling the parabola (≤8 px steps) sweeping the agent box
    (half-width 16 − 1 px skin, height = clearance cells) against `blocksAt`;
    landing must be from above. Tag the edge with required speeds. Costs
    penalize jumps over walking.
  - Knobs collected in `NavBuildParams` with defaults — the tuning dial.
- `astar.ts` — binary-heap A\*; `NavCapability { jumpSpeed, moveSpeed,
  maxDropHeight, heightCells }`; edge admitted iff capability covers its
  requirements. Returns `NavPathStep[] { node, edge }` or null.
- `nav-graph-component.ts` (runtime-only singleton) + `nav-graph-system.ts` —
  rebuild when the `"entityId:gridVersion|…"` signature changes, the exact
  pattern of `TileCollisionSystem` (poll the signature; avoid `grid.onChange`
  microtask batching). Registered `ecs.addUpdateSystem` next to
  `TileCollisionSystem` — always-on, so editor overlays work without
  simulating.
- **Tests** (project's first): `bun test` over the pure builder/A\* —
  flat run, step-up, gaps, drops, ceiling-blocked jump, clearance filtering.

## 5. Milestone 3 — NavAgent + path execution

- `nav-agent-component.ts` — `@serializable("NavAgent")`: serialized
  capability (`jumpSpeed`/`moveSpeed` default 0 = derive from
  `LocomotionComponent`, `maxDropHeight`, `heightCells`), `arriveTolerance`,
  `stuckTimeout`; runtime `target: Vector2 | EntityId | null`, `path`,
  `pathIndex`, `status: "idle" | "moving" | "arrived" | "unreachable"`,
  stuck-tracking fields.
- `nav-agent-system.ts` — queries agent + intent + transform + body (no-op
  until `rb.body` exists and the graph is built):
  1. Plan/re-plan when: no path, graph version changed, target entity moved to
     a different goal node, or stuck. `nearestNode` snaps endpoints;
     `unreachable` after 3 failed attempts.
  2. Execute the current edge → intent: **walk** — `moveX` toward node,
     advance on arrive+grounded; **fall** — steer toward the landing column
     while airborne; **jump** — walk to the launch cell center, then
     `jumpPressed` + `jumpSpeed = edge.requiredJumpSpeed` + `moveX`, hold
     `jumpHeld` while ascending, advance on grounded at target.
  3. Stuck = no distance improvement for `stuckTimeout` → re-path from the
     current position (handles getting knocked off the path). Repeated stuck →
     `unreachable`; **the agent itself never teleports** — callers decide.
  4. `arrived`: zero intent, go inert so other producers (patrol/FSM) flow
     through — leaves future chase AI free to set `target`.

## 6. Milestone 4 — Cutscene `moveTo` verb

In `src/game/cutscene/verbs.ts`:

- `moveTo(ctx, entity, target: Vector2 | EntityId, opts?)`: ensure
  `NavAgentComponent` + `MovementIntentComponent` (attach temporaries, remove
  on finish; player capability bridged from
  `PlayerInputComponent.maxJumpSpeed/maxSpeed` — game layer mapping player
  tuning into engine capability data). `PlayerIntentSystem` is already silent
  during cutscenes, so nav owns the player's intent — the player can visibly
  jump gaps in cutscenes.
- `done()`: `status === "arrived"` → clean up. **Stuck/unreachable → teleport
  to destination + console warning, then complete** — matches skip semantics
  and the act1 "teleport-on-stuck" follower note.
- `complete()` (skip): teleport to the resolved destination, zero vx, clean
  up — existing convention.
- Entities with no physics/nav: fall back to `walkTo` semantics so
  dialogue-prop entities stay movable.
- Keep `walkTo` as the cheap flat verb, with the same stuck-timeout →
  teleport+warn so it can no longer hang. `pickup-tour-cutscene.ts` keeps
  `walkTo` for flat moves; convert one call to `moveTo` as the live demo.

## 7. Milestone 5 — Editor nav debug overlay

Depends on Run mode (`play-in-editor.md`) for the live-agent half.

- Add `"navGraph"` and `"navPath"` to `DebugOverlayId`/`DEBUG_OVERLAYS`
  (`src/editor/debug-flags.ts`, color tokens beside `--debug-collider`).
- New `src/editor/systems/nav-graph-debug.ts` (RenderSystem modeled on the
  physics shape debug): node dots at feet positions, edges colored by kind,
  jump arcs drawn as their parabola. Works in edit mode (`NavGraphSystem` is
  always-on) — paint tiles and watch the graph rebuild live.
- `navPath`: each `NavAgentComponent`'s active path highlighted + status
  label — watched live in a Run session in Editor input mode.

## 8. Future-proofing (not implemented, must stay additive)

- **One-ways**: later, `TileCollisionMode` gains `"one-way"`;
  `NavSurface.supportAt` returns `"one-way"` while `blocksAt` returns false —
  nodes form on top with zero builder changes, and jump arcs correctly pass
  through. Drop-through = new `"drop"` edge kind where the support is one-way,
  executed via the reserved `intent.wantDrop`, gated by a capability flag.
- Slopes = new `SupportKind` + walk-edge rule; ladders = `"climb"` edges. Only
  `NavSurface` and the builder's arc sweep encode tile-square assumptions.
  Moving platforms are the one genuinely structural extension (dynamic nodes);
  nothing here makes them worse.

## 9. Future work (from the superseded draft)

Perception → blackboard → decision policy (FSM first, BT/utility later) →
intent. The intent seam (§3) is the substrate: a chase FSM writes
`intent.moveX`/sets `NavAgent.target` exactly like path execution does.
Deferred until a real AI consumer exists; nothing in this plan blocks it.

## 10. Risks / gotchas

- **M1 player regression is the big risk**: preserve `moveDir`/`facing`
  writes, frozen `jumpWasHeld` handling, dash interactions. Mandatory manual
  feel-check before proceeding.
- Jump launch timing: intent at variable dt vs fixed 1/60 physics → up to
  ~1.6 px launch drift at 96 px/s; covered by the apex margin + skin, tunable
  in `NavBuildParams`.
- NPC body width = tile width (16 half-extents) → arcs through 1-cell gaps
  correctly fail; if levels need them, narrow NPC colliders in prefabs (don't
  silently change).
- Lazy body creation: nav/locomotion systems no-op while `rb.body === null`.
- Full graph rebuild per grid version bump — fine at current level sizes;
  incremental rebuild is a later optimization.

## 11. Verification

Every milestone ends `bun check`-clean and runnable.

- **M1**: player feel unchanged (variable jump, multi/wall jump, dash),
  enemies patrol identically, pickup-tour cutscene walks and skips correctly.
- **M2**: `bun test src/engine/nav` green; game unchanged.
- **M3**: give the demo NPC a `NavAgent` target in a Run session and watch it
  walk/jump/drop to it with the path overlay on.
- **M4**: pickup-tour runs end-to-end including skipping mid-move; a `moveTo`
  across a gap makes the entity jump; a blocked target teleports + warns.
- **M5**: toggle overlays in the editor; paint/erase tiles and watch the graph
  rebuild; watch a live path during Run.

## 12. Primary files

- New: `src/engine/locomotion/*`, `src/engine/nav/*`,
  `src/engine/physics/grounded.ts`, `src/game/player/player-intent-system.ts`,
  `src/editor/systems/nav-graph-debug.ts`.
- Changed: `src/game/player/player-input-system.ts` (→
  `player-movement-system.ts`), `src/game/enemy/patrol-system.ts` +
  `patrol-component.ts`, `src/game/cutscene/verbs.ts`,
  `src/game/scenes/platformer.ts`, enemy/player prefabs,
  `src/editor/debug-flags.ts`.
