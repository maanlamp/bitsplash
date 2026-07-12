# Bitsplash — Architecture & Roadmap Audit

- **Date:** 2026-07-11
- **Scope:** the whole codebase (`src/engine`, `src/editor`, `src/game`, `~33k LOC`).
- **Method:** 18 focused subagents, one per feature slice, each verifying claims
  against source and honouring the AGENTS.md layering rules. Only high-confidence
  findings that affect the usability of the engine, editor, or game are recorded.
- **Supersedes:** `docs/act1-requirements.md` (stale — see _Corrections_ below). This
  document subsumes it and covers all four acts. **[corrected 2026-07-12]** That file was
  **never committed** to this repo — `git log --all -- docs/act1-requirements.md` is empty —
  so the _Corrections_ section refutes a draft that cannot be verified from source control.
  The refutations still hold against current code; only the premise is unauditable.
- **Not superseded:** `docs/storyline.md` (canonical story) and the two **dated** plans
  `docs/plans/2026-07-09-feature-in-game-ui.md` and
  `docs/plans/2026-07-09-feature-configurable-input-bindings.md` — current, rigorous, and the
  action/UI layer several findings here build on. Findings that overlap them must be _seeded
  into_ those plans, not treated as independent designs (see **Part III §1**).
- **Removed 2026-07-12:** the seven **undated** `docs/plans/*` briefs (animation, skeletal,
  sprite-editor, save, prefabs, asset-lifecycle, profiling) were stale — superseded FSM
  premise, banned type-bucket paths (`engine/components/`, `engine/systems/`), memory
  references AGENTS.md now forbids, and dead cross-references (`scenes.md`,
  `inspector-value-types.md`). They have been deleted; their still-valid locked decisions are
  preserved as **Appendix B — Removed-plan gists**, to be re-planned from this audit.
- **Adversarial review 2026-07-12:** this document was re-attacked by independent agents
  against source. Outright factual errors are fixed inline and marked **[corrected]**; the
  design-level critiques, the reconciliation-with-plans hole, and a revised ship sequence are
  in **Part III**.

Each finding is meant to seed a targeted plan later; IDs (e.g. `M-P0-1`, `U-P0-1`) are
stable handles.

---

## How to read this

Two classes of finding:

- **`[MISSING]`** — a system the storyline needs that does not exist, or exists but is
  insufficient.
- **`[UNIFY]`** — code that serves the **same purpose** in more than one place (regardless
  of shape) and should become one shared system. Same-_looking_ code with different
  purposes was deliberately **not** merged; the notable "do not merge" steers are listed at
  the end.

**Ranking is by ship importance first, then by the earliest storyline act a finding
supports.** Act 1 is the ship target, so its tiers are:

- **P0** — Act 1 cannot ship without it.
- **P1** — needed for the BIGCITY "set up a life" half of Act 1 (beat 6).
- **P2** — polish Act 1 wants but can ship without; or pure cleanup.
- **Act 2/3/4-gating** — not an Act 1 concern; ranked after, in act order.

Every finding is tagged **[layer]** (engine/editor/game — where the shared or new code must
live) and **(Act N)**. No layering violations were found anywhere in the codebase; where a
shared abstraction is currently blocked, it is because code sits in the wrong layer (called
out explicitly).

---

## Corrections — `docs/act1-requirements.md` is stale

Four of that document's headline **P0 "missing"** claims are false; the systems exist and
run. Confirmed independently by multiple agents against source:

1. **"Enemy AI: behaviour trees exist in `src/engine/bt` but are unused."** — **False.**
   There is no `src/engine/bt`. Enemy AI is a working code-defined FSM
   (`game/enemy/enemy-brain-def.ts:33`, driven by `enemy-brain-system.ts:35`) covering
   patrol → surprised → chase → attack → search/retreat/flee → die, wired and tested
   (`test/enemy-brain*`). Detect→approach→attack→take-damage→die is effectively **done**;
   remaining work is content/tuning.
2. **"Melee combat — combat is ranged only."** — **False.** `game/combat/melee-system.ts`
   (windup→strike→recover, knockback, faction-gated) exists. It is enemy-only today (see
   `M-P0-5`), but the system is there.
3. **"Companion followers — nothing like this exists."** — **False.**
   `game/follow/follow-system.ts` + the `escort` cutscene verb exist and pathfind via the
   nav agent. The only gap is that no scene attaches them to Lorelei/Arend (content).
4. **"Scripted-sequence / cutscene mechanism — need to build."** — **False.** A robust
   generator-based sequencer exists: `engine/cutscene/*` with verbs
   (`wait/waitFor/effect/fade/cameraTo/sequence/parallel` + game verbs
   `walkTo/moveTo/escort/follow/dialogue`), skip-on-hold, proven in
   `game/quest/pickup-tour-cutscene.ts`. It correctly is **not** an FSM.
   **[corrected]** "Robust" is generous: the runner is a hard **singleton** (`query()[0]`, no
   concurrent cutscenes — only queued) with **no error handling** around `iterator.next()`, so
   a throwing scene generator crashes the frame. It exists and works; harden before leaning on
   it for Act-1/Act-4 cutscene density. **✅ Hardened (2026-07-12):** the runner was ported
   onto the `ResumableSequence` primitive with error handling around advancement (a throwing/
   divergent sequence sets an error state and drops the scene, no frame crash); cutscenes are
   now serializable/resumable. Via `2026-07-12-feature-resumable-sequences.md` (deleted on
   completion).

What the old doc got **right** (all confirmed still missing): cross-scene persistent state,
world-perception tracking, inventory, merchant, reputation, more quest types, trigger
volumes.

---

## Executive ship order (Act 1)

Interleaving both finding classes by dependency and priority:

1. **`M-P0-1` Persistence + runtime scene transitions** (nothing carries between scenes;
   the game can only load one scene) — everything downstream depends on it.
