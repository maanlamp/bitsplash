# Conversational dialogue and NPC reactions

- **Type:** feature
- **Date:** 2026-07-28
- **Status:** draft

## Goal

Turn dialogue from a single parchment text box into a conversation: aligned speech
bubbles with portraits and emotion, a readable rewindable history, and legible
choices. Give NPCs the ability to react in the world — barks in real speech
bubbles and emotion icons above the head — driven by authored data rather than a
debug component.

## Context & problem

Dialogue today is one parchment panel at the bottom of the screen showing one
speaker at a time. Two `docs/roadmap.md` notes motivated this plan: dialogue
should be conversational with portraits and aligned bubbles, and the world has no
reaction capability beyond dialogue itself. Both notes have been removed from the
roadmap as part of this planning session, per the roadmap's own rule.

The current implementation blocks both:

- **There is no "message".** `gatherBlock` (`src/engine/dialogue/dialogue-system.ts:306`)
  concatenates every ink line up to the next choice into one string joined by
  spaces, then re-splits by sentence for pagination. Authored line breaks are
  destroyed and `story.currentTags` is never read anywhere in `src/`.
- **Speaker is a latched display string.** `openDialogue` resolves `# speaker:`
  once at open (`src/game/sequence/game-ops.ts:696-707`) and never revisits it, so
  one session shows one name for its whole life. There is no character id.
- **No history exists.** The dialogue entity is destroyed on close and nothing
  captures its content.
- **Choices are illegible and desynced.** Highlight is a `"> "` prefix plus a
  colour swap, and two independent selection paths (`DialogueSystem.handleNavigation`
  and the UI focus system) never push focus to match `selectedOption`.
- **Barks are a cut corner.** `bark-render-system.ts` draws outlined text straight
  into a world layer, bypassing the UI tree entirely.
- **The `!` reaction is a debug hack.** `enemy-brain-system.ts:229` adds a
  `DebugTagComponent("!")` on entering `surprised`.
- **Friendly NPCs cannot notice anything.** `PerceptionComponent` exists only on
  `enemy.prefab.json`, the candidate query requires `HealthComponent`, and the
  sight loop hard-filters to `getReaction(...) === "hostile"`.
- **Overhead labels are broken in two different ways.** Five systems measure sprite
  height via `assetManager.getImage(spriteImageUrl(sprite))`, which cannot load a
  `.bsprite` zip — `debug-tag-system.ts:33`, `bark-render-system.ts:41`,
  `quest-marker-hud-system.ts:53`, `hitsplat-spawn-system.ts:180`,
  `interact-hint-hud-system.ts:84`. Separately, `health-bar-hud-system.ts:51`
  anchors off `rb.halfExtents.y` — a different mechanism with a different bug. Every
  prefab in the repo uses `player.bsprite`.
- **Skip discards content.** `dialogueExecutor.skip` (`game-ops.ts:786-799`)
  destroys the entity and later ops no-op, so their knots never open. Skipping
  `checkpoint-bridge` silently answers "refuse" for the player.

Constraints that bound the solution: engine/editor/game layering; machines are
code-defined while content is data-driven; no magic strings for cross-references;
`serializeWorld` serializes whole, so authored artefacts stay clean by
construction rather than by filtering; no config/variant props on components; and
pre-ship, a broken schema should crash loudly rather than migrate.

## Decision

**Dialogue becomes a persistent conversation panel over speaker-delimited ink
blocks, with a typed character registry as the single source of speaker identity.**

- One bubble per block, where a block ends when the `# speaker:` tag changes, a
  choice appears, or the story runs dry. Lines carrying no `speaker:` tag inherit
  the current speaker.
- A `CharacterId` const tuple with a descriptor record owns display name,
  portrait, font, voice bank and whether the character is the player. Alignment,
  voice and font all read from it — not from `DialogueComponent.source`, which is
  one value per op and therefore cannot describe a multi-speaker block.
- **The character registry is game content, so everything that references a
  `CharacterId` lives in the game layer.** Engine must never import game code, so
  `gatherMessages` stays in engine and returns raw speaker-tag strings; `Message`,
  `ConversationComponent` and the handoff live in `src/game/dialogue/` and are what
  resolve a tag into a validated `CharacterId`.
- A `ConversationComponent` on the **exclusive sequence entity** holds the
  transcript as raw text. That entity survives `SequenceSystem.finish`'s in-place
  reuse for queued sequences, so an `npc-chat` whose ink calls
  `start_cutscene("campfire-stargazer")` is one conversation; it is destroyed when
  the chain drains, taking the transcript with it.
- A bounded window of 2–3 bubbles with pop-in/pop-out, plus a read-only step-back
  cursor over the full transcript. No scroll container: the window is a fixed-size
  flex stack.
- One ordered focus chain over history and choices via the existing
  `focusNeighbors` prop. `DialogueSystem.handleNavigation` is deleted and the UI
  focus system becomes the sole owner of selection.
- Pagination is deleted. A bubble is as tall as its wrapped text; one advance press
  per message, always.
- Skip becomes **fast-forward**: every remaining step runs as if played, with only
  the presentation skipped, halting at a choice or a `waitUntil`.

**Reactions are authored content over an enriched perception, with a code-defined
lifecycle.** NPCs gain typed factions and in-place facing; perception's candidate
query stops requiring `HealthComponent` so NPCs never become damageable; the notice
pass that feeds reactions deliberately bypasses the hostile filter that combat
targeting keeps; a data table maps stimulus to reaction; and a hierarchical machine
owns only the display lifecycle, with the emotion id carried as a field.

**Barks and conversation share one bubble.** Barks move into the UI tree as
world-anchored nodes reusing the same `SpeechBubble`, so the two can never drift.

## Alternatives considered

- **One bubble per ink line.** Rejected: every existing knot is authored as prose
  blocks and would need rewriting, and shorter bubbles are achievable by authoring
  shorter stitches.
