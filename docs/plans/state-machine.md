# Generic State Machine — Architectural Plan

Status: **planned** (no implementation yet). A **shared engine primitive**
consumed by AI (`ai-navigation.md`) and Animation (`animation.md`, TBD). README
summary under "State Machines".

## 1. Goal

One generic FSM primitive, data-only (no callbacks), reused across: AI decision
policy, sprite **animation** state machines, player movement states, and narrative
/ cutscene states. There is no FSM in the codebase today — this is greenfield, and
must be built generic from the start (the user's explicit requirement).

## 2. Design constraints

- **Data-only + events** (`ecs-data-only-events`): the FSM is data; transitions
  are data; reactions are **systems** reading the current state or handling
  enter/exit **events**. No `onEnter` callbacks living on the component.
- **Code-first AND editor-authorable**: AI state machines are defined in code;
  animation state machines are authored as data in the sprite editor. The core
  must serve both — solved by a **pluggable condition evaluator**.
- **No entity hierarchy** (`no-entity-hierarchy`): a state machine is one
  component on one entity; cross-entity refs are by id.

## 3. Model

```
type Transition<Cond> = {
  to: StateName
  cond: Cond            // evaluated by the machine's evaluator
  priority?: number     // higher wins when multiple are satisfied
}

type StateMachineDef<Cond> = {
  initial: StateName
  states: Record<StateName, { transitions: Transition<Cond>[] }>
  anyState?: Transition<Cond>[]   // evaluated from every state
}

class StateMachineComponent {
  defId: string           // reference to a registered def
  current: StateName
  elapsed: number         // seconds in current state
  params: Record<string, number | boolean | string>   // blackboard / Animator params
}
```

- `StateMachineSystem` ticks each machine: increment `elapsed`; evaluate
  `anyState` then `current`'s transitions by priority; on the first satisfied,
  switch state, reset `elapsed`, emit `StateExitEvent(from)` + `StateEnterEvent(to)`
  on the bus. (Both carry entity id + state names.)
- **Reactions are systems**: an animation system maps `current` → clip; an AI
  policy maps `current` → intent. They read `current` / handle the events. The FSM
  never calls them.

## 4. Pluggable condition evaluator (the crux)

`cond` is generic; an evaluator interprets it against the machine's `params`
(+ optional external context):

- **Code conditions (AI):** `cond` is a predicate `(params, ctx) => boolean`.
  Maximal flexibility; lives in code; not serialized.
- **Data conditions (animation):** `cond` is a declarative descriptor —
  `{ param, op: '>' | '<' | '==' | '!=', value }` or `{ trigger: name }`
  (one-shot, consumed on transition). Serializable → authorable in the sprite
  editor's animation graph. A generic data-evaluator interprets it against
  `params`.

The same `StateMachineSystem` works for both; only the registered def's evaluator
differs. (Triggers: a small consumed-on-read flag set in `params`, Animator-style.)

## 5. Serialization

- Code-defined defs are registered by id (like components/prefabs); the component
  serializes `defId` + `current` + `params` (runtime state).
- Data-defined defs (animation graphs) serialize fully as data (states +
  data-conditions), authored in the editor and loaded like other content.

## 6. Consumers (handoffs)

- **AI** (`ai-navigation.md`): decision policy = a code-condition machine
  (Idle/Patrol/Chase/Attack/Flee) whose `current` drives intent.
- **Animation** (`animation.md`): the sprite animation state machine = a
  data-condition machine whose states are clips; `StateEnter` can fire animation
  events. **Blending** sits on top (see animation plan) — the FSM gives discrete
  state; blend trees interpolate.
- **Player movement**: `PlayerMovementStateSystem` can migrate onto this.
- **Narrative**: cutscene/dialogue beats as states.

## 7. Migration path

1. Core types + `StateMachineComponent` + `StateMachineSystem` + enter/exit
   events + a code-predicate evaluator. Port `PatrolSystem`/player movement as the
   first code consumers.
2. Data-condition evaluator + serializable def format (for animation).
3. Registry for code-defined defs.

## 8. Open sub-decisions

- **Hierarchical/nested states** (sub-machines) — defer unless a consumer needs
  it; flat states first.
- **Transition interruption / min-time-in-state** — add `minElapsed` guard if
  needed; start simple.
- **Param scope** — per-machine `params` vs reading a shared blackboard component.
  Lean per-machine `params`, populated by perception/other systems.

## 9. Primary files

- New: `engine/fsm/state-machine.ts` (types + def),
  `engine/fsm/state-machine-component.ts`, `engine/fsm/state-machine-system.ts`,
  `engine/fsm/conditions.ts` (code + data evaluators), `engine/fsm/registry.ts`,
  `engine/fsm/events.ts`.