2. **`M-P0-2` World-perception tracking** and **`M-P0-3` Ink state write-back** (ride on #1).
3. **`M-P0-4` Trigger volumes** → unblocks **`M-P0-6` authored Burning/Camp cutscenes**.
4. **`M-P0-5` Player-usable combat** (attack-intent + player melee + ranged knockback) —
   the forest tutorial's core.
5. **`U-P0-1` RenderContext `uiScale`** (latent correctness bug in all HUD) — small, do early.
6. **`M-P0-7` Event→SFX audio** — the combat tutorial "lands flat" without it.
7. Then the P1 BIGCITY cluster: inventory → reputation → merchant → quest types, plus the
   editor authoring tools (`U-P1-*`) that make Act-1 content buildable.

---

# Part I — Missing / insufficient systems

## P0 — Act 1 blockers

### `M-P0-1` [MISSING] Cross-scene persistent state + runtime scene transitions _(engine mechanism + game content · Act 1, foundational for 2–4)_

> **✅ DONE (2026-07-12).** Engine `Runtime` (`engine/runtime/`) owns one persistent
> `World`, a `PersistentComponent` marker, a per-scene frozen-snapshot store, and a fixed
> `goToScene` freeze→despawn→thaw/build→config→reposition routine. The game boots through it
> (`game/runtime/` seed + `bootGame`); the player/singletons persist across transitions and
> visited scenes restore their frozen state. `World.dispose()` frees the Rapier world;
> `createEntity` guards id collisions. Delivered by
> `2026-07-12-feature-persistence-save-foundation.md` (deleted on completion).

- **What.** There is no persistent-state layer and **no runtime scene-switch path at all**.
  `createGame` calls `sceneManager.setBase(...)` exactly once; a repo-wide search for
  `goToScene`/`loadScene`/`nextScene` and for
  `worldview`/`persistent`/`inventory`/`game-state`/`savefile` returns **zero** hits. The
  game can only ever load one base scene, and nothing carries data across a load.
  **[corrected]** The original text also listed `transition` as a zero-hit term — false
  (~120 hits / 23 files: camera + FSM transitions); dropped. And precisely: `setBase` _does_
  exist and would replace `stack[0]`, but nothing calls it after boot and it neither tears
  down the old world nor carries state — so the gap is the missing **orchestration**, not a
  missing method.
- **Why.** Beat 5 (travel to BIGCITY) crosses scenes; the beat-1 world-perception choice,
  inventory, completed quests, and granted abilities must survive the crossing and persist
  into Acts 2–4. Today this is _structurally impossible_, not merely unimplemented.
- **How (current state).** `SceneManager` has a scene **stack** but no persistent scene
  (`engine/scene/scene-manager.ts:49`, `engine/scene/registry.ts:70`).
  `Scene.setSimulating`/`restore` snapshot the _same_ world (editor play/stop), which is
  intra-scene only (`scene.ts:143-178`). `docs/plans/save.md` marks disk save "planned".
- **Where.** `engine/scene/scene-manager.ts`, `engine/scene/registry.ts:70-77`,
  `game/scenes/bootstrap.ts`.
- **Fix.** _Engine:_ add `goToScene(id)` on `SceneManager` that tears down the base and
  builds the target via `createScene`, plus a persistent container the manager owns
  _outside_ any scene `World`, threaded into `SceneBuildContext`. _Game:_ define the
  persistent components (worldview axis, inventory, completed-quest set, granted abilities)
  and a transition system that seeds them into the next scene. Reuse the existing
  `@serializable`/`walkFields`/`reconstruct` machinery so the same container can later back
  disk save. Do **not** overload per-scene serialization — durable player state and authored
  scene contents are different purposes.

### `M-P0-2` [MISSING] World-perception tracking exposed to Ink _(game · Act 1 beat 1, consumed 1–4)_

> **✅ DONE (2026-07-12).** `ChronicleComponent` (`game/chronicle/`) is a persistent
> `Record<string,string>` flag store (worldview axis = the `rozenberg` key), mirrored into Ink
> `variablesState` on scene load (quest-system `mirrorStage` pattern) with a `set_chronicle`
> Ink external for write-back. Mechanism complete; declaring the `VAR` in the authored `.ink`
> is content. Delivered by `2026-07-12-feature-persistence-save-foundation.md`.

- **What.** The Thief / Murderer / What-happened choice (storyline "Refining the Rozenberg
  moment") has no backing variable. Only `quest_<id>` is mirrored into Ink
  (`game/quest/quest-system.ts:105`); `main.ink:7` declares only the two quest vars.
- **Why.** This worldview axis is the branching backbone of the whole game — later dialogue
  is meant to be "shaped by how they have outed themselves in moments like these." Without a
  persisted, Ink-visible variable, no later scene can branch on it.
- **How.** The mirror pattern already exists for quests (`quest-system.ts:96-108` writes a
  game value into `story.variablesState[key]`); a worldview mirror is the same pattern,
  absent.
- **Where.** `game/dialogue/ink-bindings.ts:26-67` (externals), `game/quest/quest-system.ts:96-108`.
- **Fix.** Add a `perception`/`worldview` field to the `M-P0-1` persistent container; declare
  `VAR perception` in `main.ink`; add a `set_perception(value)` Ink external and re-mirror the
  value into `story.variablesState` on every scene load.

### `M-P0-3` [MISSING] Ink state is never persisted (`ToJson()` is never called) _(engine hook + game · Act 1, all acts)_

> **✅ DONE (2026-07-12).** The Ink singleton is now a persistent, seeded-once entity (the
> `bootstrap.ts` per-scene re-mint is removed), and `InkStoryComponent.state` is kept current
> by mirroring `story.state.ToJson()` into it after each advance (`DialogueSystem`, Kind-1
> projection). Delivered by `2026-07-12-feature-persistence-save-foundation.md`.

- **What.** `InkStoryComponent` has `@serialize() state` and `ensureStory` _reads_ it via
  `story.state.LoadJson(...)` — but **nothing ever writes** `story.state.ToJson()` (zero
  `ToJson` calls in the repo). Worse, `bootstrap.ts:52` mints a fresh `new InkStoryComponent()`
  every scene. The `@serialize` decorator gives a false impression persistence works; quest
  flags and the future worldview var reset on every transition.
- **Why.** Sibling of `M-P0-1`/`M-P0-2`: cross-scene continuity of Ink variables. This is a
  silent no-op today.
- **Where.** read path `engine/ink/story.ts:30-31`; missing write path (none);
  fresh component `game/scenes/bootstrap.ts:52`; unfilled field `engine/ink/ink-story-component.ts:10`.
- **Fix.** _Engine:_ a save hook that writes `component.state = story.state.ToJson()` on Ink
  change (e.g. on `DialogueClosedEvent` and before scene teardown). _Game:_ the single
  Ink-story entity must live in the `M-P0-1` persistent container, adopted on scene build
  rather than re-minted.

### `M-P0-4` [MISSING] Trigger volumes (enter-area fires an event / cutscene) _(engine primitive + game · Act 1 beats 1 & 4)_

- **What.** Every dialogue/cutscene entry point is player-initiated. Dialogue fires only from
  `InteractEvent` (proximity **+ keypress**, `dialogue-trigger-system.ts:24`); cutscenes start
  only from `startCutscene` reached through that keypress or a keypress-reachable Ink external.
  No area/`onEnter` trigger exists (grep: none).
- **Why.** The Burning (beat 1) and Camp (beat 4) are _entered_, not pressed — authored
  auto-sequences. The runner and the `dialogue()` verb already exist; only the fire-from-area
  trigger is missing.
- **How.** Interaction already computes "player within radius of an entity"
  (`interaction-system.ts:38-48`) but gates on a keypress; a trigger volume is the same
  proximity check firing automatically on enter/exit. **[corrected]** The claim that pickup
  "independently computes a second proximity/radius" misreads the code: pickup _collection_
  fires on a physics `CollisionEvent` (`pickup-system.ts:70-86`); the radius at `:88-114` is
  only the _magnet_ attraction. So there is one radius scan (interaction) + one physics-
  collision trigger (pickup) + one magnet — not two radius copies. The three differ **in
  kind**, so "share one proximity helper" is only half-right: a **physics sensor** (which the
  Fix lists as an afterthought) is the more consistent primitive — it matches what pickup
  already does, gives real enter/exit events and arbitrary area shapes, and avoids an
  O(entities) per-frame distance scan over large volumes. Prefer the sensor route.
- **Fix.** A `TriggerVolumeComponent` (area + one-shot/repeat + event or cutscene id) + system
  detecting player enter/exit (physics sensor or a shared proximity helper). Keep the target
  cutscene/knot data-driven so beats are authored, not coded. Enter/exit detection can be an
  engine primitive; the game binds it to `startCutscene`.

### `M-P0-5` [MISSING/UNIFY] Player-usable combat: shared attack-intent, player melee, ranged knockback _(game · Act 1 forest tutorial)_

The forest tutorial contrasts melee vs bow, but combat is currently split so that **the
player cannot melee and enemies cannot use ranged**, and arrows have no physical impact.
Three tightly-coupled defects (all `game/combat/`):

- **`M-P0-5a` No shared attack-intent.** Bow reads `input.mouse` directly inside the system
  (`bow-system.ts:60-71`, player-only); melee is driven by a `triggered` bool set only by the
  enemy brain (`melee-component.ts:18`, `melee-system.ts:44`, `enemy-brain-system.ts:277-281`).
  There is no controller-agnostic channel, so AI can't fire a bow and player input can't drive
  melee. **Fix:** an `AttackIntentComponent { firing, aim }` mirroring the movement layer's
  already-clean `MovementIntentComponent` (which both player input and enemy brain write and
  `LocomotionSystem` reads). Player input and enemy brain both write it; weapon systems read
  it; aim resolution (mouse→world) becomes an input concern.
- **`M-P0-5b` Knockback missing for ranged, unshared across weapons.** Only melee applies an
  impulse (`melee-system.ts:96-105`); arrows (`arrow-system.ts:98-129`) and damage-triggers
  apply zero — an arrow hit is a number popup with no impact, contradicting the spec ("impact
  has force"). **Fix:** carry a knockback impulse/direction on `DamageEvent` (origin already
  exists at `events.ts:18`) and apply it in one shared consumer, or an `applyKnockback(...)`
  helper beside `resolve-hit.ts`.
- **`M-P0-5c` Bow has no cooldown/fire-rate.** Melee uses an FSM; the bow is a bare
  `wasFiring` edge-detect that fires on every click with no rate limit (`bow-system.ts:61-71`).
  **Fix:** a shared weapon-timing/cooldown (see `U-P2-w` weapon abstraction).

Good news it builds on: `resolveHit` (`resolve-hit.ts`) is already the genuine shared
crit/damage core used by all three hit producers — the gaps are _around_ it, not in it.

### `M-P0-6` [MISSING content] Authored Burning + Camp cutscenes _(game content · Act 1, engine exists)_

- **What.** The sequencer exists and works, but the only authored cutscene is the tutorial
  (`pickup-tour-cutscene.ts`). No Burning/Camp defs; cutscenes are **code** (TS generators),
  so authoring is programmer-only.
- **Fix.** Write the Burning + Camp `CutsceneDef`s; add any missing verbs (spawn/despawn,
  play-animation, fire-VFX). Depends on `M-P0-4` to start them by area. The editor authoring
  tool for this is `U-P1-seq`.

### `M-P0-7` [MISSING] Event→SFX audio system _(engine facade + game slice · Act 1 combat tutorial)_

- **What.** The **only** gameplay audio path is the dialogue `VoiceSystem`. Combat, death,
  pickup, and interaction fire well-formed events every frame that play nothing. Notably the
  intended primitive already exists and is dead: `AudioManager.play(url, {pitch,speed,gain})`
  is a granular one-shot built for SFX with **zero callers** (`audio.ts:132`).
- **Why.** Act 1 is "introduction to gameplay"; the forest combat beat feels flat with no hit
  or death sound. Without a shared system, combat/pickup/UI each hand-roll event→clip→play,
  reinventing the same loop 3–4×.
- **How.** `UpdateContext.audio` and `CutsceneContext.audio` already thread the manager
  everywhere. `flavour.json` is the exact tag→set data shape a combat-SFX map would parallel.
  Natural seams: `hitsplat-spawn-system.ts:27` (already picks a flavour set), `death-system.ts`,
  `pickup-system.ts:83`.
- **Fix.** Engine: a small `playSound(tag, opts)` facade over the dead `play()`. Game: a
  data-driven `game/audio/` slice with `sounds.json` (event/tag → clips + gain/pitch-jitter)
  and a `SoundEventSystem` reading the gameplay events.

---

## P1 — Act 1 BIGCITY hub (beat 6)

### `M-P1-1` [MISSING] Inventory + items _(game · Act 1/2)_

- **What.** No inventory/item system anywhere; the Ink `give_item` external is a literal no-op
  `(_item, _count) => 0` (`ink-bindings.ts:52-56`). Quest `item` rewards have nowhere to go.
- **Why.** Gateway to the Act-1 hook (the lookalike bracelet) and all of Act 2 (the merchant
  inventory holding the Gravine's bracelet). Highest-leverage missing system in the hub.
- **Fix.** `game/inventory/` — `InventoryComponent` (serializable), an item catalog under
  `content/items/*.json` loaded like quests, grant/consume events, and real `give_item` +
  quest `item`-reward handlers. The bracelet is a catalog item with metadata. _UX-heavy — ask
  the user for the flow._

### `M-P1-2` [MISSING/insufficient] Reputation (faction is a hardcoded table) _(game · Act 1)_

- **What.** `getReaction` resolves hostility from a hardcoded const
  `FACTION_PAIRS = { margrave: { player: "hostile" } }` (`reaction.ts:6-10`);
  `FactionComponent` is a single static string. No mutable standing.
- **Why.** Storyline names it explicitly ("Who are you here?"). The one way to make anyone
  react to the player today is to edit a TS literal.
- **How / good news.** Consumers are already unified: `enemy/perception-system.ts:63,224` and
  `combat/melee-system.ts:74` both route through `getReaction`, so a reputation-aware
  `getReaction` upgrades enemy targeting and friendly-fire in one place.
- **Fix.** Move the pair matrix to data (`content/` JSON) and add a standing store folded into
  the `M-P0-1` container; `getReaction` blends standing into the base pair result. _Single-axis
  vs per-faction is a UX decision — ask the user._

### `M-P1-3` [MISSING] Merchant / shop _(game · Act 2, Act-1 reveal can be faked)_

- Gated on `M-P1-1`. A merchant NPC with stock + buy/sell UI. The end-of-Act-1 reveal is a
  trader's stock; Act 2 hinges on it. _UX-heavy — ask the user._

### `M-P1-4` [UNIFY→extend] Quest objective types + reward channel _(game · Act 1)_

- **`M-P1-4a` Objective tracking is hardcoded per event.** `QuestSystem.update` has two
  near-identical event→counter blocks — `DeathEvent`→`killTagged` (`quest-system.ts:35-44`)
  and `PickupCollectedEvent`→`collectTagged` (`:45-54`) — with the type union hardcoded at
  `:122` and `loader.ts:3` **[corrected: was `:2`; line 2 is `activeInStage`]**. Adding
  talk-to/fetch/deliver (needed for the hub quests) means editing the system. **Fix:** an
  objective-type registry (`quest/objective-types.ts`) where each type declares its advancing
  event + tag resolver; `QuestSystem` iterates registered types. **[Part III]** This
  registry generalizes the _wrong axis_: `killTagged`/`collectTagged` are "count N tagged
  entities via an event," but talk-to is count-1 and _deliver_ is an inventory-state
  predicate — an `event→tagged-counter` shape still can't express them. Model objectives as a
  `progress(quest, worldState)` predicate, not solely an event→counter map.
- **`M-P1-4b` Reward dispatch is split with a dead registry and a dropped type.**
  `rewardHandlers` is a module-level `{}` that is **never populated** (`quest-system.ts:24,180`);
  the only real consumer is `pickup-system.ts:55-64`, ability-only, so `type:"item"` rewards
  (massacre's `potion_healing`, `massacre.json:15-22`) **silently vanish**. **Fix:** delete the
  dead map; make `QuestRewardEvent` the single channel with one handler per reward type (wire
  `item` into `M-P1-1`).

### `M-P1-5` [UNIFY→convention] Quest run-state bypasses the `MachineState` convention _(game · Act 1 beat 6 / Act 2)_

- **What.** AGENTS.md requires each feature to embed a `MachineState`. `QuestComponent` instead
  stores `stage: string` and rebuilds `{ current, elapsed: 0 }` fresh every frame, discarding
  `elapsed` (`quest-system.ts:55-71`). Works today only because the quest machine has no
  time-based transitions.
- **Why.** It structurally **cannot express a timed/expiring quest stage** — plausible for
  BIGCITY "set up a life" quests. A latent capability gap disguised as working code, and it
  can't adopt the shared `stepMachine` helper (`U-P1-fsm`) as-is.
- **Fix.** Give `QuestComponent` a `machine: MachineState`, route through `stepMachine`; keep
  `stage` only if the serialization/mirror contract needs the plain string.

### `M-P1-6` [insufficient] Companion follow hardening + ability persistence _(game · Act 1)_

> **◑ PARTIAL (2026-07-12).** Ability persistence is DONE: the player is a persistent entity
> and the bow is now a component on it (the `Bow.owner` entity-ref is gone), so abilities/bow
> survive scene changes. `Follow.leaderRef` is also revived so escort survives serialization.
> STILL TODO: companion follow hardening — multi-follower spacing/formation and free-roam
> catch-up across gaps. Ability half via `2026-07-12-feature-persistence-save-foundation.md`.

- Follow works for scripted escort but depends on the nav graph and has no multi-follower
  spacing/formation or free-roam catch-up across gaps (`follow-system.ts:9`). The escape beat
  is playable in cutscene form; free-roam forest platforming with two companions wants more.
- Abilities are granted by mutating `PlayerInputComponent` at runtime
  (`pickup-system.ts:27-43`) and are **lost on scene change** — persistence rides on `M-P0-1`.

### `M-P1-7` [MISSING] Mixer buses + player volume _(engine · Act 1 polish → mandatory before ship)_

- Every sound connects straight to `ctx.destination` (`audio.ts:85,155`); no master gain,
  category submix (voice/sfx/music), or volume state. The moment `M-P0-7` lands there are two
  categories with no way to balance them, and AGENTS.md's "no sliders" rule already anticipates
  unit-labelled volume inputs. **Fix:** master + named category buses on `AudioManager`,
  levels persisted in the `M-P0-1` container.

### Editor authoring tools needed to build Act-1 content

These block _authoring_ Act 1, not runtime.

### `M-P1-8` [MISSING] Array / `Record` inspector field types _(editor · foundational, blocks quest/inventory authoring)_

- **What.** `FieldControl` (`inspector.tsx:100`) has no array or map case; `Record`/array
  fields fall through to a text input and render `"[object Object]"`, uneditable. Example:
  `QuestComponent.counters`/`goals` are `Record<string,number>` (`quest-component.ts:11`) —
  not editable today. Quests, inventory, and reputation are all list/map-shaped.
- **Fix.** Add array/map cases to `FieldControl` with `FieldBinding` insert/remove/move ops.
  _Interaction UX — ask the user._ Biggest authoring blocker in the inspector slice.

### `M-P1-9` [MISSING pipeline] Prefab placement from the editor _(promote to engine · Act 1 level authoring)_

- **What.** Prefab instantiation lives in `game/prefabs.ts` (`spawnPrefab`), so the editor
  (Editor↛game) **cannot place prefab instances**. The editor recognises `*.prefab.json` as an
  asset type but registers no `scene-view` drop handler (`register-drops.ts` only wires
  `inspector-field`). Two conventions too: `game/content/prefabs/*.json` (bundled) vs editor
  `*.prefab.json` in the asset tree — they don't point at the same data.
- **Fix.** Promote to an engine `prefab/` slice (definition type + registry + `spawnPrefab`
  over engine `deserializeEntity`, which it already thinly wraps). Game registers its content;
  editor gains a scene-view drop handler calling the same `spawnPrefab`. Mechanical move.

### `M-P1-10` [MISSING] Cutscene / sequence editor _(editor · Act 1 Burning/Camp, Act 4 endings)_

> **◑ SUBSTRATE DONE (2026-07-12), editor tool still open.** The data-backed cutscene model
> this presumes now exists: `ResumableSequence` + the serializable `SequenceState`
> (`engine/sequence/`), with `CutsceneComponent` holding `SequenceState` instead of a raw
> generator (via `2026-07-12-feature-resumable-sequences.md`). The editor `editor/sequence/`
> timeline tool on top of it is STILL TODO — build it against this same `SequenceState` model
> (do not fork a second representation).

- **What.** Cutscenes are hand-written TS generators; there is no visual/data authoring. A
  fully generic `<Timeline>` widget already exists (`editor/timeline/*`) but is wired **only**
  to the audio editor — no `CutsceneDef` track model, no timeline panel `ViewKind`.
- **Why.** Acts 1 and 4 are cutscene-heavy; this is the **highest-value editor gap**.
- **Fix.** A new `editor/sequence/` slice built on the existing `<Timeline>` (leave the widget
  untouched), backed by an `EditorDocument` (`U-P1-doc`) with a `CutsceneDef` track model.
  _Authoring UX is a product decision — ask the user._

### `M-P1-11` [MISSING] Editor documents for dialogue/Ink and quests _(editor · Act 1 story authoring)_

- The document/history abstraction backs only scene/sprite/audio. Ink is raw-text +
  runtime-loaded (no editor document); there is no quest document (quests are hand-edited
  JSON). Dialogue drives Act-1 beats 1/4/6. **Fix:** build them as slices on the `U-P1-doc`
  base, driven by the already-generic `use-document-editor.ts`; dialogue first. A dialogue-graph
  editor is lower priority (Ink's own tooling may suffice). _Authoring UX — ask the user._

---

## P2 — Act 1 polish / later-act enablers

- **`M-P2-1` [MISSING] Music / ambience (streaming).** `AudioManager` only plays fully-decoded
  one-shots; no looped/crossfaded tracks or per-scene ambience, though cutscenes already carry
  an `audio` handle (`cutscene.ts:13`). Act 1 is atmosphere-driven (forest/camp/BIGCITY/burning).
  Build after `M-P0-7`/`M-P1-7`. _(engine controller + game bindings)_
- **`M-P2-2` Burning VFX** — fire/particles; fake with sprites/animation first. _(game content)_
- **`M-P2-3` Disk save/load** — ✅ **DONE (2026-07-12)** via the persistence + save
  foundation: `SaveStore`/`SaveManager` + Node-fs-behind-Electron-IPC backend + gzip
  (`CompressionStream`) + uniform append-only slots + migration seam + the game-shell save UI
  (Continue/manual slots/autosave/quicksave). _(engine + game)_

---

## Act 2/3/4-gating (ranked after Act 1)

All confirmed absent; ranked in act order. These generalise the same
persistence/inventory/reputation spine (`M-P0-1`, `M-P1-1`, `M-P1-2`).

- **Act 2 — `G2-1` Item provenance / chain-of-custody** (item instances carrying a source
  chain; extends `M-P1-1`). **`G2-2` Merchant inventories with sourcing links** (extends
  `M-P1-3`). **`G2-3` Investigation / clue tracking** — no clue/journal system; distinct from
  the linear quest FSM; `game/investigation/` + UI. **`G2-4` Region traversal / world map** —
  PARTIAL (scene stack exists via `M-P0-1`, no travel model).
- **Act 3 — `G3-1` Whole-game decision ledger** (broaden `M-P0-1`/`M-P0-2` to a delayed-consequence
  flag store). **`G3-2` Per-character relationships** (Sophia/Lorelei/Arend) gating branches —
  the faction table is far too coarse. **`G3-3` Party / ally roster** (recruited/alive/allegiance)
  — `follow` handles tag-alongs but there is no roster. **`G3-4` Army / faction-strength model**
  feeding the final battle.
- **Act 4 — `G4-1` Battle-scale performance (at risk).** Every enemy runs full perception + A\*
  - FSM each frame, and melee `strike` does an O(targets) ECS query per attacker
    (`melee-system.ts:66`); untested at "many AIs at once." Likely needs AI LOD / time-sliced
    perception / spatial partition, possibly squad abstraction. **`G4-2` Branch-composed battle**
    (from `G3-3`/`G3-4`). **`G4-3` Endings / consequence resolution** — sequencer exists; content
  - selector don't. Related AI gap: **ranged/kiting combat AI** (`enemyBrainMachine` attacks
    only via melee proximity) and **group/squad coordination**, both needed once battles scale.

---

# Part II — Abstraction / unification (same-purpose code to share)

## P0 / correctness

### `U-P0-1` [UNIFY] Screen-space `UI_SCALE` is hardcoded and diverges from the scene's real render scale — latent HUD bug _(engine · foundational-all)_

> **✅ DONE (2026-07-12).** `RenderContext` now carries `uiScale` (+ a `screenMetrics(ctx)`
> helper in `engine/system.ts`), populated from `scene.config.uiScale ?? 1` in both render-ctx
> sites (`scene-manager.ts`, editor `scene-view.ts`). The four HUD systems read `screenMetrics`;
> `game/settings.ts` (`UI_SCALE`) is deleted. Behaviour unchanged for the demo (`uiScale:3`).

- **What.** Every screen-space UI system computes its span as `renderer.width / UI_SCALE`
  with `UI_SCALE` a hardcoded `3` (`game/settings.ts:1`), but the band is actually rendered at
  `viewport / scene.config.uiScale` (`camera-2d-render.ts:60-61`, default `1`). They agree only
  because the one demo scene sets `uiScale: 3`.
- **Why.** Any scene with a different `uiScale` (or the default 1) mispositions/mis-scales every
  HUD widget (dialogue box, quest tracker, notices, death overlay) off-screen while the panels
  paint at the engine's real span — a silent, scene-dependent breakage. `RenderContext`
  (`engine/system.ts:22-28`) exposes no scene/uiScale at all. Screen-fade uses a _third_
  convention (raw pixels, `screen-fade-render-system.ts:11-17`).
- **Where.** `dialogue-render-system.ts:95-96`, `quest-notice-render-system.ts:25-26`,
  `death-overlay-render-system.ts:25-26`, `objective-render-system.ts:41`; constant at
  `game/settings.ts:1`; source of truth `camera-2d-render.ts:60-61`, `scene.ts:32`.
- **Fix.** Add `uiScale` (and derived `uiWidth`/`uiHeight`) to the engine `RenderContext`,
  populated from `scene.config.uiScale ?? 1` in `scene-manager.ts:114` and `scene-view.ts:286`.
  Systems read `ctx.uiScale`; delete `game/settings.UI_SCALE`; a `screenMetrics(ctx)` helper
  removes the repeated arithmetic. This is the seam the whole `engine/ui` plan sits on — fix it
  once, up front.

## Engine gameplay primitives

### `U-P1-fsm` [UNIFY] Shared `stepMachine` helper for the RunState rebuild+writeback boilerplate _(engine · all acts)_

> **✅ DONE (2026-07-12).** `engine/fsm/step-machine.ts` (`stepMachine(machine, state, ctx, dt)`)
> owns rebuild+step+writeback+cast. Migrated the 5 kernel sites (`enemy-brain-system`,
> `player-movement-system`, `player-animation-system`, `npc-animation-system`, `melee-system`),
> deleting their per-site `as SomeState`/`as Seconds` casts. dt conversion left at each call site
> (no silent time-scaling change, per the secondary note). `quest-system.ts` is intentionally
> **not** migrated — it needs the `MachineState` adoption in `M-P1-5` first. Tests green.

- **What.** Every kernel-driven system hand-rolls the identical dance around `machine.step()`:
  build a throwaway `RunState` from the embedded `MachineState` (with an unchecked
  `as SomeState` cast, ~11 casts total), convert dt, step, copy `next.current`/`next.elapsed`
  back. 6 sites: `enemy-brain-system.ts:93`, `player-movement-system.ts:89`,
  `player-animation-system.ts:71`, `npc-animation-system.ts:36`, `melee-system.ts:29`,
  `quest-system.ts:56` (variant).
- **Why.** Incidental wiring, not the "feature owns side-effects" logic AGENTS.md protects.
  Duplicated 6× it invites drift (one site forgetting to persist `elapsed` silently breaks every
  time-based transition).
- **Fix.** `engine/fsm/step-machine.ts` — `stepMachine(machine, state, ctx, dt)` owning
  **only** rebuild+step+writeback+cast; each site keeps its own `entered`/`exited` side-effect
  dispatch. The single `as S` inside is type-safe (S inferred from the machine).
- **Secondary note (decision, not a change).** All 5 sites divide raw `ctx.dt` (unscaled ms) by
  1000, bypassing the scaled `ctx.time.dt`, so **FSM timers ignore pause/slow-mo** while camera
  transitions honour it. The helper is the natural place to standardise time-scaling — flag for
  the owner, don't silently change behaviour.

### `U-P1-loco` [UNIFY] Player reimplements the engine locomotion actuator _(engine/game seam · Act 1+)_

- **What.** `PlayerMovementSystem` and `LocomotionSystem` implement the same ground/air accel
  model — byte-identical `approach()` + `applyImpulse(mass*Δv)`; `PlayerInputComponent`
  duplicates `LocomotionComponent`'s `maxSpeed/acceleration/deceleration/airControl` (same names,
  same defaults). The player never receives a `LocomotionComponent` and is on a different track
  from every other mover.
- **Where.** `engine/locomotion/locomotion-system.ts:8-17,32-44` vs
  `game/player/player-movement-system.ts:19-28,62-71`; components
  `locomotion-component.ts:10-13` vs `player-input-component.ts:12-15`.
- **Why.** Same purpose, two implementations; tuning duplicated, player/NPC drift, every future
  locomotion feature (ice, conveyors, knockback decay, the spec's grapple/wall upgrades) written
  twice. The plumbing to converge already exists — `PlayerIntentSystem` writes the shared
  `MovementIntentComponent`.
- **Fix.** Give the player a `LocomotionComponent`; let `LocomotionSystem` own base
  horizontal-move + jump; reduce `PlayerMovementSystem` to the player-only ability layer (dash,
  wall-slide/jump, multi-jump, variable jump). Ordering already supports this
  (`platformer.ts:124-125`); pick one owner per frame for the horizontal impulse.

### `U-P2-ground` [UNIFY] Grounded detection duplicated _(engine · Act 1+)_

- `GroundDetectionSystem` reimplements `engine/physics/grounded.ts`'s `computeGrounded` inline
  (`ground-detection-system.ts:17-24`) instead of calling it (as `LocomotionSystem` and
  `NavAgentSystem` do). **Fix:** call `computeGrounded(rb.body)`. May disappear entirely if
  `U-P1-loco` lands.

### `U-P2-nav` [UNIFY] Nav capability speeds parallel the Locomotion speeds _(engine · Act 1, matters more Acts 3/4)_

- `NavAgentComponent.moveSpeed/jumpSpeed` (planning, `nav-agent-component.ts:19-20`) duplicate
  `LocomotionComponent.maxSpeed/jumpSpeed` (actuation). Divergence = "planner plans a jump the
  body can't make." Defused today only by a convention (`enemy.json` zeroes the nav fields so the
  `|| loco` fallback picks up locomotion — `nav-profile.ts:14-23`). **Fix:** derive nav planning
  capability from `LocomotionComponent` when present, or keep nav fields strictly as an explicit
  override. Fix before authoring a roster of differently-statted combatants.

### `U-P2-impulse` [UNIFY] `impulse = mass*(target−current)` hand-rolled 3× _(engine · foundational)_

- Same "apply an impulse producing a target velocity" idiom at
  `locomotion-system.ts:39`, `player-movement-system.ts:69-71`, `pickup-system.ts:108-113`.
  **Fix:** `applyVelocityChange(target)` on `physics-body-component.ts` (already wraps
  `applyImpulse` at :82). Do alongside `M-P0-5b` knockback so it isn't a 5th hand-roll.

### `U-P2-countdown` [UNIFY] No scalar "countdown/lifetime" value type; reinvented ~5× _(engine · cross-act)_

- **What.** Several features embed a `Seconds` counter, decrement by `dt/1000`, clamp at 0, and
  act — with no shared primitive (`TimerComponent` doesn't fit; it fires a _global event_, not a
  per-entity value). Sites: hitsplat lifetime (`hitsplat-system.ts:26-29`), arrow `stuckRemaining`
  (`arrow-system.ts:64-71`), health-bar `visible`/`delay` (`health-bar-system.ts:38-44`), wander
  interval (`wander-system.ts:43-44`), dash timers (`player-input-component.ts:44-45`).
- **Fix.** A serializable `Countdown` value type mirroring `Tween`
  (`{ remaining; tick(dt); done(); reset() }`). Fold `fadeAlpha(remaining, fade)`
  (`color-resolver.ts:10`, used at 3 sites) into it as `countdown.fade()`. Keep `Tween` and
  `FadeTimeline` separate (genuinely different envelopes — do **not** merge).

### `U-P2-damp` [UNIFY] Frame-rate-independent damp factor `1 − exp(−dt/τ)` duplicated _(engine · foundational)_

- Verbatim at `camera-2d-follow-system.ts:13` and `health-bar-system.ts:46`. Subtle to get right;
  more consumers coming (companions, cutscene camera). **Fix:** `damp(current, target, tau, dt)`
  / `dampFactor(tau, dt)` in an engine math util (Vector2 has `lerp` but no time-based damp).

### `U-P2-cameratween` [UNIFY] `CameraTransition` glide re-implements `Tween` _(engine · Act 1 cutscene camera)_

- `camera-transition-system.ts:124-147` hand-rolls `elapsed/progress/ease/lerp` identical to
  `tween.ts:35-57` (even imports the same `ease`). **Fix:** drive the glide from a scalar `Tween`
  stored on the component; keep position/zoom hand-lerped via `tween.value()`.

## World-anchored feedback widgets

### `U-P1-anchor` [UNIFY] Five sites reinvent "anchor above an entity's sprite top" + no camera projection _(engine · Act 1)_

> **◑ PARTIAL (2026-07-12).** Part (2) done: `Camera2D.worldToScreen`/`screenToWorld` now take an
> optional `out?: Vector2` and mutate-in-place when given (allocating only when omitted) — the
> non-allocating projection both this finding and the in-game-ui plan need. Still TODO: part (1),
> the `entityTopAnchor(ecs, assetManager, id, margin)` helper unifying the five divergent anchor
> bases, and rewiring the widgets to it.

- **What.** "sprite source height × scale ÷ 2, offset from `transform.position.y`" is copy-pasted
  across every floating widget, inconsistently: hitsplat and health use different bases, so widgets
  on the same entity don't line up. `DebugTagSystem` already has the most complete version
  (sprite-or-physics fallback) but privately. None project through the camera, so off-screen
  markers can't be edge-clamped/pointed-toward (the quest-marker's missing feature).
- **Where.** `hitsplat-spawn-system.ts:168-184`, `quest-marker-render-system.ts:43-51`,
  `interact-hint-render-system.ts:47-72`, `debug-tag-system.ts:29-42` (the model),
  `health-render-system.ts:32-33`.
- **Fix.** (1) An engine `entityTopAnchor(ecs, assetManager, id, margin)` helper (sprite-else-
  physics-else-0 fallback) — only touches engine components, legal for game to import. (2) A
  non-allocating `worldToScreen` (scalar/out-param) on `Camera2D` — the existing one allocates a
  `Vector2` per call (`camera-2d.ts:37-44`), unusable per-entity per-frame. Together they unblock
  off-screen edge-clamped quest markers. Keep the four systems separate (they paint different
  marks); only the positioning math unifies.

### `U-P1-fade` [UNIFY] Duplicate "tick FadeTimeline → destroy when done" + no notice/toast queue _(engine + game · Act 1/2)_

- **`U-P1-fade-a` Byte-identical lifecycle systems.** `DeathNoticeSystem` and `QuestNoticeSystem`
  are the same `fade.tick(dt); if (fade.done()) ecs.destroy(id)` loop
  (`death-notice-system.ts:8-15`, `quest-notice-system.ts:8-15`). Every future timed-fade toast
  spawns another copy. **Fix:** a generic engine `FadeLifetimeComponent` + `FadeLifetimeSystem` in
  `engine/animation/`.
- **`U-P1-fade-b` [MISSING] Two copy-paste banners; no toast queue.** `DeathOverlayRenderSystem`
  and `QuestNoticeRenderSystem` are the same full-width-bar + centered-text renderer
  (`death-overlay-render-system.ts:13-49`, `quest-notice-render-system.ts:13-49`), differing only
  in anchor/color — and both are **singletons** (`query()[0]`) that **cannot coexist or stack**. A
  quest-complete and a death notice near each other overdraw. BIGCITY quests (Act 1) and the
  merchant/bracelet reveal (Act 2) need queued/stackable notices. **Fix:** one game
  `NoticeComponent` (text/color/anchor/`FadeTimeline`) + one `NoticeRenderSystem` rendering all
  active notices; death/quest emit the same component. The unification is cleanup; the **queue is
  a genuine missing system**.
- **`U-P2-fademodels` (bundle) Three incompatible fade models.** `FadeTimeline` (notices) vs
  hitsplat `age/lifetime` vs health-bar `visible` countdown, with `fadeAlpha` re-derived per
  renderer. Standardise fade-out on `FadeTimeline`/the `U-P2-countdown` type. Hitsplat keeps its
  ballistic motion (different purpose — not merged).
- Once these land, entity-anchored widgets (hitsplats, markers, hints, health bars) compose two
  shared primitives (`U-P1-anchor` + `FadeLifetime`) instead of four parallel stacks — new widgets
  (damage numbers, status icons, speech bubbles) become trivial. (Minor: `FadeTimeline` hardcodes
  linear ramps, `fade-timeline.ts:55` — give it an optional `Easing`.)

### `U-P2-banner` [UNIFY] (subsumed by `U-P1-fade-b`) — the death/quest banner draw is one `drawBanner` helper.

## Input

### `U-P1-input` [UNIFY/MISSING] One engine action-resolver + edge primitive replaces six hand-rolled input patterns _(engine · Act 1)_

All six converge on the single indirection both `docs/plans/*` already specify.

- **`U-P1-input-a` Edge detection reimplemented at 7 sites.** "Just pressed/released" re-derived
  from held booleans with a private prev-frame flag: `interaction-system.ts:21-23`,
  `player-intent-system.ts:25,43,46`, `player-movement-system.ts:128-133`,
  `dialogue-system.ts:358-368`, `bow-system.ts:60-71`, `entity-editor.ts:50-52`,
  `tile-editor.ts:126-131`. No engine edge primitive exists.
- **`U-P1-input-b` Consumption is an ad-hoc shared-mutable-field handshake.**
  `InteractionStateComponent.pressedThisFrame` is written by one system and read-and-cleared by two
  others in execution order (`interaction-system.ts:22`, `dialogue-bindings.ts:17-25`,
  `dialogue-trigger-system.ts:48-51`). Ordering is load-bearing and undocumented.
- **`U-P1-input-c` Bindings are a flat keyboard-only string map read directly everywhere.**
  `game/input-bindings.ts` `{action:"KEY"}` read via `keyboard.keys[InputBindings.x]` at 6 sites
  incl. the hint display string (`interact-hint-render-system.ts:82`) and the skip-is-interact
  anti-pattern (`platformer.ts:144`). No device abstraction, no rebinding, no persistence.
- **`U-P1-input-d` Hold-to-activate is a third bespoke activation.** Cutscene skip accumulates
  `skipHeldTime` against a hardcoded `SKIP_HOLD_SECONDS = 0.6` (`cutscene-system.ts:10,54-60`) —
  same activation taxonomy (press/hold/repeat), no shared home for the player-configurable hold
  threshold AGENTS.md's accessibility rule wants.
- **`U-P1-input-e` [MISSING] No DOM-free `DeviceSnapshot` seam.** `Input` is DOM-attached and
  editor-swapped wholesale (`run-session.ts:101-104`); the resolver has nothing testable to depend
  on and the swap can't cleanly reset edges.
- **`U-P1-input-f` [MISSING] Gamepad is fully polled but has ZERO consumers; no menu/UI routing or
  masking.** No reader of `gamepads` in game/ or editor/ (`gamepad.ts`, `input.ts:22-28`); dialogue
  choice nav is keyboard-only; masking is faked by the editor's whole-`Input` swap;
  `blocksInputBelow` on the scene stack is never consulted. **[corrected]** "Never consulted"
  is literally false — it _is_ read at `scene-manager.ts:74`, but only inside `receivesInput()`,
  which has **zero callers**. So it's dead through a dead method (and the editor even _sets_
  `blocksInputBelow:true` for its pause overlay, silently to no effect) — inert, but not
  unread.
- **Fix.** The engine action-map + edge primitive + `DeviceSnapshot` in `engine/input/bindings/`
  (per `configurable-input-bindings.md` steps 6/10), with `actions` on `UpdateContext`; game grows
  `game/input-bindings.ts` into an `ActionCatalog`. Migrate each edge site per-token, deleting its
  prev-frame flag in the same commit. Gamepad routing + masked-input arbiter unblock Act-1 menus
  and dialogue-choice navigation; full focus-nav rides the in-game-UI plan.

## Text

### `U-P2-text` [UNIFY] Glyph shaping+advance duplicated 4× (and already disagreeing); dead `text-layout.ts` _(engine · quality, do before more text features)_

- **`U-P2-text-a`** The "shape string → sum `xAdvance*scale` + synthetic-bold fudge" primitive is
  reimplemented in `font-atlas.ts:174`, `font-blit.ts:44`, `rich-text.ts:192`, `text-layout.ts:8` —
  and the four already **disagree** (`text-layout` omits the bold fudge, so it under-measures bold).
  **Fix:** one `shapeGlyphs`/`advanceOf` in `engine/text`.
- **`U-P2-text-b`** `engine/text/text-layout.ts` has **zero consumers** (src + test) and duplicates
  the live `wrapRichText` path at lower (buggy) fidelity. **Fix:** delete it.

## Editor tooling

### `U-P1-doc` [UNIFY] `EditorDocument` base + snapshot-commit helper duplicated 3× _(editor · enables `M-P1-10/11`)_

- **What.** `SceneDocument`, `SpriteDocument`, `AudioDocument` each re-declare identical
  `_dirty`/`markDirty`/`markSaved` + `Subscribable` + `toBlob`; `use-document-editor.ts:6` already
  assumes this exact shape but it's never codified. Separately, the "snapshot → push undo command"
  helper is reimplemented 3× (`layer-commands.ts` `mutate()`, `audio-editor.tsx` `withHistory()`,
  `stroke.ts` `commitStroke()`).
- **Fix.** Extract an `EditorDocument` base + a generic `commit()` over a `Snapshotable`
  interface. Enables the missing dialogue/quest/cutscene documents (`M-P1-10/11`). (`subscribable.ts`
  is _not_ reimplemented anywhere — the reactive layer is already unified; only the document layer
  duplicates.) Minor: audio has no command module (undo lives in the component); scene dirties as a
  side-effect of any `History.notify` and never clears on undo-to-clean — a latent "unsaved" UX bug;
  _the dirty-origin UX is a product decision — ask the user._

### `U-P1-debugdraw` [UNIFY] No shared immediate-mode debug-draw/gizmo helper; runtime visualizers stuck editor-side _(engine · Act 1 AI/combat/nav debugging)_

- **What.** `Renderer2D` exposes only raw `drawLine/drawRect/drawText`, so every debug system
  reinvents zoom→world scaling (5 sites), the `line()` wrapper (2, verbatim), arrowheads (3–4),
  centered markers (4), and floating labels. `AiStateDebugSystem` (editor) and `DebugTagSystem`
  (engine) draw the same outlined label with the same half-height math.
- **`U-P1-debugdraw-b` Wrong layer.** Nav-graph/path, perception, AI-state, and physics-shape
  visualizers render engine **runtime** data but live in `editor/systems/` and can't run at Play
  time — exactly the AI/combat/nav (P0) debugging Act 1 needs. Their only editor coupling is
  `cssVar` (`getComputedStyle`) and `DebugFlags` (localStorage).
- **Fix.** An engine `engine/debug/debug-draw.ts` (lines, arrows, markers, labels, zoom-scaled);
  move the runtime visualizer render systems into engine slices, parameterising colours + an
  `enabled()` predicate to drop the DOM/editor coupling. (Interactive gizmo handles / hit-testing
  are a separate, lower-priority editor gap: the transform gizmo is display-only, all drag is
  whole-entity.)

### `U-P1-paint` [UNIFY] Two near-identical drag-to-paint loops (sprite vs tile) _(editor · Act 1 art/tile authoring)_

- `TexturePanel` and `GameViewPanel` each reimplement the whole drag-to-paint interaction (paint
  state, pointer handlers, bresenham stroke, `commitStroke`, hover/cursor); only the pointer→pixel
  `resolve` differs (`texture-panel.tsx:103-195` vs `game-view-panel.tsx:102-212`). Related:
  `SpriteCameraSystem` vs `EditorCamera2DSystem` duplicate pan/zoom (`sprite-camera.ts:64-101` vs
  `editor-camera-2d.ts:97-132`); two layer panels duplicate the row UX
  (`layers-panel.tsx` vs `tile-layers-panel.tsx`); the "stroke along a line" wrapper repeats 3×;
  and the tool-model enums diverge (`SpriteTool` "erase" vs `EditorMode` "eraser"). **Fix:** a
  shared paint-controller parameterised by the `resolve` step; unify the camera pan/zoom and the
  layer-row component; reconcile the tool enum.
- **`U-P1-paint-missing` [MISSING]** the pixel painter has no **flood-fill/lasso** (the tile editor
  does — `tile-editor.ts:309-351`, and its BFS flood is grid-generic and reusable), and there is
  **no tileset/autotile authoring** beyond a hardcoded 3-column slot map (`autotile.ts:82-110`) —
  the storyline needs distinct forest + BIGCITY tilesets.

### `U-P1-overlay` [UNIFY] Every base-ui overlay surface is re-plumbed by hand _(editor · foundational, grows with each Act-1 panel)_

- One root cause, four duplicated shells (each collapsible to one wrapper — do **not** merge across
  primitives): context-menu shell ×3 (`asset-context-menu.tsx:17`, `entity-context-menu.tsx:37`,
  `asset-browser.tsx:324`); select-dropdown shell ×3 (`inputs.tsx:139`, `tile-layers-panel.tsx:191`,
  `layers-panel.tsx:144`); anchored popover ×4 (`debug-overlays-popover.tsx:49`,
  `color-picker-popup.tsx:25`, `color-field.tsx`, `layers-panel.tsx:170`); modal dialog ×3
  (`confirm-dialog.tsx:33`, `new-sprite-dialog.tsx:73`, `entity-context-menu.tsx:196`). **Fix:** one
  wrapper per primitive over base-ui.

### `U-P2-fields` [UNIFY] Inspector field scaffolding duplicated _(editor · foundational)_

- Scaled-unit scalar inputs (`angle-input`/`duration-input`/`percent-input`) are the same
  "number × scale + unit adornment, commit to one sub-key" widget three times (+ a copy-pasted
  `round`) → one `ScaledNumberField`. "Draft + commit-on-blur" is reimplemented 3× (`inputs.tsx:71`,
  `oklch-field.tsx:25`, `font-preview.tsx:317`), two of them handrolling numeric arrow-stepping
  base-ui `NumberField` already provides (an AGENTS.md "check base-ui first" gap — the editor
  exemption is scoped to sliders only). _(The slice is otherwise healthy: a shared `FieldBinding`
  command and a value-renderer registry already exist and are used consistently.)_

### `U-P2-usevalue` [UNIFY] `useEditorValue` bypassed by ~10 raw `useSyncExternalStore` sites _(editor · cleanup)_

- Same purpose, two spellings across color/\*, scene-view-panel, project-tree, layers-panel,
  tool-panel, editor-store-context. Mechanical migration to `useEditorValue`.

### `U-P2-scenecfg` [UNIFY] `SceneConfig` schema declared 3× _(engine/editor · correctness)_

- `gravity/uiScale/clearColor` are described by `@serialize` decorators **and** a hand-written
  `SceneConfigData` type **and** two manual mappers (`toSceneConfig` decode `scene.ts:36-46`,
  `exportSceneJson` encode `level-export.ts:11-20`), bypassing the serialization system that already
  knows them. `exportSceneJson` also hardcodes `version:1` and **drops `SceneFile.tiles`** on save.
  **Fix:** round-trip `SceneConfig` through `walkFields`/`reconstruct`; delete the type + mappers.
  **[corrected]** The "drops `SceneFile.tiles`!" alarm is overstated — **not a bug**. `tiles`
  is a legacy one-way _import_ field read only by `platformer.ts` `migrateFile` to upgrade
  old-format scenes; live tiles are stored as `TileLayerComponent` entities and serialized via
  `entities`. Modern scenes (the only one, `demo.scene.json`, has no top-level `tiles`)
  round-trip losslessly. The `SceneConfig` triplication is the real (cleanup) finding; the
  tiles-drop is correct behavior.

### `U-P2-audioutil` [UNIFY] AudioBuffer→mono downmix duplicated _(engine · infra)_

- `mixToMono` (`editor/audio/waveform.ts:3`) and `downmixToMono` (`game/dialogue/voice-bank.ts:83`)
  are the same channel-average op in two homes, already drifting. **Fix:** one `mixToMono` in
  `engine/audio/`; both layers import it.

### `U-P2-color` [UNIFY] Color-space math split across two `colorjs.io` entry points _(engine/editor · low)_

- All color math funnels through `engine/render/color-resolver.ts` (CSS→sRGB) and
  `editor/color/oklch.ts` (OKLCH↔sRGB); both import `colorjs.io` independently and each re-declare
  `clamp01`; one `css → oklch` conversion is hand-stitched across the layer boundary in
  `color-field.tsx:19-25`. `oklch.ts` is pure math with no editor deps → can move to engine. **Fix:**
  an engine-owned `color-space` module; editor re-exports. (Also `slider-value.tsx:6-9` re-implements
  `cssVar` uncached — one-line import fix.)

---

# Deliberately NOT merged / NOT flagged (verified steers)

To prevent re-auditing, these look like duplication or gaps but are correct as-is:

- **The ~5 small `Map` "registries"** (serialization, scene, value-renderers, asset-drop, prefab/
  cutscene maps) share only the shape `Map<key,thing>`; they are different-purpose and partly
  editor-only. Do **not** merge. The one real consolidation among them is the prefab _pipeline_
  (`M-P1-9`), not the Maps.
- **`ArrowComponent` duplicating `DamageStatsComponent` fields** — intentional fire-time snapshot
  (a buff expiring mid-flight must not retro-weaken the arrow).
- **Rich-text tags vs Ink tags** — different grammars/purposes; merging would couple unrelated
  parsers.
- **Engine `BlendMode` (WebGL) vs editor `blend-modes` (Canvas2D)** — different backends; sprite
  layers are baked to a texture at author time, so no runtime fidelity gap. (Only nit: colliding
  type name.)
- **`Tween` vs `FadeTimeline`** — genuinely different envelopes; keep separate.
- **`walkTo` cutscene verb** — a deliberate no-nav-graph scripted-walk fallback, distinct from
  `moveTo`/`escort` which correctly delegate to nav/follow.
- **`playerAnimMachine` shared by player + NPC animation** — already good reuse.
- **`getReaction` as the single hostility oracle** for enemy perception and melee — already unified;
  the reputation work (`M-P1-2`) upgrades it in one place.
- **`TimerComponent`/`scheduleEvent`** — already the right shared "fire a global event after a
  delay" primitive (respawn uses it correctly); the `U-P2-countdown` type is for _per-entity value_
  countdowns, a different case.
- **`encodeWav` vs `decode`, `AudioRecorder`, editor audio document tooling** — inverse ops /
  editor-only authoring, no game overlap.

---

# Appendix — finding index by slice

| Slice                                        | Findings                                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| Serialization / scene / prefab               | `M-P0-1`, `M-P1-9`, `U-P2-scenecfg`                                                     |
| Dialogue / Ink / text / voice                | `M-P0-3`, `M-P0-2` (partial), `U-P2-text`                                               |
| Combat                                       | `M-P0-5`, `U-P2-impulse`                                                                |
| AI / locomotion / nav / follow               | `U-P1-loco`, `U-P2-ground`, `U-P2-nav`, `M-P1-6`, `G4-*` (ranged/squad AI)              |
| FSM usage                                    | `U-P1-fsm`, `M-P1-5`                                                                    |
| Quest / faction / interaction / pickup / npc | `M-P0-4`, `M-P1-1`, `M-P1-2`, `M-P1-3`, `M-P1-4`                                        |
| Render systems                               | `U-P0-1`, `U-P1-anchor`, `U-P2-banner`                                                  |
| Feedback / notices / overlays                | `U-P1-fade`, `U-P2-fademodels`, `U-P1-anchor`                                           |
| Time / tween / fades / camera FX             | `U-P2-countdown`, `U-P2-damp`, `U-P2-cameratween` (cutscene sequencer confirmed EXISTS) |
| Input                                        | `U-P1-input` (a–f)                                                                      |
| Audio                                        | `M-P0-7`, `M-P1-7`, `M-P2-1`, `U-P2-audioutil`                                          |
| Editor documents / history                   | `U-P1-doc`, `M-P1-11`                                                                   |
| Editor inspector fields                      | `M-P1-8`, `U-P2-fields`                                                                 |
| Editor workspace / overlays / timeline       | `U-P1-overlay`, `M-P1-10`, `U-P2-usevalue`                                              |
| Editor debug overlays                        | `U-P1-debugdraw`                                                                        |
| Editor sprite / tile tools                   | `U-P1-paint`                                                                            |
| Color / render primitives                    | `U-P2-color`                                                                            |

---

# Part III — Adversarial review (2026-07-12): corrections, cut corners, revised sequencing

Independent agents re-attacked this audit against source. Outright factual errors are fixed
inline above (**[corrected]**). This part holds the design-level critiques, the biggest
structural hole, and a revised ship sequence. The audit is otherwise well-evidenced — the
layering claim is confirmed clean, all four _Corrections_ refutations hold, `U-P0-1` is a real
bug whose fix does not regress the demo, and the large majority of duplication claims land on
real code.

## §1 The reconciliation-with-plans hole (highest-leverage)

The audit re-derives work already specified in the plan corpus without reconciling — risking
wasted and conflicting effort. This is more important than any single finding.

- **Throwaway-work risk vs `2026-07-09-feature-in-game-ui.md`.** That plan already specs the
  non-allocating `worldToScreen` + anchor system with edge-clamp/point-toward (`U-P1-anchor`),
  the `UI_SCALE`→`scene.config.uiScale` migration (`U-P0-1`), and a **Phase-2 migration table
  that deletes and replaces** the death-overlay / quest-notice / health-bar / hitsplat / marker
  / hint render systems that `U-P1-fade` / `U-P2-fademodels` / `U-P2-banner` / `U-P1-anchor`
  propose to _tactically unify_. Doing those unifications first may be deleted work. **Sequence
  against that plan:** do `U-P0-1` (the constant, now) and the non-allocating `worldToScreen`
  (a plan prerequisite regardless); **defer** the notice/fade/banner unifications unless
  engine/ui slips.
- **Re-derivation vs `2026-07-09-feature-configurable-input-bindings.md`.** `U-P1-input` (a–f)
  restates that plan's design (DeviceSnapshot seam, action catalog, per-token consumption,
  gamepad, aim). Its genuine value-add is the _fuller duplicate-site inventory_ + two dead-code
  findings the plan omits (gamepad has zero consumers; `blocksInputBelow`/`receivesInput` dead
  path). Keep those; defer the design to the plan (see §4).