- **Scrollable history, or last-N fading to nothing.** Rejected in favour of a
  bounded window with a discrete cursor. Fading to zero is the most-complained-about
  pattern in the research and contradicts a Basic-level accessibility guideline; a
  scroll container is the top engineering risk in comparable postmortems.
- **Rewindable history with ink state snapshots.** Rejected: ink state does not
  capture what externals already did to the world, so correct rewind needs
  save-game-scale machinery. Recorded on the roadmap instead.
- **Ink as cutscene director.** Rejected on a hard fact: ink is linear-with-branches
  and cannot express `parallel`, which is a baseline requirement ("someone walks
  while the camera pans"). It would also re-magic-string every cross-reference.
- **Replacing sequence defs with JSON for editor authoring.** Rejected here: the
  defs are already declarative data, and what blocks the editor is the layer
  boundary, not the format. Published-manifest approach recorded on the roadmap.
- **Keeping `Message` in the engine slice.** Rejected: it carries a `CharacterId`
  and an `EmotionId`, both game content, and engine may never import game code.
- **A new sensing system for reactions.** Rejected per explicit direction to enrich
  existing systems. Note the earlier claim that perception's cone is
  "horizontal-only with no vertical bound" was wrong: `inCone` divides by the full
  2D length, so it is a genuine cone whose *axis* is horizontal.
- **`HealthComponent` on NPCs.** Rejected once it became clear Health was only
  needed to satisfy perception's candidate query. `arrow-system.ts:98-127` has no
  faction check at all and NPCs survive only via a raycast layer whitelist;
  `death-system.ts` destroys with no `Respawn`, which would permanently delete an
  NPC's `DialogueSource`; and `enemiesDead` would silently flip meaning.
- **A new ordered-focus engine mechanism.** Unnecessary: `focusNeighbors` already
  exists, is consulted before geometric scoring, and is used by zero game code.
- **`borderRadius` in `Renderer2D`.** Rejected for placeholder art; a generated
  `.bsprite` carrying its own `slice` insets is cheaper and puts insets in their
  proper home.
- **A pooled node set for barks.** Rejected: barks are entity-keyed and low-churn,
  so dynamic reconciliation is fine. Pooling was only needed because of a
  measurement problem, which is solved by passing text as props instead.
- **Force-satisfying `waitUntil` on skip.** Rejected: it would make `enemiesDead` a
  lie, leaving live raiders during a debrief.

## Approach / steps

Dependency order: **B → A → C → D → E → F**. B is first because A's font work and
C's `Message` both need the character registry. A's modal/focus steps that
reference the panel are sequenced into D rather than A, so A carries only
panel-independent repairs. Within B and within A the steps are independent of each
other and can be done in any order or in parallel.

The contract the later streams agree on: a **`Message`** value type (`characterId`,
raw `text`, `emotion`, `kind`) and a **`ConversationComponent`** holding
`Message[]`, a cursor, and the per-visible-slot tweens — all defined in steps C1
and C2, in the **game** layer, before D, E and F consume them.

### Workstream B — character, emotion and faction identity

1. **`src/game/character/character-ids.ts`** — `CHARACTER_IDS` as a `const` tuple
   deriving `CharacterId`. The set is discoverable from current content and is:
   `player`, `bramble`, `pennywhistle`, `quartermaster`, `quickfoot`, `stranger`,
   `critter`, `raider`. `# speaker: You` maps to `player`, which C3 depends on
   existing.
2. **`src/game/character/emotion-ids.ts`** — `EMOTION_IDS` deriving `EmotionId`.
   It lives in the character slice because the dialogue portrait is its first
   consumer; the reaction slice imports it.
3. **`src/game/character/character-descriptor.ts`** — `CharacterDescriptor`
   (`displayName`, `portrait`, `font: FontSettings`, `voiceBank`, `isPlayer`) plus
   `CHARACTERS: Record<CharacterId, CharacterDescriptor>` and a throwing
   `characterById()`. Display name and id deliberately diverge: `stranger` displays
   as "Stranger" by design, `pennywhistle` as "Sergeant Pennywhistle".
4. **Make the descriptor's content references type-safe.** `portrait` and
   `voiceBank` would otherwise be bare strings naming a `.bsprite` tag and a voice
   bank — exactly the "content TypeScript cannot see on its own" case the
   no-magic-strings rule covers. Emit a branded accessor module for `.bsprite` tag
   names and voice-bank ids from the assets themselves, in the same
   codegen-and-throw shape as `knots.gen.ts`, and wire it into `bun run gen`. A
   dangling portrait tag must fail at build, not render as a wrong crop.
5. **Migrate the 10 ink files** from prose display names to ids: `# speaker: Bramble`
   becomes `# speaker: bramble`, `# speaker: Sergeant Pennywhistle` becomes
   `# speaker: pennywhistle`, `# speaker: You` becomes `# speaker: player`. Files:
   `ambush`, `campfire`, `checkpoint`, `critter`, `main`, `pickup-tutor`,
   `quest-giver`, `signpost`, `speed-test`, `trap` — 29 `# speaker:` tags in total,
   all currently literal (none use `{var}`).
6. **Author the `# emotion:` tags.** Nothing writes them today, so without this step
   `Message.emotion` is dead by construction and the promised per-block emotion
   cannot appear. Add emotion tags across the migrated ink alongside the speaker
   tags, at minimum covering the campfire, checkpoint and ambush conversations.
7. **Strip the 18 `# font:` tags** across `campfire`, `checkpoint`, `ambush`,
   `pickup-tutor`, `quest-giver` and `speed-test`. Font now comes from the
   descriptor, so leaving them would create a tag that looks authored and does
   nothing. `gen-ink` rejects a `font:` tag from then on, so a later one fails at
   build rather than being silently ignored.
8. **Register the real fonts.** `ink-fonts.ts` registers only `default`, so
   `cartridge`, `comicoro` and `doublehomicide` are currently swallowed despite the
   `.font.zip` files existing — every shipped line renders in `default` today, and
   this step changes how all of them look. Register all of them behind the
   descriptor. An unknown font id fails at `bun run gen`, not at runtime
   mid-conversation.
9. **Delete the `params.speaker` override.** `builder.ts:112` → `game-ops.ts:703`
   is a `??`-first unvalidated TS string that outranks the validated tag and is
   invisible to codegen. No sequence def sets it, so nothing breaks.
10. **Teach `gen-ink.ts` to see tags.** `walkKnots` (`:82-101`) reads `namedContent`
    exactly two levels deep, and compiled tags live in content arrays at arbitrary
    depth — inside `start`, inside `grp`, inside `c-0`. `TagsForContentAtPath` is
    also unusable: it returns a knot-level tag for the knot path and `null` for the
    stitch path, and inverts when the tag moves. Add a recursive walk of the
    compiled root arrays collecting `"#"`…`"/#"` runs, then:
    - validate every `speaker:` value against `CHARACTER_IDS` and every `emotion:`
      value against `EMOTION_IDS`, throwing with the knot and stitch named;
    - reject `font:` tags (step B7) and **reject dynamic tags outright** —
      `# speaker: {who}` compiles to
      `"#","^speaker: ","ev",{"VAR?":"who"},"out","/ev","/#"` and cannot be
      validated statically, so allowing it would make "fails at build" a false
      claim;
    - generalise the hardcoded `knot.name === "pickup_tutor"` branch (`:132`) into a
      declarative "this knot must have a stitch per member of this const tuple"
      rule, rather than adding a second special case for reactions.
11. **Make `start_cutscene` fail loudly.** `ink-bindings.ts:53-56` silently no-ops on
    an unknown id, contrary to the loud-failure bar — and the conversation boundary
    depends on that call chaining correctly.
12. **Typed factions.** `src/game/faction/faction-ids.ts` with a `FACTION_IDS` const
    tuple deriving `FactionId`, containing `player`, `margrave`, `neutral` (the
    current `FactionComponent` constructor default) and `folk` (the new NPC
    faction). `FactionComponent.faction` adopts it. Nothing needs adding to
    `FACTION_PAIRS`: `getReaction` returns `"neutral"` for any undefined pair
    (`reaction.ts:22`) and the only entry is `margrave → player: hostile`. Make the
    table's **one-directionality explicit** in its own docs — `player → margrave` is
    `"neutral"` today — and note symmetry is currently inert because the player
    prefab has `Bow` but no `Melee`, so `melee-system.ts` only ever runs for
    enemies.

### Workstream A — UI framework repairs

Defects, not scope creep; the panel cannot be built correctly on top of them. All
are panel-independent — the `setModal` and focus-entry work that needs the panel
lives in D.

1. **Clear focus on unmount.** `host-config.ts:253-256` detaches a node and frees
   its yoga node, but `src/engine/ui/layout/yoga-bridge.ts:25-40` leaves
   `layoutRect` populated and nothing tells `FocusNav` (note there is a second,
   unrelated 8-line `yoga-bridge.ts` under `reconciler/`). `focus-nav.ts:140` never
   resets `focused`, so `dispatchConfirmCancel` silently dies (`buildPath` returns
   `[]` for a detached node) *and consumes nothing*. **Re-resolve rather than clear**:
   move focus to the nearest remaining chain neighbour so the player never loses
   their cursor mid-conversation. This already bites the pause menu today.
2. **Evict `DynStore` entries on unmount.** `dyn-store.ts:58`'s `clear(id)` has zero
   callers, so every remounted node leaks an entry for the session. Call it from
   the same removal path as step A1.
3. **Serialize `Tween.elapsed`** (`tween.ts:26`). Without it every retained bubble
   replays its pop-in on load; `DialogueComponent.slide` already has this bug.
4. **Push consume tokens on the left-stick focus path.** `input-normalizer.ts:197-212`
   sets `held` without touching `sources`, unlike the key path at `:182-195`, so
   stick-driven focus navigation leaks unmasked into gameplay through
   `masked-input.ts`.
5. **Add `flipX` to `ImageProps`** (`ui-elements.ts:55-62`) and forward it in
   `ui-render-system.ts:275`. `Renderer2D.drawImage` already supports it. Note
   `image` nodes have no measure function (`measure-text.ts:126`), so `Portrait`
   must carry explicit width/height in style or it lays out 0×0.
6. **Honour `dyn.offsetX/offsetY` in the `worldLayer` branch.**
   `ui-render-system.ts:125-139` computes `offsetX = worldX - rect.x` and reads dyn
   offsets only in the `else` branch, so `worldX` positions a node's *top-left*.
   Both existing world-anchored HUDs hide this with hardcoded constants against
   fixed sizes; a wrapping bubble has no such constant.
   ⚠ Checkpoint: unverified until built — a bark's `layoutRect.w` is 0 on its first
   frame, so centring from last frame's width pops the bubble left then snaps it.
   Gate painting on a measured non-zero width (the branch already early-returns
   when `worldX`/`worldY` are unset, so extend that guard). If the one-frame delay
   is visible, fall back to measuring the bubble in a hidden pass before revealing
   it.

### Workstream C — conversation model and fast-forward

1. **`src/game/dialogue/message.ts`** — `Message` value type, `@serializable("Message")`,
   fields `characterId: CharacterId`, `text` (raw string), `emotion: EmotionId | null`,
   `kind` (`"speech" | "narration"`). **Game layer**, because it references game
   content ids. Raw text, **not** `RichLine[]`: `ensurePages` bails when the font is
   unresolved (`dialogue-system.ts:344-347`), so a pre-wrapped transcript would be
   blocked on font load during fast-forward. Wrapping happens lazily for the 2–3
   visible bubbles. This also drops the currently-serialized `pages: RichLine[][]`,
   making saves smaller and font-swap-proof.
2. **`src/game/dialogue/conversation-component.ts`** — `ConversationComponent`
   holding `messages: Message[]`, `cursor: number`, and `slotTweens: Tween[]` — one
   per visible window slot, which is where D6's pop animations and D11's
   capture/restore assertion live. Attached to the exclusive sequence entity so it
   lives and dies with the chain. Note `SequenceSystem.finish` sets
   `component.sequenceClass = nextDef.class` (`:193`), so assert that a queued def
   is always exclusive (ambient defs never enter `queue`, `:62-64`) rather than
   relying on it.
3. **`src/engine/dialogue/gather-messages.ts`** — `gatherMessages(story, currentSpeaker)`
   replacing `gatherBlock`, returning **raw speaker-tag strings** so the engine
   never sees a `CharacterId`. Iterate `Continue()` per line, read
   `story.currentTags`, start a new block when a `speaker:` tag differs from the
   current one, and carry the current speaker forward when a line has **no
   `speaker:` tag** — not when it has no tags at all. That distinction is
   load-bearing: after `ChooseChoiceIndex`, an unbracketed choice such as
   `checkpoint.ink:13` echoes `"You slide a fat purse across the plank."` with
   `currentTags = ["id: bribe"]` — tags present, no speaker. The game-layer caller
   resolves tags to `CharacterId`s and attributes the echoed line to `player` with
   `kind: "narration"`. Both bracketed (suppressed) and unbracketed (echoed) choice
   forms exist in shipped ink, which D9 depends on.
4. **Delete pagination.** From `DialogueComponent`: `pages`, `paginated`,
   `pageIndex`, `pausesByPage`, `speedsByPage`, and `rehydratePages` on the system.
   From `DialogueSnapshot`: `more` (`dialogue-hud-state.ts:14, :40, :73`), rendered
   at `dialogue-hud.tsx:101`. Non-test readers that must change:
   `dialogue-hud-sync-system.ts:46` (`state.pageIndex >= state.pages.length - 1`)
   and `:65` (`state.pages[state.pageIndex]`). Nothing under `test/` references any
   of them; `dialogue-choice-capture.test.ts:75-84` injects
   `choices`/`choiceTags`/`selectedOption` directly. `DialogueComponent` keeps
   `source`, `font`, `text`, `revealed`, `choices`, `choiceTags`, `selectedOption`,
   `opened`, `phase` and `slide` serialized — C9 depends on the last four. Lift
   `paginate`, `computePauses`, `pageChars` and `pageSpeeds` out of
   `dialogue-system.ts` into a shared module; the wrap they perform is still needed
   for the visible window, just not for paging. `revealed` applies to the newest
   message only; retained bubbles carry no dyn `reveal` entry, which defaults to
   `+Infinity`.
5. **Fix quest external ordering before touching skip.** `start_quest` /
   `advance_quest` / `decline_quest` emit events (`ink-bindings.ts:26-45`) that
   `QuestSystem` reads at `compositions.ts:127`, *before* `SequenceSystem` at
   `:129`, with events cleared at frame end. This works today only because
   `openDialogue` calls `ChoosePathString` but never `Continue`, so externals
   actually fire later inside `gatherBlock` at `dialogue-system.ts:313` (reached
   from `:199`) — upstream of the reader. Fast-forward drives `Continue()` from
   inside the dialogue op, which would silently discard every quest external in a
   fast-forwarded knot. Make the quest externals mutate `QuestComponent` directly,
   as `set_chronicle` already does (`chronicle-ink-external.ts:12`).
   ⚠ Checkpoint: if a direct write turns out to need state `QuestSystem` owns,
   fall back to moving `QuestSystem` after `SequenceSystem` in `compositions.ts`
   and assert the ordering in a test. Either way write the headless test first: a
   fast-forwarded knot's `start_quest` must land.
6. **Make `OpExecutor.skip` able to decline.** `skip` returns `void`
   (`op-registry.ts:29`) and `interpreter.ts:255-259` calls `markDone`
   unconditionally, so halting is currently inexpressible. Change the signature to
   return `boolean` and `markDone` only on `true`. The `seq` loop already
   propagates incompleteness (`:220-223`), and `parallel`/`branch` already handle
   the false path. **Seventeen implementations must change**, all currently
   returning `void`: `engine-ops.ts` at `:46`, `:129`, `:207`, `:240`, `:253`;
   `game-ops.ts` at `:230`, `:355`, `:486`, `:542`, `:557`, `:582`, `:636`, `:786`;
   the custom op in `pickup-tour-sequence.ts:94`; and three in
   `test/support/sequence-scene.ts` at `:71`, `:90`, `:107`. All but the dialogue
   one return `true` unconditionally.
7. **`waitUntil` halts fast-forward.** Remove the `waitUntil` check from
   `nodeSkippable` (`:195-196`) — that check is *why* `case "waitUntil"` in
   `skipNode` (`:250-254`) is currently unreachable — and have that case return
   `false`. `nodeSkippable` then only guards nothing and is deleted; handlers
   answer for themselves. A never-armed dialogue op reports skippable because it
   cannot know its knot contains choices without opening it, which is unavoidable.
   Consequence worth stating: `seq`/`parallel` compute skippability with
   `children.every(...)` over *all* children whether reached or not (`:181-185`),
   which is why `ambush-drill` is unskippable at every point today and its skip HUD
   never opens.
8. **Fast-forward the dialogue op.** `dialogueExecutor.skip` opens its knot, drives
   `gatherMessages`, appends to the `ConversationComponent`, lets externals fire,
   and returns `true` — or `false` when choices pend. Constraints: do **not** create
   an entity per fast-forwarded op, because `DialogueSystem` is hard-wired to
   `ecs.query(DialogueComponent)[0]` (`:169`) and `ecs.destroy` is deferred to frame
   end (`ecs.ts:112-114`). Call `mirrorInkState` once at the end of the pass or the
   snapshot desyncs.
9. **`src/game/dialogue/dialogue-handoff.ts`** — exports `dialogueHandoff()`, matching
   the repo's function-module naming (`resolve-sprite-draw.ts` → `resolveSpriteDraw`).
   Constructs the `DialogueComponent` for the halting op with `opened = true`,
   `phase = "open"`, text and choices pre-populated, and a **completed** slide tween.
   Without this, `!state.opened` fires (`dialogue-system.ts:189-201`) and
   `gatherBlock` overwrites the fast-forwarded text with `""` on a drained story;
   and a fresh `Tween` has `done() === false`, giving an unwanted 0.3s pop-in. Make
   it the single entry point for both normal open and post-fast-forward handover.
10. **Gate skip input.** `dialogueAdvance` (`platformer-catalog.ts:117-121`) and
    `cutsceneSkip` (`:147-151`) are both `ref(ACTION_IDS.interact)`. `pollSkip` runs
    before any skippability check (`sequence-system.ts:130`), and after a halt the
    player is still holding the key with `skipHeldTime` accumulating — so the
    instant a choice resolves it fires again and blows past the next block. Gate
    `pollSkip` on `currentSkippable`, **and zero `skipHeldTime` whenever a skip
    halts**, so the player must release and re-hold the full `SKIP_HOLD_SECONDS`
    (0.6s, `sequence-system.ts:15`) after every choice or `waitUntil`. Nothing is
    ever skipped by inertia: each halt genuinely returns control, and the player can
    only fast-forward past content they deliberately ask to. Aside:
    `ACTION_IDS.dialogueFastForward`
    (`action-ids.ts:12`) is declared and bound at `:122-126` but read by nothing, so
    it is available if fast-forward should get its own key.
11. **Block interaction while an exclusive sequence exists.**
    `DialogueTriggerSystem:21` gates on `isExclusiveSequenceActive`, which returns
    false while `run.controlReleased` (`sequence-system.ts:97-102`), and
    `ambush-drill-sequence.ts:59` releases control before `waitUntil(enemiesDead)`.
    So pressing E during that window queues `npc-chat` onto the ambush's own entity
    and the chat opens minutes later. Gate on `isExclusiveSequenceRunning`
    (`sequence-system.ts:93-95`), which already exists and does exactly this.
    **Apply the same gate to `InteractHintHudSystem:49` and
    `InteractOutlineRenderSystem:16`**, which both still use the `Active` variant —
    otherwise the player sees an interact outline and a "press E" keycap for an
    action that silently does nothing.
12. **Test: fast-forward parity.** Using `SequenceFixture`, run `checkpoint-bridge`
    played-through and fast-forwarded, and assert identical chronicle, quest and
    blackboard state plus a full transcript. This fails today — skipping currently
    answers "refuse" for the player because `memory.lastChoice` is never set, so
    `blackboardEquals` is false and `branchOutcome` pins false.
    `pickup-tour-sequence.test.ts:107-114` already drives `skipHeld`, so the harness
    needs no extension.

### Workstream D — presentation

All new components live in `src/game/dialogue/`.

1. **Generate the bubble frame.** `scripts/gen-bubble-sprite.ts` writes
   `src/game/content/assets/bubble.bsprite` — a pixelated rounded rect, black fill,
   white border — with `slice` insets in its manifest, using the project's own
   `encodePng` (`src/editor/sprite/png-codec.ts`, a pure `fflate`-based encoder with
   no DOM dependency) and `zipSync`. A build script is neither editor nor game, so
   this import is consistent with the layer rules and with `gen-ink.ts:5` importing
   game code. Assert single-frame at bake: `drawNineSlice` measures insets against
   `sourceWidth(image)` (`nine-slice.ts:123`), which for a `.bsprite` is the whole
   composed sheet, so slicing is correct only while `frames.length === 1`.
2. **Portrait art.** `player.bsprite` currently has 32 frames (0–31) on a 55×55
   canvas. Append one frame — a debug zoomed idle-0 head — and give it its own
   one-frame tag so it is addressed by name, not index. **Append at the end only**:
   `attachments.grip` is keyed by absolute frame index `"0"`…`"31"`, so inserting
   elsewhere reindexes every later frame and misaligns the bow (`grip-offset.ts`).
   The frame **must fit the existing 55×55 canvas** — `manifest.width/height` is
   per-sprite, so growing it would re-bake all 33 frames, shift every
   `contentRects` entry and every attachment point, re-export every layer PNG, and
   take the composed sheet from 32×55×55 ≈ 96.8k pixels to 33×110×110 ≈ 399k.
   Since `player.bsprite` is the only humanoid asset, this one tag is shared by
   every character; the descriptor references it through B4's branded accessor, so
   per-character art later is a descriptor edit.
3. **Leaf components.** `speech-bubble.tsx`, `portrait.tsx`, `speaker-label.tsx`,
   plus `bubble-tail-side.tsx` and `bubble-tail-down.tsx` — two concrete tail
   components rather than one with a direction prop, since props-as-configuration
   is disallowed. The tail is a **sibling node**, not baked into the 9-slice:
   `bands()` stretches the bottom-centre band across the full destination width
   (`nine-slice.ts:36-63`), so a baked tail smears. `SpeakerLabel` gets its own
   backing so it is legible outside the bubble.
4. **Resolve the text-node dilemma.** `<Text>` measures wrapped but paints the raw
   unwrapped string in one `drawText` call (`ui-render-system.ts:328`); `<GlyphText>`
   paints per-glyph correctly but its measure function ignores the width constraint
   entirely (`measure-text.ts:113-125`). Neither is complete alone. `SpeechBubble`
   takes pre-wrapped `RichLine[]` produced at a **maximum** wrap width, then sets
   its explicit width from the longest wrapped line's measured width — so a bubble
   still shrinks to fit short text rather than every bubble being one fixed width.
   Typewriter reveal stays on `dyn.reveal` for the newest message's glyph node only.
5. **Composites.** `npc-message.tsx`, `player-message.tsx`, `choice-option.tsx`,
   `conversation-panel.tsx`. Arrangement lives in the composite — portrait on the
   outer edge, label above the bubble, bubble inboard. **No layout or variant
   props**: changing arrangement means rewriting a composite. Which composite a
   message uses comes from `characterById(message.characterId).isPlayer`; the
   composites themselves are what encode left versus right.
6. **The window and cursor.** Render the 2–3 messages around
   `ConversationComponent.cursor`, driving pop-in/pop-out from `slotTweens` (C2).
   Prefer unmounting over clipping: `walkFocusables` has no clip awareness
   (`node-tree.ts:87-94`) while hit-testing does (`pointer-router.ts:17-19`), and
   `edgesOf` reads the yoga `layoutRect` rather than the dyn offset
   (`focus-nav.ts:22-33`), so a clipped window leaks focus to off-screen nodes
   scored at unshifted positions. With A1 re-resolving focus on unmount, unmounting
   is the safe branch.
7. **Ordered focus chain and panel focus entry.** Wire `focusNeighbors`
   (`ui-elements.ts:32`, `element-props.ts:24`) across message and choice nodes so
   up from the topmost choice enters history and down from the newest message
   re-enters the choices. It is consulted before geometric scoring
   (`focus-nav.ts:169-176`), so the scorer's `euclidean + dy + 2*dx − overlap` —
   which would otherwise skip the adjacent opposite-aligned bubble in favour of a
   same-aligned one two rows up — never runs here, and existing menus are
   untouched. Adopt `dispatcher.setModal` (`event-dispatcher.ts:72-79`, called
   nowhere in `src/game` today) for the panel: it is the only route to
   `FocusNav.setTrap`, it scopes the chain, and it fixes the pause-menu-to-dialogue
   focus leak caused by `focus-nav.ts:198` falling back to all candidates.
   **Initial focus goes to the first choice**, not the oldest history bubble, so the
   player's first up-press walks into history rather than out of it.
8. **Make the dialogue overlay pointer-transparent, and re-opt choices in.**
   `PointerRouter.hitTest` treats `undefined` as opaque (`pointer-router.ts:20-25`),
   so a full-screen `Overlay` consumes all five mouse tokens plus wheel whenever
   dialogue is open (`event-dispatcher.ts:105-110`), killing mouse-right `interact`
   / `dialogueAdvance` / `cutsceneSkip`. Set `pointerEvents: "none"` on the overlay
   — but `pointerEvents` inherits down the tree, so `ChoiceOption` must declare
   `"auto"` explicitly or mouse-clicking a choice stops working, which it does
   today (`dialogue-hud.tsx:46-47`).
9. **Chosen choices in the log.** For an unbracketed choice, C3's echoed line *is*
   the record — do not add a second entry. For a bracketed choice, where ink
   suppresses the echo, append the choice text as a `player` / `kind: "narration"`
   message so the decision is still visible. Unchosen options drop.
10. **Scope `W`/`S` to focus navigation, and retire the dead actions.**
    `DIRECTION_KEYS` (`input-normalizer.ts:27-32`) knows only arrows and dpad, and
    arrows are already consumed before the action layer — so `W`/`S` are the *only*
    keys reaching `handleNavigation` today, and deleting it kills them. Emit
    `focusmove` for `W`/`S` only while the panel's modal trap is active (D7), so
    they don't strip `moveUp`/`moveDown` from gameplay globally. Then delete
    `ACTION_IDS.dialogueNavUp`/`dialogueNavDown`, their catalog bindings and their
    `dialogue-bindings.ts:20-22` predicates, or `W`/`S` end up double-bound.
11. **Delete `DialogueSystem.handleNavigation`** (`:379`) and its
    `navUpHeld`/`navDownHeld` latches. `advancePressed` paths are untouched, so
    typewriter skip, close and `skippable` all keep working. Make
    `DialogueHudDynSystem` per-message instead of targeting one hardcoded
    `DIALOGUE_GLYPHS_ID`, and replace its per-frame full-tree `findById` DFS with a
    single walk.
12. **Retire parchment.** Delete `ink-panels.ts`, `DialoguePanelComponent` (never
    `@serializable`, so the panel vanished after a mid-dialogue save/load anyway),
    its references at `game-ops.ts:37, :39, :693, :710` and
    `dialogue-hud-sync-system.ts:13, :45`, the `panel`/`insets` fields on
    `DialogueSnapshot`, the panel rendering in `dialogue-hud.tsx`, and
    `parchment.9slice.png`. There are zero `# panel:` tags in content, so
    `panelForTag` is already only reachable via `knotTags`. Leave the world
    undimmed.
13. **Advance hint in the bottom-right hint row.** Deleting pagination removes
    `more`, which is the only thing that renders the advance keycap today
    (`dialogue-hud.tsx:101`, gated on `snap.more`). Replace it with a `KeyCap`
    that is **visible for as long as the panel is open**, placed in a row
    bottom-right alongside `SkipHint` — which already anchors there
    (`skip-hint.tsx:30-39`) — rather than inside the panel. The panel therefore
    carries no chrome of its own. A stable always-present hint costs nothing in
    attention once learned, where a hint that appears on every reveal-complete
    would flicker throughout an exchange. It does show during reveal, when the
    button skips the typewriter rather than advancing; that is accepted.
14. **Test: window and cursor state.** Headless `SequenceFixture` run through
    `campfire-stargazer`, stepping the cursor to the first message and back, with a
    `capture → restore → continue` in the middle asserting transcript, cursor and
    slot-tween state survive.

### Workstream E — barks and overhead anchoring

1. **`src/engine/sprite/entity-top.ts`** — one `entityTop(ecs, assetManager, id, gap)`
   helper over `resolveSpriteDraw`. `SpriteRenderSystem` centres the resolved
   content rect on `transform.position` (`sprite-render-system.ts:25-33`), so
   `y - (source.height * scale.y) / 2 - gap` is exactly the top of the art. Route
   the five `getImage` sites through it — `bark-render-system.ts:41`,
   `debug-tag-system.ts:33` (which uses **full** height where the others use half,
   and already falls back to `phys.halfExtents.y` at `:41`, so fixing it blindly
   doubles the offset), `quest-marker-hud-system.ts:53`,
   `hitsplat-spawn-system.ts:180`, `interact-hint-hud-system.ts:84` — plus
   `health-bar-hud-system.ts:48-52`, which is a different mechanism
   (`rb.halfExtents.y`) with the same wrong-anchor outcome. Also fix
   `editor/pick.ts:66`; leave `:148` alone, since it is a `!getImage(...)` *loading*
   test rather than a top computation and needs its own `.bsprite`-aware check, not
   `entityTop`. Anchoring is to the **per-tag** content rect, accepting a ±2.5px bob
   as tags change (`player.bsprite`: idle h33, run h31, fall/jump h36). Clearance is
   the tallest-pose content height plus a fixed gap, not implementer discretion.
   ⚠ Checkpoint: health bars currently sit at `halfExtents.y * -2 - 4` = **-36** for
   the player, while a content-rect anchor lands near **-20.5** — roughly 15px
   lower, overlapping the head. Verify by running `bun run dev` and reading logged
   anchor values, since it is a framing judgement. If tallest-pose clearance still
   cannot keep the bar clear of the head, fall back to keeping physics-extent
   anchoring for health bars alone and route only the five sprite-anchored sites
   through the helper. Note the health-bar query also requires
   `PhysicsBodyComponent` and `rb.body`, which stays unless that query changes too.
2. **Barks into the UI tree.** Add `bark-hud.tsx`, `bark-hud-state.ts` and
   `bark-hud-system.ts` under `src/game/dialogue/`, following `QuestMarkers`'
   dynamic reconciliation — one node per barking entity, no pool. Delete
   `bark-render-system.ts`. **Text goes in React props, not `dyn`**:
   `DynValues.text` is read by `paintText` (`ui-render-system.ts:304`) but the
   measure function reads `props.children` (`measure-text.ts:134`), so dyn-driven
   text yields a stale `layoutRect` and a zero-width 9-slice frame with text
   spilling out. Bark text is immutable for the component's lifetime (written once
   at `game-ops.ts:626-630`; `BarkSystem` only ticks `elapsed`), so a store keyed by
   (entity, text) reconciles only on add and remove. Note `paintText`'s
   `node.props.text` branch is dead — `TextProps` has no `text` field.
