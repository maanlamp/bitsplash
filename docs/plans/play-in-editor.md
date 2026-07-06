# Play-in-Editor (Run mode) — Architectural Plan

Status: **planned**. Blocks `ai-navigation.md` (nav/AI debugging needs a live
editor during simulation).

## 1. Goal

Two ways to simulate, one shared session core:

- **Play** (exists): fullscreen, faithful, "what does it actually look like" —
  the playtest mode. Kept as-is, minus the debug fps/tick overlay.
- **Run** (new, primary): the simulation runs **inside the scene viewport**
  while the editor keeps *all* of its current functionality — select, inspect,
  tweak, paint tiles, add/delete entities, undo, **save** — mid-session.
  Includes pause and single-frame stepping.

Input is **modal**: game keys (`WASD`/`Space`/`E`/`Shift`) and editor
shortcuts (`s/b/e/f/l/h/p`, Ctrl+S, …) collide, so a Run session is always in
exactly one of two input modes — **Game** (possessed: game camera drives the
viewport, keyboard/mouse go to the game) or **Editor** (ejected: free editor
camera, full editor tools; the game receives no player input). A single toggle
switches between them; this modal split was the original motivation for
fullscreen play mode, now made explicit.

## 2. Where we are today

- `Scene.setSimulating(enabled)` (`src/engine/scene/scene.ts:130`): on enable,
  snapshots the world (`serializeWorld`), registers the ~30 `gameplaySystems`,
  spawns runtime entities (player, game camera, ink, …); on disable, removes
  them and restores the snapshot wholesale. Stop always reverts everything.
- Play (`src/editor/app.tsx:482`): suspends the focused `SceneView` (removes
  editor systems, deactivates the editor camera), unmounts the entire
  workspace React tree, re-attaches the canvas into a fullscreen surface.
  Escape exits and reverts. All editor hotkeys are gated `!playing`.
- Known defects to fix along the way: the restore **destroys the editor camera
  entity** (position/zoom lost after every play); undo `History` commands
  capture live component references that go **stale** after restore
  (`src/editor/commands.ts`).

## 3. The state model (the crux)

"Edit and save mid-session" only works if authored changes are kept separate
from simulation changes:

- **Run start**: snapshot the world (exists today).
- **During run**, world mutations are one of two kinds:
  - **Simulation** changes (physics moving bodies, health, quests, spawned
    arrows…) — ephemeral, never persisted.
  - **Authoring** changes — anything done through an editor command (inspector
    edit, tile paint/erase/fill, entity create/delete/drag). These apply to
    the live world immediately *and* are recorded in a **journal**.
- **Stop** = restore the snapshot, then **replay the journal** on top.
  Authored edits survive; simulation state reverts. (Unreal reverts-all with a
  per-actor opt-in "keep"; Unity silently reverts everything; we make
  authored-vs-simulated the automatic distinction instead of a manual one.)
- **Save mid-run** = apply the journal to a copy of the snapshot data and
  export that — never serialize the live world during a run (it contains
  runtime-spawned entities and sim-mutated state).

### Prerequisite: id-addressed commands

The journal and its replay require commands to be **data** (entity id +
component type + field path + value / tile-cell sets), not closures over live
component instances. `History` (`src/editor/history.ts`) and the command
constructors (`src/editor/commands.ts`, inspector edits, tile edits) are
refactored accordingly. This independently fixes the existing
stale-reference-after-play undo bug, and makes journal replay just "run the
command list against a world".

## 4. Input modes, camera, hotkeys

- **Game mode**: game camera active (editor camera deactivated, exactly the
  existing suspend handoff — priority 100 vs 0), canvas-focused keyboard/mouse
  feed the game via the existing per-view `Input`. All editor hotkeys dead
  except the mode toggle (and pause/step).
- **Editor mode**: editor camera reactivates (free-cam), editor tools and all
  hotkeys work; the game's `Input` sees no keys (player idles; simulation keeps
  running — enemies patrol, physics ticks). Mouse on the canvas selects/paints
  instead of reaching the game.
- Camera and input switch **together** — possess/eject as one gesture. No
  split state ("game camera but editor mouse") in v1.
- Toggle key: **`Tab`** (unused by the game; `preventDefault` so it never
  tab-focuses editor chrome). Pause and frame-step get their own keys/buttons
  and work in both modes.
- Hotkey gating changes from `enabled: !playing` to
  `enabled: !playing && (!running || inputMode === "editor")`.

## 5. Pause + frame step

- Pause freezes gameplay-system updates (editor systems keep running in Run).
  Implemented in the session, not by pushing the game's pause scene — that
  stays a Play-mode/gameplay concern.
- Frame step: while paused, advance exactly one fixed physics tick
  (`FIXED_DT = 1/60`) — one `ecs.update` with `dt = 1000/60` and a forced
  single `world.step`, bypassing the accumulator's real-clock feed.
- Toolbar: Run ▶ / Pause ⏸ / Step ⏭ / Stop ⏹ alongside the existing Play
  button.

## 6. Weirdnesses, thought through

1. **Editing sim-moved entities.** Dragging or position-editing an entity
   mid-run journals its **current** position as the new authored home — drag a
   patrolling enemy where it happens to stand and that spot becomes its saved
   spawn position. Deliberate, but surprising; the drag must also
   `setTransform` the physics body (a dynamic body otherwise snaps back next
   step).
