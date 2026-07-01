# Refactor: coherence

## Findings & scope

The layer architecture (engine/game/editor) is sound and import-clean; the fragmentation is local organization. Prioritized:

**P0 — discovery killers**

- Type-based buckets (`components/`, `systems/`, `fsm/` as sibling silos) scatter every feature across 3+ folders. A feature like health is five files in three places with nothing co-locating them.
- Code/content folder collisions: `game/quest/` (code) vs `game/quests/` (JSON defs); `game/ink/` mixes loaders with `.ink` files; `prefabs.ts` vs `prefabs/`; `levels/` mixes `demo.ts` (code) with `.scene.json` (content).
- `game/levels/demo.ts` is not level code; it is the generic play-start bootstrap (spawn prefabs at spawn points, wire camera/bow to player, create singletons), misfiled and misnamed.

**P1 — smaller confusions**

- `game/fsm/massacre-quest.ts` and `game/fsm/pickup-tour-quest.ts` are byte-identical FSM defs; there is one generic quest lifecycle, duplicated per quest.
- Layer drift: decoration density/jitter tuning in `engine/constants.ts`; dialogue presentation baked into engine (`COMMA_PAUSE`/`STOP_PAUSE`, slide timings, `charactersPerSecond = 24` default, unused-by-engine `panel` field on `DialogueComponent`); `game/fade.ts` is generic color/alpha math that belongs in engine and has nothing to do with screen fading despite the name.
- Naming inconsistencies: `QuestMarkerDrawerSystem` vs `*RenderSystem` convention; `health-render.ts` uses a default export where everything else uses named.
- Dead weight: empty `engine/bridge/`.

## Scope

In: reorganizing `game/` and `engine/` into vertical feature slices; a single `game/content/` tree for all authored data; the P1 code fixes above as separate verifiable steps; AGENTS.md structure section rewrite.

Out (explicit non-goals): splitting `renderer-2d.ts` internals; editor reorganization; extracting the camera-tour mechanic from `PickupTourSystem` (belongs to the Act 1 cutscene plan); any registry/DI pattern for `platformer.ts` system wiring — the explicit ordered list stays.

## Decisions

- Vertical slices per feature, replacing type buckets. One class per file stays sacred; slices co-locate a feature's components, systems, FSM defs, and renderers.
- Single `game/content/` tree: code slices are pure code; content is the game-as-data and gets one visible home.
- Ink files live in `content/dialogue/` — named for the concept, not the file format; "dialogue" is the established term (`game/dialogue/`, `DialogueSystem`).
- `pickup-tour` lives in `quest/` — today it is quest-instance machinery (hardcodes the quest id, drives quest counters). Its camera-tour core gets extracted later by the cutscene plan.
- Code changes ride along when they make the move cleaner, but each is its own verifiable step, never folded into a move commit.
- `platformer.ts` remains the composition root; explicit system order is a feature.

## Target shape