3. **Bark bubbles reuse `SpeechBubble`** with `BubbleTailDown` pointing at the
   speaker. World-anchored nodes land in a world layer and so scale with camera
   zoom, while the panel is in UI pixels; these read at the same apparent size today
   only because `spawn-camera-2d.ts:52` uses zoom 3 and `demo.scene.json:10` uses
   `uiScale: 3`. Derive the bark bubble's scale from the ratio of the two rather
   than relying on the coincidence, so the two bubble styles stay matched if either
   constant changes.
4. **Test: bark bubble sizing.** Assert a bark node's measured `layoutRect` is
   non-zero and wraps at the expected width for a long string, which is the failure
   the props-vs-dyn decision exists to prevent.

### Workstream F — NPC reactions

The slice is `src/game/reaction/`. Note `src/game/faction/reaction.ts` already
exports `type Reaction` and `getReaction` for faction stances; to keep two
vocabularies from colliding, this slice's types are named `ReactionDef`,
`ReactionId` and `StimulusId` throughout, with no bare `Reaction`.

1. **`NpcTagComponent`.** Six prefabs already declare `"NpcTag": {}` and
   `deserialize.ts:31-39` silently drops unknown names under the `"skip"` policy, so
   registering it changes nothing on disk — `demo.scene.json` holds NPCs as
   `SpawnPoint` entities and contains no `NpcTag`.
