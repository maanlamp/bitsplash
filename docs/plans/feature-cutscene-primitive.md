# Feature: cutscene primitive

## Context

The only scripted-sequence machinery today is `PickupTourSystem`: quest logic, camera teleports, and fades tangled together, paced by Ink externals and a `DialogueComponent.hold` handshake that pauses/resumes the dialogue across three files. Act 1 needs real cutscenes (actor movement, camera direction, interleaved dialogue), and the refactor-coherence plan already earmarked extracting the camera-tour core.

## Goal

An engine cutscene primitive: generator-coroutine sequences in TS that orchestrate engine-state effects (camera transitions, fades, dialogue, actor movement), skippable per scene, with input locked while active. Proven by reworking the pickup tour quest with new staged beats.

## Scope

In: engine `cutscene/` slice (runtime + verbs), `CameraTransitionComponent`/`System`, duration-driven screen fade, speaker-name display on dialogue, scene-granular skip, pickup tour rework (fixed order, new beats: quartermaster walk, glide transition, wall-jump shaft zoom-out, speed-up road sweep, kiss ending), deletion of `hold` + tour Ink externals + `PickupTourSystem`.

Out (explicit non-goals): data-driven cutscene assets or editor authoring; pathfinding (`walkTo` is dumb flat-ground locomotion until ai-navigation lands); particles/spawned effects; FSM rework (parked, separate plan); player naming (speaker is "You").

## Decisions

- **Code-driven, no data files.** Cutscenes are TS generator functions in `game/`; user authors code 100x faster and no system consumes JSON cutscenes. Engine provides the runtime.
- **Generator coroutines, not async/await.** Resumed by `CutsceneSystem` on the game clock; pause/timescale/cancellation come free; no microtask-to-tick resync machinery.
- **Cutscene drives, dialogue is a verb.** `yield* dialogue(ctx, "knot.stitch")` opens the dialogue UI and waits for close. Ink keeps words (lines/stitches/choices in free-roam); orchestration lives in the generator. `DialogueComponent.hold` and the `begin_pickup_tour`/`next_pickup`/`end_pickup_tour` externals are deleted.
- **Verbs = start + wait (Godot Tween model).** Effects that outlive a frame are engine component state animated by small systems (`CameraTransitionComponent`, `ScreenFadeComponent`); `start*` functions are callable from anywhere (respawn, dialogue framing, gameplay), returning a handle; the yieldable verb wraps start + wait-on-handle. Generators never animate. One-frame waits (`waitSeconds`, `waitFor`, `parallel`) are plain generator helpers.
- **Smart camera transition.** One verb: glide (position/zoom tween) if target within ~a screen, else fade-out / cut / fade-in. Thresholds and durations parameterized.
- **Scenes = skip sections.** A cutscene def is an ordered list of named scene generators. Esc fast-forwards the current scene only: drain its generator in instant mode (effects snap to end state, dialogues close, waits vanish), next scene plays normally. End state after skip ≡ end state after watching. All cutscenes skippable, no opt-out.
- **Input lock mirrors dialogue.** Active cutscene freezes `PlayerInputSystem` and pauses the systems that already pause on dialogue (pickup collection, interact hints).
- **New bubble per subject.** Dialogue panel closes and reopens whenever the speaker/subject changes (general principle, not tour-specific).
- **Speaker display.** Consume the existing `# speaker:` Ink tag (currently unread); render name on the panel; "You" for the player.
- **walkTo writes intent.** Sets `moveDir` toward target x until within a tile; physics does the rest; upgrades internally when navigation lands.
- **Fixed tour order.** `selectTour` randomness dies; stops are authored in the script.

## Alternatives considered

- Ink as cutscene driver (extend externals + hold): keeps the handshake hack and the three-file interleave; non-dialogue cutscenes still need a runtime.
- Data-driven step-list/timeline JSON (Unity Timeline analog): industry-standard for editor authoring, but nothing here authors in-editor; interpretation layer for no benefit.
- async/await director API: reads nicer but promises resolve off the game loop; pausing and cancellation need token plumbing.
- Verbs animating inside generators: forecloses standalone triggering (respawn camera snap would need a fake cutscene with input lock).