- **Architectural fork (`M-P0-1`).** The audit proposes a persistent **container outside any
  scene World** and "do **not** overload per-scene serialization." The removed save brief's
  _locked_ decision is a persistent **scene** captured via `serializeWorld` (Appendix B). These
  are two designs for the same thing. Pick one and reconcile when re-planning save — do not
  build the container blind to the save format it must later feed.
- **`M-P1-9` = the removed prefabs brief.** The engine-promotion `M-P1-9` proposes is already
  fully specified there (registry / `instantiate` / `{prefab,overrides}` / editor placement).
  Re-plan `M-P1-9` from the Appendix-B gist rather than as a fresh finding.

## §2 Fixes that cut corners or pick the wrong seam

- **`M-P0-5a` attack-intent under-mirrors the component it cites.** `MovementIntentComponent`
  carries `jumpPressed` **and** `jumpHeld` **and** `jumpSpeed` precisely because one bool can't
  express variable/charged actions. `AttackIntent{firing, aim}` therefore can't express
  charge/windup bow attacks, and every weapon system would still hand-roll its own edge
  detection (the duplication the finding claims to kill). Worse, **N weapon systems reading one
  `firing` bool all fire at once** — there is no weapon-selection/routing. Needs
  `firePressed`/`fireHeld` (+ hold duration) and a weapon-routing model. (Also: the cited
  "already-clean" movement layer still reads raw `input` for dash — that leak is `U-P1-loco`.)