2. **Perception's candidate query drops `HealthComponent`.**
   `perception-system.ts:64-68` requires `Health + Faction + Transform`, using
   Health as a proxy for "is a creature". Require `Faction + Transform` instead so
   NPCs become perceivable with a faction alone and never gain Health.
3. **A notice pass that bypasses the hostile filter.** **Keep the filter at `:72`
   for combat targeting** — removing it makes `margrave → margrave` neutral pairs
   into targets, so two enemies latch onto each other, reach `attack`, and never
   acquire the player, with `stimuli()` running after `sight()` so being shot cannot
   rescue it. But the filter is also why reactions would otherwise have no trigger:
   `getReaction(npc, player)` is `"neutral"` for the new `folk` faction, so an NPC
   perceiver would skip the player entirely and the whole feature would ship inert.
   Add a second pass over the same visible candidates that records *noticed*
   entities on `PerceptionComponent` separately from `targetId`, with no stance
   filter. Combat targeting is untouched; reactions read the noticed set. Note
   `stimuli()` keeps its own hostile filter at `:233` and additionally requires the
   damage source to carry Health (`:236`) — the notice pass must not depend on
   either.
   ⚠ Checkpoint: cost is bounded but real — every NPC becomes a `perceive()`
   candidate for every enemy (up to 3 sample points plus raycasts), and `ecs.query`
   materialises a fresh array per call *inside* the perceiver loop. Measure frame
   time with the demo scene's 7 NPCs before and after; if it regresses by more than
   a frame at 60fps, hoist the candidate query out of the loop before optimising
   anything else.