```
game/
  content/
    levels/        demo.scene.json, pause.scene.json
    prefabs/       player.json, enemy.json, arrow.json, pickup-tutor.json, quest-giver.json
    quests/        massacre.json, pickup-tour.json
    dialogue/      main.ink, pickup-tutor.ink, quest-giver.ink, signpost.ink, trap.ink
    assets/        art, fonts, audio (current game/assets/)
  player/          player-input C+S, player-tag, player-animation S, player-anim FSM, ground-detection S
  combat/          arrow C+S, bow C+S+factory, damage-trigger C+S, damage-shake S
  health/          health C+S, health-render S, health-bar C, health-bar-state C, health-bar S
  respawn/         death S, death-notice C+S, death-overlay-render S, respawn C, spawn-point C, spawn S
  enemy/           patrol C+S+FSM
  interaction/     interactable C, interaction-state C, interaction S, interact-hint-render S
  pickup/          pickup C+S
  quest/           quest C+S, quest-notice C+S+render S, quest-marker-render S, objective-render S,
                   loader.ts, quest-lifecycle FSM def, pickup-tour C+S
  dialogue/        dialogue-source C, dialogue-trigger S, dialogue-render S, dialogue-ui.ts,
                   dialogue-bindings.ts, voice S, ink loader/bindings/panels/tags/fonts
  scenes/          platformer.ts, pause.ts, bootstrap.ts (ex levels/demo.ts)
  <root>           constants.ts, settings.ts, collision.ts, events.ts, input-bindings.ts,
                   prefabs.ts, camera-2d.ts (entity factory)

engine/
  camera/          camera-2d class, camera-2d C+S, camera-2d-follow C+S, camera-shake C+S, viewport
  render/          renderer-2d (unsplit), render-target, gl/blend, gl/programs, nine-slice, color-resolver
  text/            font-atlas, font-blit, font-settings, font-source, resolve-font, rich-text, text-layout
  sprite/          sprite C, sprite-render S, sprite-animation S
  tilemap/         grid, autotile, collision, tile.ts, tilemap-render S
  decorations/     decorations.ts, decorations-render S
  fade/            screen-fade C, screen-fade-render S
  timer/           timer C+S
  debug/           debug-tag C+S, debug-grid S
  dialogue/        dialogue-system, events, dialogue C
  ink/             story.ts, ink-story C
  physics/         existing + physics-body C, physics S
  fsm/ scene/ serialization/ input/ audio/ animation/ assets/   unchanged (already slices)
  <root>           ecs, world, system, game, events, services, clock, load, assets.ts,
                   vector2, angle, duration, hash, properties, constants, ui, png-metadata
```

## Approach

Each step ends green: `bun check` passes and the game boots. Moves and code changes never share a step.

1. **`game/content/` tree** (moves + glob/import path updates). Move quests JSON, prefabs JSON, `.ink` files, `.scene.json` files, and `assets/` under `content/`. Update `import.meta.glob` paths in `game/prefabs.ts`, `game/quest/loader.ts`, `game/ink/loader.ts`, `platformer.ts` scene-file glob, and asset URL imports throughout. Risk check first: grep serialized content (`.scene.json`, prefab JSON) for stored asset paths that would break, and fix alongside.
2. **`game/` code slices** (pure moves + import rewrites). Dissolve `components/`, `systems/`, `fsm/`, `entities/`, `ink/` (code half), `quest/` into the slice folders above. Batch the import rewrites with a script; verify with `bun check`.
3. **Bootstrap rename** (move): `game/levels/demo.ts` becomes `game/scenes/bootstrap.ts`; `levels/` folder disappears (its JSON went to content in step 1).
4. **`engine/` code slices** (pure moves + import rewrites): dissolve `engine/components/` and `engine/systems/` into the slices above; editor imports rewrite too (41 files touch engine). Delete empty `engine/bridge/`.
5. **Quest FSM dedupe** (code): replace the two identical defs with one `quest-lifecycle.ts` def; check how quest JSONs / FSM ids reference the defs and migrate references.
6. **Layer drift fixes** (code, one commit each):
   a. decoration densities/jitter out of `engine/constants.ts`, parameterized from game.
   b. dialogue presentation values (pauses, slide timings, cps default, `panel` field) out of engine into `DialogueBindings`/game side.
   c. `game/fade.ts` helpers into engine color module with honest names.
7. **Naming pass** (mechanical): `QuestMarkerDrawerSystem` to `QuestMarkerRenderSystem`, `health-render.ts` default export to named, plus any stragglers surfaced during moves.
8. **AGENTS.md**: rewrite the Directory Structure section to the slice shape; state the slice convention (a feature's code lives in one folder; content under `game/content/`).

## Verification

- `bun check` after every step.
- Boot the game after steps 1, 2, 4, 5, 6 (`bun run dev`, load demo, play: move, jump, shoot, pick up, talk, complete a quest objective) — content moves and glob changes can fail at runtime only.
- Editor smoke after step 4 (editor imports engine heavily): open level, select entity, inspector renders.

## Open follow-ups

- Extract camera-tour/cutscene primitive from `PickupTourSystem` (Act 1 cutscene plan).
- Act 1 feature planning (enemy AI, melee, companions, cutscenes, cross-scene persistence) as the next planning session.
- Editor reorganization, if navigation pain shows up there too.