- **`M-P0-5b` overloads the wrong field.** `DamageEvent.origin` is the _perception-stimulus_
  point — arrows deliberately set it _behind_ the hit for AI bearing — and melee knockback is
  `facing.dir`-based, not radial-from-origin. Carry an **explicit** knockback impulse on the
  event (or resolve it in `resolveHit`, where crit/damage already live), not on `origin`. Two
  hazards to flag: melee applies impulse _inline_ today → **double-application** unless migrated
  in the same change; and multi-hit-per-frame impulses stack.
- **`M-P0-3` "adopt the Ink entity across scenes" over-reaches the ECS model.** Cleaner: persist
  only the serialized `state` string in the container and re-hydrate a fresh component per scene
  via the existing `LoadJson` path. The "save on `DialogueClosedEvent`" hook also misses
  mid-scene / external-function writes (a `mirrorStage` quest-var write followed by an
  area-trigger transition before any dialogue closes) — include a before-teardown write.
- **`M-P0-7` may build over the wrong primitive.** The dead `play()` spins a granular
  AudioWorklet per shot and uses a separate decode cache that returns **silence until first
  decode** (first sword hit plays nothing). Build SFX over the proven `playBuffer` + a `warm()`
  preload (as `VoiceSystem` does), and give the `playSound(tag, opts)` facade a `category`/`bus`
  argument **from day one** — that signature, not the ordering, is the only real
  "buses-later-causes-rework" risk. (Buses-first is correctly judged premature — one category.)