4. **In-place scanning.** `src/game/npc/npc-scan-def.ts` and `npc-scan-system.ts`:
   a machine writing `intent.faceX` on a dwell timer. `facing-system.ts:13-18`
   reads `faceX ?? moveX` and clears `faceX` every frame, and no system writes it
   for NPCs, so their cone is pinned right forever. `NpcAnimationSystem` derives its
   animation from `Math.sign(intent.moveX)` (`npc-animation-system.ts:30`), so a
   `faceX`-only scan will not spuriously trigger run animations. **Suppress scanning
   while the NPC is in a conversation**: `dialogue-trigger-system.ts:60` writes
   `faceX` exactly once, on the frame the `InteractEvent` is read, so an ungated
   scan wins every subsequent frame and turns the NPC away mid-conversation.
5. **Reaction content.** `reaction-ids.ts` (`REACTION_IDS` deriving `ReactionId`,
   `STIMULUS_IDS` deriving `StimulusId`), `reaction-def.ts` (`ReactionDef`),
   `loader.ts` (`import.meta.glob` plus the try/catch `quest/loader.ts` uses for
   `bun test`), and authored tables under `src/game/content/reactions/`. Unlike
   `getQuest`, which returns `null` on a miss, **validate at load and throw**: every
   referenced emotion id, bark knot and stimulus id must resolve.
