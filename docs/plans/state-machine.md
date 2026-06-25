# State Machine — Architectural Plan

Status: **redesign**. Supersedes the previous generic-`Cond` / pluggable-evaluator
design, which existed only to keep FSM definitions serializable for hypothetical
editor authoring. That requirement was dropped (see §2).

## 1. Goal

A minimal, code-first FSM substrate reused across game-entity behaviour:
movement, AI, and (later) animation. Every FSM lives on a game entity and is
driven by one generic system. There is no standalone / non-game / editor-tooling
use case — all consumers are ECS components.

## 2. What changed and why

The old plan carried a condition-type split (`CodeCondition` = predicate fn vs
`DataCondition` = `{ param, op, value }` descriptor), a generic `Cond` type
parameter, a pluggable `evaluate`, an `@fsm` decorator, a dedicated def registry,
and an `import.meta.glob("../fsm/*")` registration. All of that existed for a
single purpose: make an FSM **definition** serializable so it could be authored
in an editor and round-tripped through JSON.

Decisions that removed the need:

- **Code-first.** AI/movement state machines are simple enough that the FSM
  pattern itself is the quality guard; they are written in code, not authored.
- **Editor authoring is deferred, not designed-for-now.** It only becomes
  worthwhile _if_ the skeletal-animation workflow lands, and that would get a
  dedicated data-driven animation graph (Unity-Mecanim style: typed params +
  comparison conditions) — not a retrofit of the gameplay FSM. It does not
  constrain this design.
- **The definition is never serialized.** Only authored _initial_ data is
  (params/fields). Runtime state (`current`, `elapsed`) is unmarked, matching
  "level save = authored initial state only".

With serialization of the definition off the table, conditions are just
`(self) => boolean` predicates in code. The split, the evaluator, the registry,
the decorator, and the glob all disappear.

## 3. Model

The FSM "registry" is the **existing `@serializable` component registry** — there
is no second one. Discovery for ticking is the **existing prototype-chain query**:
`ECS.addComponent` registers a component under every class in its prototype chain
(`ecs.ts`), so `query(StateMachineComponent)` returns every entity whose component
_subclasses_ the base. No string ids, no def lookup.

```ts
type Transition<C> = {
	to: string;
	when: (self: C) => boolean;
	priority?: number;
};

type StateDef<C> = {
	transitions: ReadonlyArray<Transition<C>>;
};

abstract class StateMachineComponent {
	abstract readonly initial: string;
	abstract readonly states: Record<string, StateDef<this>>;
	anyState: ReadonlyArray<Transition<this>> = [];
	current = "";
	elapsed = 0;
}
```

A concrete machine is an ordinary serializable component that extends the base.
States, transitions, and predicates live on the class (logic on a class is fine —
it is never serialized); only authored fields opt in via `@serialize`:

```ts
@serializable("Patrol")
class PatrolComponent extends StateMachineComponent {
	@serialize() interval = 1.5;

	initial = "right";
	states = {
		right: {
			transitions: [
				{ to: "left", when: (s) => s.elapsed >= s.interval },
			],
		},
		left: {
			transitions: [
				{ to: "right", when: (s) => s.elapsed >= s.interval },
			],
		},
	};
}
```

The prefab JSON carries only authored data, keyed by the serializable name — the
same bridge every component uses:

```json
"Patrol": { "interval": 1.5 }
```

On construct, `current` is empty; `StateMachineSystem` seeds it to `initial` on
first tick. There is no `def` field and no `defId` to re-link.

## 4. StateMachineSystem

One generic system, queries the base class:

- For each `StateMachineComponent`: if `current` is empty, set it to `initial`
  and emit `StateEnter(initial)`.
- Increment `elapsed` by dt.
- Evaluate `anyState` then `current`'s transitions, highest `priority` first;
  on the first `when(self)` that returns true: emit `StateExit(from)`, set
  `current`, reset `elapsed = 0`, emit `StateEnter(to)`. Both events carry the
  entity id and state names and ride the existing event bus.

Reactions are systems, never callbacks: `PatrolSystem` reads `current` (or
handles the enter/exit events) to drive direction; an animation system would map
`current` → clip. The FSM never invokes them.

**Triggers** (one-shot conditions in the old plan) need no special mechanism: a
trigger is just a boolean field the predicate reads and the consuming system
clears after acting on the state.

## 5. Serialization

- Authored fields (e.g. `interval`) use `@serialize`.
- `current` and `elapsed` are unmarked → not serialized. On load/restore the
  machine starts at `initial`, `elapsed = 0`. (Resuming a saved game at exact
  mid-state runtime is explicitly not a goal; revisit only if save-games need it.)
- The base class is abstract and not itself `@serializable`; each concrete
  subclass registers its own name.

## 6. What this deletes

From the current implementation:

- `engine/fsm/conditions.ts` (both `CodeCondition` and `DataCondition`, the data
  evaluator) — gone.
- `engine/fsm/registry.ts` and `engine/fsm/define.ts` (`@fsm`) — gone.
- `import.meta.glob("../fsm/*")` in `game/scenes/platformer.ts` — gone; FSM
  components are imported wherever components are (via prefab/component wiring).
- `defId` field and the generic `Cond` type parameter — gone.

Kept: `engine/fsm/events.ts` (`StateEnterEvent`, `StateExitEvent`).

## 7. Migration

- [ ] Replace `state-machine.ts` types with §3 (`Transition`, `StateDef`,
      abstract `StateMachineComponent`).
- [ ] Rewrite `StateMachineSystem` to query the base class and seed `current`.
- [ ] Convert `game/fsm/patrol.ts` `PatrolDef` → `PatrolComponent extends
StateMachineComponent` (`@serializable("Patrol")`); update the patrol prefab
      JSON to the `"Patrol": { interval }` shape.
- [ ] Update `PatrolSystem` to read `current` from the component (unchanged in
      spirit; it no longer goes through a def/registry).
- [ ] Delete `conditions.ts`, `registry.ts`, `define.ts`; remove the fsm glob.
- [ ] `bun check`.

## 8. Consumers

- **Patrol** (first, exists): direction from `current`.
- **Player movement**: migrate `PlayerMovementStateSystem` onto a
  `PlayerMovementComponent extends StateMachineComponent`.
- **AI policy**: Idle/Patrol/Chase/Attack/Flee as one machine; `current` drives
  intent.
- **Animation**: a state machine whose states map to clips, switching on
  `StateEnter`. If/when skeletal authoring lands, the _authoring_ surface is a
  separate data-driven animation graph, not this code-first substrate.

## 9. Deferred

- Editor authoring of animation state graphs (only with skeletal workflow).
- Hierarchical / nested states — flat states first.
- Min-time-in-state / transition interruption guards — add a field + predicate
  check when first needed.
- Exact-runtime-state save-game resume.

## 10. Primary files

- `engine/fsm/state-machine.ts` — `Transition`, `StateDef`, `StateMachineComponent`.
- `engine/fsm/state-machine-system.ts` — the generic ticker.
- `engine/fsm/events.ts` — enter/exit events.
- `game/fsm/patrol.ts` — `PatrolComponent` (first consumer).