- **`M-P1-4b`** single-channel is right, but pair it with a **"no handler for reward type"**
  loud failure/log, or it reproduces today's silent-vanish for the next unwired reward type.
- **`M-P1-2` / `M-P1-1` "ask the user — UX-heavy" mislabels data-model decisions.** Because the
  `M-P0-1` container "can later back disk save," reputation keying (scalar vs per-faction vs
  per-character) and inventory shape (stack vs item-**instance**) are **durable save-schema**
  choices — and the audit's own `G3-2` ("faction table far too coarse") and `G2-1` (item
  provenance ⇒ instances) say Acts 2–4 outgrow any naive Act-1 answer. Decide these up-front
  against the full act arc (with the user, per AGENTS.md), not deferred behind `M-P0-1` as if
  orthogonal.
- **`M-P1-5` is worse than stated.** The quest step passes `0 as Seconds` as dt, so `elapsed`
  never advances _regardless_ of persistence — "structurally cannot" is really "code choice +
  dt=0." Embedding `MachineState` also makes `elapsed` persist for free (it is `@serialize`'d);
  keep `stage` only for the Ink mirror.
- **`U-P1-loco` "pick one owner per frame" under-sells a real hazard.** `PlayerMovementSystem`
  runs _before_ `LocomotionSystem`, and the ability layer writes `linearVelocity` directly and
  must run _after_ the base impulse; naive convergence → **double-impulse + inverted
  precedence**. A medium-risk refactor of core player feel that no Act-1 feature forces —
  **defer**.