6. **Bark knots via codegen.** Extend B10's generalised rule to emit
   `Reactions.line: Record<ReactionId, Knot>`, throwing at `bun run gen` when a
   stitch is missing. Constraints: `emitNamespace` walks one level of `namedContent`,
   so all reaction bark stitches must be stitches of a single knot, and
   `RESERVED_MEMBERS = {root, line}` throws on a stitch named `line`.
7. **Lifecycle machine.** `reaction-lifecycle-def.ts` — a hierarchical
   `defineMachine` over phases (`idle` versus `reacting { entering, holding, exiting }`),
   with the emotion id as a **field** on `ReactionComponent`, not a state name. The
   vocabulary stays data; only the phases are code. Beware `entered` includes
   super-state names — `enemyBrainMachine`'s `surprised → chase` yields
   `["combat", "chase"]`.
8. **Arbitration system.** `reaction-system.ts` picks the highest-priority eligible
   reaction respecting cooldowns, steps the machine, and performs side effects on
   `entered`/`exited`. Replace the `DebugTagComponent("!")` hack at
   `enemy-brain-system.ts:229` with a real reaction.
9. **Emotion display in both places.** A world-anchored icon HUD
   (`emotion-icon-hud.tsx` and friends in the reaction slice) using `entityTop` from
   E1, and the same `EmotionId` overlaid on the dialogue portrait. Address icon
   cells through a `Record<EmotionId, IconCell>` in the reaction slice so a missing
   emotion fails at `tsc`, rather than through bare atlas indices — note
   `input-icon-atlas.ts`'s `iconCell(index: number)` takes a raw index and is a
   precedent for the *cell maths*, not for type safety.
