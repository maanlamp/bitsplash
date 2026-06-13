# AI & Navigation — Architectural Plan

Status: **planned** (no implementation yet). README summary under
"AI & Navigation". Depends on the generic FSM (`state-machine.md`).

## 1. Goal

Generic AI infrastructure for a 2D platformer: perception → decision → intent,
with a pluggable decision policy (FSM first; BT/utility later), unified intent
actuation shared with the player, and a platformer nav-graph (walk/fall/jump).

## 2. Where we are today

- `game/systems/patrol.ts` — the only "AI": a timer flips `direction` and sets
  `linearVelocity`. No perception, no decisions, drives the body directly.
- `engine/tilemap/grid.ts` — `TileGrid`, a sparse `Set<"gx,gy">` of solid cells;
  notifies on change (`onChange`). The nav substrate.
- `game/systems/player-input.ts` — reads input, applies movement/jump. The
  actuation AI will share (after factoring into intent + actuation).
- No FSM, no perception, no pathfinding. Greenfield.

## 3. Locked decisions

1. **Pluggable-policy brain**: perception → blackboard → decision policy →
   intent → existing actuation. FSM is the first policy; BT + utility are future
   policies on the same substrate.
2. **Unified intent**: AI writes the same intent components the player input
   writes; one actuation path for both.
3. **Platformer nav-graph, full commit**: walk/fall/jump links; A\* plans;
   path-execution emits intent.
4. FSM is the **generic** engine primitive (`state-machine.md`), not AI-specific.

## 4. The pipeline

```
[perception systems] --> Perception/Blackboard --> [decision policy] --> Intent --> [actuation systems]
        ^ vision/proximity/sound                      ^ FSM (first)        ^ move/jump/aim/fire
```

### 4.1 Perception → blackboard

- `PerceptionComponent` (data): target entity id, distance, has-line-of-sight,
  last-known-position, threat level, grounded, etc. Entity refs by id.
- Perception systems populate it: vision (planck raycast within a cone),
  proximity (distance query), hearing (consume sound events). Tunable per agent.
- The blackboard doubles as the FSM's `params` source for code conditions.

### 4.2 Decision policy (FSM first)

- A code-condition `StateMachineComponent` per agent: states like
  `Idle / Patrol / Chase / Attack / Flee`; transitions are code predicates over
  the blackboard (`hasLineOfSight && distance < aggroRange` → Chase).
- The policy's job each tick: from `current` state, write **intent** (e.g. Chase →
  move toward `target` x, jump if blocked; Attack → aim + fire intent).
- Patrol becomes the trivial `Patrol` state. BT/utility later produce the same
  intent from the same blackboard.

### 4.3 Unified intent + actuation refactor

- New intent components written by BOTH player input and AI:
  `MovementIntentComponent` (moveX, wantJump, wantDrop), `AimIntentComponent`
  (aim vector), `ActionIntentComponent` (fire, interact).
- **Refactor**: split `PlayerInputSystem` into `PlayerInputSystem` (keyboard/pad →
  intent) + actuation systems (`MovementSystem`, etc.) that consume intent. AI's
  policy writes the same intent; actuation is identical for player and AI.
- This is the prerequisite refactor and the main coupling-reduction win.

## 5. Navigation (platformer nav-graph)

### 5.1 Graph build (`engine/nav/`)

- From the `TileGrid`: a **walkable cell** = solid tile with empty cell(s) above
  (standable). Group into surface **spans**; nodes = spans (or per-cell, simpler
  first).
- **Edges:**
  - **walk** — horizontally adjacent walkable cells on the same surface.
  - **fall** — a walkable cell with a drop to a lower walkable cell within
    horizontal reach (ballistic fall).
  - **jump** — a gap/height reachable within a **parametric jump arc** (max jump
    height + horizontal distance). Edges tagged with the **required capability**
    (min jump height/distance) so one graph serves many agents.
- Rebuild on `TileGrid.onChange` (full rebuild first; incremental later). Per
  scene (each scene's grid → its own graph).

### 5.2 Pathfinding + execution

- A\* over the graph, filtering edges by the **querying agent's capabilities**
  (its jump height/speed). Result = ordered nodes + edge types.
- A **path-execution system** turns the current edge into intent: walk → moveX
  toward next node; jump → wantJump timed at the launch point with the right
  moveX; fall → walk off the ledge. Re-path on target move / blocked / grid change.
- Output is intent — so navigation reuses the same actuation as everything else.

## 6. In-editor AI debugger

- **Canvas debug-draw** (focused scene viewport): nav-graph nodes/edges colored by
  type, the selected agent's computed path, vision cones, target line,
  last-known-pos marker, current FSM state label.
- **React inspector** (debug chrome): selected agent's blackboard values, FSM
  `current` + recent transitions, active path. Works in playtest via the
  profiler's fullscreen debug-overlay (`profiling.md` §6).

## 7. Layering

- **Engine:** generic FSM (`state-machine.md`), nav-graph builder + A\*
  (`engine/nav/`), perception helpers (raycast/cone), intent components, the
  actuation systems (movement/etc. — these already exist, refactored to read
  intent), path-execution system.
- **Game:** concrete enemy FSM defs + transition predicates, perception tuning,
  enemy archetypes/prefabs, agent capability params.
- **Editor:** AI debugger overlay + inspector; (optional, later) visual FSM
  authoring — AI FSMs are code-first, so the debugger is the priority.

## 8. Migration path

1. Generic FSM (`state-machine.md` step 1); port `PatrolSystem` to a `Patrol`
   state as the first consumer.
2. Intent components + the `PlayerInput` → intent + actuation refactor (player
   still works; now intent-driven).
3. Perception (vision/proximity) → blackboard; an enemy FSM
   (Idle/Patrol/Chase/Attack) writing intent. First "real" AI.
4. Nav-graph build (walk/fall/jump) + A\* + path-execution → intent.
5. AI debugger (canvas draw + inspector).
6. Additional policies (behavior tree, then utility AI for social-sim) on the same
   substrate.

## 9. Open sub-decisions / handoffs

- **Depends on the generic FSM** (`state-machine.md`) and the **Scene system**
  (per-scene nav-graph, perception within a scene's world).
- **Capability-tagged edges vs per-agent graphs** — lean capability-tagged (one
  graph, filter at query); revisit if profiles diverge a lot.
- **Node granularity** — per-cell first; coalesce into spans as an optimization.
- **Behavior-tree / utility specifics** — deferred to when a second policy is
  actually needed; substrate is designed to accept them.
- **Social Simulation** (README) is the expected first **utility AI** consumer.

## 10. Primary files

- New: `engine/nav/graph.ts`, `engine/nav/astar.ts`,
  `engine/nav/path-execution.ts`, `engine/components/perception.ts`,
  `engine/components/intent.ts`, `engine/systems/movement.ts` (actuation),
  perception systems, `game/ai/*` (enemy FSM defs), AI debugger (editor).
- Changed: `game/systems/player-input.ts` (→ intent), `game/systems/patrol.ts`
  (→ FSM state), enemy prefabs.