## §3 The `M-P0-6` ↔ `M-P1-10` cutscene tension (unacknowledged)

Cutscenes are generator **code** (runtime ECS queries, computed positions, branching), not
data. A timeline / `CutsceneDef`-track editor (`M-P1-10`) needs a \*\*new serializable verb model

- interpreter** — a second cutscene runtime — before any timeline can drive them. So anything
  hand-written for `M-P0-6` (P0) becomes **editor-unloadable legacy** → guaranteed rework or
  permanent bifurcation. `M-P1-10`'s "backed by a `CutsceneDef` track model" presumes that model
  into existence. **Decide before authoring the P0 cutscenes:\*\* either scope the data model +
  interpreter first, or explicitly accept `M-P0-6` as throwaway code.

## §4 Input finding (`U-P1-input`) — sequencing & scope fixes

- **a–f is not a build order.** `(e)` the DeviceSnapshot seam **gates** `(a)–(d)`. `(f)` fuses a
  now-item (gamepad as a resolver _source_) with a deferred one (masked-input arbiter + menu
  focus-nav + `blocksInputBelow` revival — both dated plans push these to the in-game-UI layer).
- **2 of the 7 edge sites are editor mouse-drag gestures** (`entity-editor`, `tile-editor`) that
  will not become action-map consumers — at most they share a low-level engine edge primitive.