10. **Test: reaction round-trip.** `bark.test.ts` is the template — drive a stimulus,
    assert the reaction fires once with the right emotion, respects its cooldown,
    and survives `capture → restore` mid-lifetime.

### Workstream G — roadmap (done)

Completed during this planning session: the two source notes removed, the
sequence-editor note rewritten with the layer-boundary diagnosis and the
`gen-sequences` published-manifest direction, and four notes added — retiring
`releaseControl`/`lockControl` into the quest layer, enemies never retaliating to
arrows, conversation time travel, and whether "essential" NPCs can be killed.

## Research findings that drove this

- **Nothing ships the target combination** of screen-anchored left/right bubbles,
  portraits for both speakers, and history. Prior art splits into diegetic chat
  apps, world-anchored bubbles, and scrolling logs, each dropping one piece.
- **Every world-anchored bubble game deliberately substituted something for
  portraits** — Night in the Woods uses sprite animation, Wandersong and Pentiment
  per-character fonts, Chicory fonts and bubble colours — because the tether
  already carries identity and a portrait competes for the same space. Combining
  them is genuinely untested, which is why the plan keeps portrait, label and bubble
  as independent composable leaves.
- **World-anchoring cost Oxenfree its camera** — tethering forced them to pull back,
  and line length became bounded by level geometry. That argues for a screen-space
  panel in a platformer with a tight vertical camera, with barks as the only
  world-anchored bubbles.