2. **Runtime-spawned entities are not authorable.** The player, game camera,
   arrows, spawned prefab instances exist only in the live world — inspector
   edits on them are live-only tuning and cannot be journaled (their home is a
   prefab file or nothing, not the level). The inspector badges these
   ("runtime — changes won't save"). Tuning the player mid-run is *the* use
   case, so "apply to prefab" is a planned follow-up (not v1). Runtime
   entities are identified as "created after the snapshot and not by an editor
   command".
3. **Deleting an entity the sim references** (quest target, camera follow id):
   systems must tolerate dangling ids — most already do (id-reference rule);
   verify per system rather than forbidding the delete.
4. **Creating entities mid-run**: they go live immediately (physics bodies are
   created lazily, so this works) and journal as creates. `SpawnPoint`s placed
   mid-run **must spawn immediately** — today they wouldn't (`spawnOnLoad`
   points are consumed once at simulation start in `bootstrap.ts`
   `spawnInitialEntities`; `SpawnSystem` only handles respawn events).
   Generalize spawn-on-load to "spawn when a `spawnOnLoad` point is first
   observed while simulating": `SpawnSystem` tracks already-consumed point ids
   (runtime state, not serialized) and spawns any new one it sees, replacing
   the one-shot bootstrap loop. No editor special-casing; the spawned entity
   is a runtime entity (reverts on stop), the point itself is journaled.
5. **Undo mid-run** = inverse-apply the journal entry to the live world and
   pop it. The sim may have moved on (undo a tile an NPC now stands in —
   physics rebuild handles it). History and journal stay one structure: the
   journal *is* the run-scoped tail of the undo stack.
6. **Save timing**: a mid-run save writes a level state that was never
   observed unsimulated (snapshot + journal). Replay conflicts are benign by
   construction — journal entries only reference snapshot entities or
   journal-created ones.
7. **Tile edits mid-run** work naturally: `TileCollisionSystem` (and later the
   nav graph) already rebuild on `grid.version` change — this is a feature,
   not a hazard: reroute an NPC by painting the floor out from under it.
8. **Editor camera across restore**: `SceneView.resume` must restore the
   pre-run camera position/zoom instead of recentering (fix the existing
   annoyance while in here).
9. **Game UI in the viewport**: dialogue panels, quest notices etc. render via
   always-on render systems into the same viewport — fine, but `uiScale` in a
   small docked viewport may need a Run-specific factor. Cosmetic; punt until
   it bothers.
10. **Multiple scene tabs**: one Run session at a time, bound to its view;
    other tabs stay editable-but-frozen as today. The rAF loop already only
    updates the focused view.
11. **Dirty tracking**: journal entries flip `SceneDocument.dirty` exactly
    like history entries do today.
12. **Cutscenes during Run**: `isCutsceneActive` freezes player input but not
    editor input — you can inspect mid-cutscene in Editor mode. No change
    needed; noted as expected behavior.

## 7. Play mode changes

- Drop the debug fps/tick overlay from fullscreen Play (it's an editor
  concern; keep it in the editor viewport / Run).
- Play and Run share the session core: snapshot, `setSimulating`, journal
  (journal simply stays empty in Play since no editor tools exist there),
  restore-and-replay on exit. Escape-to-exit and the game pause scene stay
  Play-only.

## 8. Layering

- **Engine**: `Scene`/session support — pause flag for gameplay systems,
  single-tick stepping through the fixed-step accumulator, runtime-entity
  tracking hook (entities created after a marker). No editor concepts leak in.
- **Editor**: the Run session (mode state machine, input-mode toggle, journal,
  id-addressed `History`/commands refactor, toolbar UI, inspector badge for
  runtime entities, save-from-journal path).
- **Game**: untouched, except wherever the fps/tick overlay is wired into
  Play.

## 9. Milestones

1. **Commands refactor** — id-addressed data commands for history (inspector,
   entity ops, tile ops). No behavior change; fixes the stale-undo bug.
2. **Run session core** — Run/Stop in the viewport: snapshot, gameplay systems
   on, editor systems stay, modal input toggle with camera possess/eject,
   journal capture + stop-replay, editor-camera preservation. Hotkey gating.
3. **Pause + frame step** — session pause flag, fixed-tick step, toolbar.
4. **Mid-run save** — snapshot+journal export, dirty integration, runtime
   -entity inspector badge.
5. **Play polish** — shared session core under Play; remove the debug overlay
   from Play.

Each milestone ends `bun check`-clean and runnable.

## 10. Primary files

- Changed: `src/editor/app.tsx` (play/run session + loop + hotkey gating),
  `src/editor/scene-view.ts` (suspend/resume split per input mode, camera
  preservation), `src/editor/history.ts` + `src/editor/commands.ts` (+ all
  command call sites: inspector, tile editor, entity editor) — id-addressed
  commands, `src/editor/toolbar.tsx`, `src/editor/scene-document.ts`,
  `src/engine/scene/scene.ts` (session/pause/step, runtime-entity marker),
  `src/engine/world.ts` (single-step support).
- New: `src/editor/run-session.ts` (session state machine + journal).