- **"Delete the prev-frame flag in the same commit" is false for `pressedThisFrame`** — a
  load-bearing 3-system handshake whose migration is an atomic cluster that also drags in the
  cutscene-skip rebinding (skip is bound to interact today). True only for the private flags.

## §5 Overstatement / honesty watch-list

- Cutscene "robust" → singleton, no error handling (corrected inline).
- `U-P1-fade` "queue is a genuine missing system" → real, but a **BIGCITY/P1 hub** need, not a
  forest-tutorial ship blocker; the `NoticeComponent` unification is cheap cleanup, the queue is
  P1.
- `U-P2-countdown` "reinvented ~5×" → loose: a mix of count-**up** (hitsplat, wander) and
  count-**down** (health-bar, arrow) sites, not one idiom. Pure cleanup, low Act-1 priority.
- `U-P1-debugdraw` → real and layering-legal to move, but **dev tooling**, not a
  content-shipping blocker; P0-relevance overstated.
- `U-P1-fsm` secondary note ("FSM timers ignore slow-mo") → accurate but **currently inert**:
  `Clock.scale` is never assigned anywhere, so `time.scale ≡ 1` and pause is done by
  short-circuiting update, not time-scaling. The cautious "flag, don't silently change" framing
  is correct.

## §6 Missing entirely