## Approach

Level rework (user) precedes implementation: quartermaster vantage flat run, one near pickup, three far, wall-jump shaft (unframeable at default zoom), speed-up runway. Geo dictates movement/zoom scale values.

1. **`engine/cutscene/` runtime.** `CutsceneComponent` (runtime-only, unserialized: def, scene index, active generator, pending wait, skipping flag), `CutsceneSystem` (resume-on-satisfied-wait, Esc → instant-mode drain of current scene), `CutsceneDef` type (`id`, `scenes: NamedSceneGenerator[]`), `startCutscene(ecs, def)` + `isCutsceneActive(ecs)`. `CutsceneContext` carries `ecs`/`events`/clock. Wait conditions as small objects with `done()` and `complete()` (instant-mode snap).
2. **`CameraTransitionComponent` + `CameraTransitionSystem`** in `engine/camera/`: modes glide (position+zoom tween with easing) and cut-under-fade (drives `ScreenFadeComponent`, hard cut at blackout); suspends/restores `Camera2DFollowComponent` targets; `startCameraTransition(...)` returns handle; `complete()` snaps. Replaces the ad-hoc mutation in `PickupTourSystem.swap` and becomes available to `DialogueSystem.setCameraTargets` (rewire it here or leave as-is; do not expand scope).
3. **Screen fade duration-tweening**: `ScreenFadeComponent` gains target/duration animated by a small system (today alpha is externally driven per frame by the tour). `startFade(...)` handle.
4. **Verb library** in `engine/cutscene/verbs`: `cameraTo` (smart transition), `fadeOut`/`fadeIn`, `waitSeconds`, `waitFor(EventClass)`, `parallel(...verbs)`, `dialogue(ctx, path)` (spawns `DialogueComponent` at a knot/stitch, waits for `DialogueClosedEvent`). Game-side verb `walkTo(ctx, actorId, x)` (needs game's intent components — lives in `game/`).
5. **Input lock**: `PlayerInputSystem`, `PickupSystem`, `InteractHintRenderSystem` check `isCutsceneActive` alongside their existing dialogue check.
6. **Speaker display**: read `# speaker:` tag in `dialogue-trigger-system.ts`/dialogue verb, store on `DialogueComponent` (or panel component), render in `dialogue-render-system.ts`. "You" when the player speaks.
7. **Pickup tour rework**: `game/quest/pickup-tour-cutscene.ts` — scenes: (a) tour: quartermaster walks to vantage w/ bubble, per fixed-order pickup smart-transition + line, wall-jump shaft zoom-out under its line, speed-up road sweep under its line, return, wrap-up; (b) reward/kiss (triggered at `return`→`complete`): player auto-walks flush, ~0.5s silent beat, "You" bubble `Thanks, guy! <wave>smooch</wave>`, quest completes. Quest counters/marker tags set by plain code at cutscene start (extracted from `beginPickupTour`). Ink: `pt_accept` calls new external `start_cutscene("pickup-tour")`; per-pickup lines become stitches addressed by the script; `pt_loop`/`pt_wrap` machinery removed.
8. **Deletions**: `PickupTourSystem`, `PickupTourComponent`, `DialogueComponent.hold` (and its dialogue-system branch), tour externals in `ink-bindings.ts`, `selectTour` randomness.

## Verification

- `bun check` after each step.
- User playtests (user owns run): free-roam dialogue unchanged (choices, esc-close); accept tour → full sequence; Esc mid-scene skips only that scene and end state matches watching; input dead during cutscene, alive after; kiss scene on quest completion; speaker names render.

## Open follow-ups

- FSM rework (user unhappy with current hybrid) — parked, own planning session.
- `DialogueSystem` free-roam camera framing migrated onto `CameraTransitionComponent` if not done in step 2.
- `walkTo` upgrade when ai-navigation lands.
- Player naming (replaces "You").