- **Fade-by-age is the most-complained-about pattern in the corpus** and contradicts
  a Basic-level accessibility guideline; disabled players specifically reported text
  vanishing before they could read it. The bounded window plus a discrete cursor
  keeps recency cues without information loss.
- **The scroll container is the top engineering risk** in comparable postmortems:
  Failbetter named smooth transitioning of large text volumes as their hard problem,
  Bury Me My Love shipped with jitter and stacked text, and Disco Elysium's
  large-text setting broke scrolling outright. Avoiding it entirely is a deliberate
  win.
- **Ingold's measured finding** — three or four paragraphs before the next choice
  caused significant tail-off in reading — is why bubbles size to their text and
  short authoring is the intended discipline rather than a runtime cap.
- **Lifeline's frozen inline choice rows** are the pattern that composes with a log,
  which is why chosen choices stay as narration messages.
- **Codebase precedent**: `focusNeighbors` already exists and is unused;
  `QuestMarkers` proves dynamic world-anchored reconciliation; `kbd.bsprite` proves
  manifest-carried 9-slice insets; `gen-ink.ts`'s `PICKUP_TYPES` import proves
  build-time cross-content validation; `MeleeComponent` is the cleanest
  component-owns-`MachineState` template; and `SequenceFixture` already does
  `step → capture → restore → step` with `skipHeld`.
- **An ink spike against the real compiler** established that per-line tags work,
  that a tag above a group attaches only to the group's first line while later lines
  report `[]`, that `Continue()` runs through diverts so one session can span a
  stitch chain, and that multiple tags coexist per line — which is what makes
  speaker-delimited blocks and per-block emotion mechanically free.