- **Hitstop / slow-mo juice system** — `Clock.scale` is dead; combat tutorials usually want it.
- **Weapon-selection / routing model** (`M-P0-5a`).
- **Cutscene-runner error handling** (a throwing generator crashes the frame).
- **Reward "no-handler" loud failure** (`M-P1-4b`).
- **SFX preload / warm** (`M-P0-7`).

## §7 Revised "do now" ordering

**Cheap / real / low-risk first:** ~~`U-P0-1`~~ ✅ → ~~the non-allocating `worldToScreen` from
`U-P1-anchor`~~ ✅ → ~~`U-P1-fsm` `stepMachine`~~ ✅ (all three landed 2026-07-12) → **next:**
`M-P1-8` array/Record inspector (highest-value editor unblock, tractable) and the rest of
`U-P1-anchor` (the `entityTopAnchor` helper). Fold `U-P2-impulse` into `M-P0-5b`.
**Re-scope before building:** `M-P0-1` (reconcile container-vs-scene fork with the save gist),
`M-P1-10` (data model + interpreter first), `M-P1-2`/`M-P1-1` (decide save-schema shapes
up-front with the user).
**Defer:** `U-P1-loco`, `U-P2-nav`, `U-P2-ground`, `U-P2-countdown`, and the notice queue / fade
unifications (pending engine/ui).

---

# Appendix B — Removed-plan gists (2026-07-12)

The seven **undated** `docs/plans/*` briefs were deleted as stale (superseded FSM premise,
banned type-bucket paths, memory references, dead cross-refs). Each is preserved here as a
**hole**: the _system_ is still wanted, only the _plan_ was stale. Re-plan from this audit.

- **animation** _(was `animation.md`)_ — [MISSING system] frame-based sprite animation. Locked:
  spritesheet + PNG-iTXt frame metadata; **clips-only v1** (hard cuts, no blending); state→clip
  driven by a **code-defined** `defineMachine` FSM (the old "data-condition graph in the sprite
  editor" is VOID post-FSM-rework); `SpriteComponent.sourceRect` written per tick (one render
  component, static sprites unaffected); **frame-events on the bus** (footstep sfx / hitbox /
  fire). Blending (cross-fade, clip-select trees) and true interpolation parked to skeletal.
- **skeletal** _(was `skeletal.md`)_ — [MISSING system] cutout (paper-doll) skeletal animation
  for **equipment swapping** + dynamically-angled content (the bow aim bone). Locked: rigid
  sprite-per-bone (mesh-deform / IK parked); the **"C" render model** — bake each rig into its
  own **art-resolution** RenderTarget (clean chunky rotation), then composite that RT at
  **sub-pixel** world position (smooth motion); needs one new renderer capability
  `drawTarget(layer, renderTarget, opts)`; bones as data-in-one-component (**no** entity
  hierarchy); equipment maps slot→attachment by id; aim bone overrides one bone's rotation after
  the keyframed pose. Chunked so a rigged character is playable before editor tooling.
- **sprite-editor** _(was `sprite-editor.md`)_ — [MISSING editor tooling] grow the pixel-art
  tool. Locked build order: **selection → drawing toolset → palettes → animation authoring.**
  Selection mask (rect/lasso/magic-wand, add/subtract, move/cut/copy/paste, all ops
  selection-aware); tool-strategy refactor of the flat enum + line/shape/flood-fill/color-replace
  - brush size/custom/mirror; **palette-as-asset** + OKLCH ramp generation + nearest-OKLCH
    palette swap (no indexed mode); animation authoring reuses the generic `<Timeline>`
    (frames/onion-skin/frame-events). The animation-**graph** editor is VOID (code-defined FSM).
    Feeds audit `M-P1-8`, `U-P1-paint`.
- **save** _(was `save.md`)_ — [MISSING system] runtime progress save that **consumes** the
  existing serialization. **Locked: full world-state snapshots incl. the scene stack + a
  "persistent scene"** — this is the concept audit `M-P0-1` forks from (persistent **scene** via
  `serializeWorld` vs the audit's persistent **container** — reconcile). Files via FS-Access (no
  localStorage/IndexedDB for saves); best-effort linear N→N+1 migration + report; tiles
  referenced by content id+version, only runtime-mutated tiles snapshotted; engine
  `SaveManager.capture/restore/migrate` extracted from today's `setSimulating` snapshot/restore;
  game-side checkpoint + auto-save. Distinct from audit `M-P2-3`. _(The brief's file refs are
  dead — `game/fantasy-platformer.ts`, `game/levels/demo.ts` no longer exist.)_
- **prefabs** _(was `prefabs.md`; = audit `M-P1-9`)_ — [MISSING pipeline] promote prefabs to an
  **engine** slice. Locked: data prefab is the core concept (bundles are optional code sugar, no
  bridge); single-inheritance `extends` with field-level merge + cycle detection; instances =
  `{prefab, overrides}` (not baked copies) as the scene entity format; **no** hierarchy
  (multi-entity = spawner wiring by id); engine `registerPrefab`/`resolvePrefab`/`instantiate`
  over `deserializeEntity`; editor `PrefabRef` widget + inline prefab panel + `PrefabDocument` +
  save-as-prefab + per-field revert. `spawnPrefab`→engine `instantiate` is mechanical (the
  serializable registry is global; no game-only registration blocks it).
- **asset-lifecycle** _(was `asset-lifecycle.md`)_ — [MISSING system] real lifecycle for the
  in-game `AssetManager` (editor stays plain React loading). Locked: **reachability keep-set**
  (assets referenced by loaded scenes' content + their spawnable prefabs' `@file` fields + pins),
  recomputed at scene load/unload — NOT a usage refcount; decoupled eviction (clear-point +
  budget LRU); in-game audio buffers routed through the manager; `preload`/`pin`/`unpin`/
  `inspect`/`sizeOf`; **hard dep: the renderer must expose GPU-texture `evict(image)`** to free
  VRAM. Depends on the Scene system (audit `M-P0-1`).
- **profiling** _(was `profiling.md`)_ — [MISSING tooling] per-system CPU + memory profiling.
  Locked: auto loop-hook timing in `ecs.update/render` (zero-cost when detached) +
  `performance.measure` User-Timing bridge for DevTools; memory = `performance.memory` +
  asset-budget + ECS census; engine collects, editor visualizes; playtest overlay via a
  fullscreen **wrapper** (canvas + React debug-overlay portal), since the profiler is debug
  chrome not game UI. `performance.now()` is fine here (the `Date.now` ban is about determinism).
  Soft deps on asset-lifecycle (`sizeOf`) + Scene.
