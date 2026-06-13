# Generic State Machine — Architectural Plan

Status: **in progress**. A **shared engine primitive** consumed by AI (`ai-navigation.md`) and Animation (`animation.md`, TBD). README summary under "State Machines".

## 1. Goal

One generic FSM primitive, data-only (no callbacks), reused across: AI decision policy, sprite **animation** state machines, player movement states, and narrative / cutscene states.

## 2. Design constraints

- **Data-only + events**: the FSM is data; transitions are data; reactions are **systems** reading the current state or handling enter/exit **events**. No `onEnter` callbacks living on the component.
- **Code-first AND editor-authorable**: AI state machines are defined in code; animation state machines are authored as data in the sprite editor. The core must serve both — solved by a **pluggable condition evaluator**.
- **No entity hierarchy**: a state machine is one component on one entity; cross-entity refs are by id.

## 3. Model

```
type Transition<Cond> = {
  to: StateName
  cond: Cond
  priority?: number
}

type FsmDef<Cond> = {
  initial: StateName
  states: Record<StateName, { transitions: Transition<Cond>[] }>
  anyState?: Transition<Cond>[]
  evaluate(cond: Cond, params: Params): boolean
}

class StateMachineComponent {
  def: FsmDef | null       // not serialized — class instance, skipped by encodeValue
  defId: string            // serialized — used to re-attach def after load
  current: StateName       // serialized
  elapsed: number          // serialized
  params: Params           // serialized
}
```

- `StateMachineSystem` ticks each machine: increment `elapsed`; evaluate `anyState` then `current`'s transitions by priority; on the first satisfied, switch state, reset `elapsed`, emit `StateExitEvent(from)` + `StateEnterEvent(to)` on the bus. Both carry entity id + state names.
- `elapsed` is injected into params as a reserved key before condition evaluation — conditions can read it without consumers needing to mirror it manually.
- **Reactions are systems**: an animation system maps `current` → clip; an AI policy maps `current` → intent. They read `current` or handle the events. The FSM never calls them.

## 4. Pluggable condition evaluator

`cond` is generic; an evaluator interprets it against the machine's `params`:

- **Code conditions (AI):** `cond` is a predicate `(params: Params) => boolean`. Maximal flexibility; lives in code; not serialized.
- **Data conditions (animation):** `cond` is a declarative descriptor — `{ param, op: '>' | '<' | '>=' | '<=' | '==' | '!=', value }` or `{ trigger: name }` (one-shot, consumed on transition). Serializable — authorable in the sprite editor's animation graph. A generic data-evaluator interprets it against `params`.

The same `StateMachineSystem` works for both; only the registered def's `evaluate` implementation differs.

Triggers: a consumed-on-read flag in `params`, cleared after the transition that used them fires.

## 5. Registration

Defs are registered via the `@fsm(id)` class decorator, mirroring the `@serializable` pattern for components. The decorator instantiates the class and calls `registerDef`. Game FSM files live under `game/fsm/` and are loaded via `import.meta.glob("./fsm/*", { eager: true })` in `fantasy-platformer.ts`.

```ts
@fsm("patrol")
export class PatrolDef implements FsmDef<CodeCondition> {
  initial = "right";
  states = { ... };
  evaluate(cond: CodeCondition, params: Params): boolean {
    return cond(params);
  }
}
```

After deserialization, `StateMachineSystem` re-attaches the def from the registry on first tick using `defId`.

## 6. Serialization

The component serializes `defId + current + elapsed + params`. The `def` field is a class instance and is silently skipped by `encodeValue`. Prefab JSON example:

```json
"StateMachine": {
  "defId": "patrol",
  "current": "right",
  "elapsed": 0,
  "params": { "interval": 1.5 }
}
```

## 7. Consumers (handoffs)

- **AI** (`ai-navigation.md`): decision policy = a code-condition machine (Idle/Patrol/Chase/Attack/Flee) whose `current` drives intent. `PatrolDef` is the first example.
- **Animation** (`animation.md`): the sprite animation state machine = a data-condition machine whose states map to clips; `StateEnterEvent` fires to switch the playing clip.
- **Player movement**: `PlayerMovementStateSystem` can migrate onto this.
- **Narrative**: cutscene/dialogue beats as states.

## 8. Completed

- [x] Core types (`Transition`, `FsmDef`) — `engine/fsm/state-machine.ts`
- [x] Condition types + data evaluator (`CodeCondition`, `DataCondition`, `evaluateDataCondition`) — `engine/fsm/conditions.ts`
- [x] `StateMachineComponent` — `engine/fsm/state-machine-component.ts`
- [x] `StateEnterEvent`, `StateExitEvent` — `engine/fsm/events.ts`
- [x] Registry (`registerDef`, `getDef`) — `engine/fsm/registry.ts`
- [x] `@fsm` decorator — `engine/fsm/define.ts`
- [x] `StateMachineSystem` — `engine/fsm/state-machine-system.ts`
- [x] `PatrolDef` migrated as first code consumer — `game/fsm/patrol.ts`
- [x] `PatrolSystem` migrated to read direction from FSM state

## 9. Remaining

- [ ] Data-condition evaluator wired into a real consumer (animation)
- [ ] Player movement state machine migrated onto FSM
- [ ] AI decision policy (Idle/Chase/Attack/Flee) built on FSM
- [ ] Editor authoring of data-condition defs (animation graph in sprite editor)

## 10. Open sub-decisions

- **Hierarchical/nested states** — deferred; flat states first.
- **Transition interruption / min-time-in-state** — `minElapsed` guard not yet needed.
- **`import.meta.glob` for def registration** — works but is an outlier pattern. Acceptable for now; revisit if it causes ordering issues.

## 11. Primary files

- `engine/fsm/state-machine.ts`
- `engine/fsm/state-machine-component.ts`
- `engine/fsm/state-machine-system.ts`
- `engine/fsm/conditions.ts`
- `engine/fsm/registry.ts`
- `engine/fsm/define.ts`
- `engine/fsm/events.ts`
