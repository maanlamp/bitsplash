# What actually runs today

A description of the demo scene and the systems it exercises, written so the
knowledge isn't lost when the game-layer tests are deleted. Most of what follows was
recovered from those tests: somebody worked out what the arrow does to a perception
stimulus, or how a reaction arbitrates, and encoded it in an assertion nobody trusts
any more. The behaviour is worth keeping even though the tests are not.

**This is prose and it locks nothing.** It will drift from the code, and that is
fine. Never generate it from source, never reconcile it as a chore, never treat a
mismatch as a bug. It records what was true and why someone thought so. When a
behaviour here is worth locking, that is a decision to write a test, made
deliberately.

## The scene

`demo.scene.json`: 33 entities, gravity 640 down, `uiScale` 3, a cyan clear colour.
Two tile layers. Seven spawn points that populate on load, plus scenery: twelve
particle emitters, eleven swaying foliage instances, four pickups, four trigger
volumes, two dialogue sources.

## The cast

Seven actors spawn: **player**, **enemy**, **guard**, **companion**,
**quickfoot**, **quest-giver**, **pickup-tutor**. Two more prefabs exist for
sequences to spawn: **critter** and **arrow**.

The player carries `Bow`, `Aim`, `Health`, `HealthBar`, `Respawn`, `Voice` and
`DamageStats`. It has no `Melee`.

The enemy carries `Health`, `HealthBar`, `Respawn`, `EnemyBrain`, `Melee`,
`NavAgent`, `Wander`, `QuestMarker`, `Perception` and `Reaction`. It has no `Bow`.

The five talking NPCs share one shape: `DialogueSource`, `Interactable`, `Voice`,
`NpcScan`, `Perception`, `Reaction`, `Character`, `Locomotion`, `Facing`. **None of
them has `Health`,** so none can be damaged or killed. The critter is the same shape
minus dialogue, plus a `SequenceTag` so sequences can find it.

## Movement and combat

The player's intent comes from the real action pipeline (move left, move right,
jump, jump-hold) plus a gamepad stick with a 0.2 deadzone that overrides the keys
when pushed. An exclusive sequence freezes intent, and clears it on the frame it
freezes so a held key doesn't carry into the cutscene.

The bow aims and draws, and its grip position comes from attachment points authored
into the sprite. Those offsets anchor at the content-rect centre with the y axis
pointing down, scale per axis independently, and mirror exactly about the content
centre when the sprite flips. An arrow is a physics projectile affected by gravity.

Damage flows through `DamageTrigger` and `DamageStats` into health, health bars,
hitsplats and camera shake. Death destroys the entity; `Respawn` brings it back, and
respawn deliberately reuses the original entity id so the determinism primitive has a
stable key.

## Perception

The notice pass applies **no stance filter**. Any perceiver can notice anyone,
including a healthless NPC, and neutral stances on both sides don't prevent it.
Combat targeting is separate and does keep a hostile filter, which is why two enemies
of the same faction never target each other.

Noticing is sticky. Once acquired, a target survives the perceiver turning away as
long as it stays near, and stickiness ends at a notice proximity rather than at the
edge of the vision cone. Proximity alone never notices anything: entry always
requires clear sight. Enemies do acquire the player through intervening NPCs. Notice
changes report each arrival once and each departure once.

## Reactions and barks

Reactions gate on **engagement, not sight**. Walking past an NPC without ever facing
it and without closing distance produces nothing, even though the NPC saw you.
Approaching engages. So does standing still while facing it. Turning around and
walking back to an NPC that already saw you engages; an NPC turning away and back
does not re-fire, because it never lost you. Genuinely leaving and returning reacts
again, with a different line.

A greeting fires once per character, never twice. Arbitration takes the
highest-priority eligible reaction, then the next one down, and once every reaction
for a stimulus is spent or cooling down nothing fires. One stimulus can split by
standing: the same approach makes one character greet you and another size you up,
and a cold standing stays silent. An entity that reacts without naming its character
crashes rather than guessing.

Barks are typeset in the speaker's own font, one bubble per barking entity, scaled by
the ratio of `uiScale` to camera zoom so they read the same at every zoom the
cutscenes use. An emotion icon mounts above the actor for the whole reacting span and
unmounts on idle; a bark's gap grows by exactly the icon's stack height so the two
never overlap.

## Idle NPCs

An idle NPC sweeps its facing on a dwell timer. Scanning stops while the NPC is cast
in an exclusive sequence, a conversation's one-off facing is not overwritten on the
next frame, and a walking NPC is never turned backwards by its own scan.

## Conversation

A conversation keeps a transcript with a step-back cursor. The window shows the
cursor and up to two messages before it, never past it. Bubbles align NPC-left and
player-right, only the newest row carries a portrait, and only the newest pops in
while the rows behind it stay pinned at rest. Text reveals per message with a
typewriter that wraps at the exact width the panel paints at, in the speaker's own
typeface rather than one font for the whole conversation.

Choices record differently by form. A bracketed choice tagged `# narrate` becomes a
player narration row; an untagged bracketed choice leaves no entry but still takes its
branch; an unbracketed choice's echo is recorded as the player speaking it, once, not
doubled. Unchosen options leave no trace.

Focus is an explicitly declared chain rather than geometric scoring. It lands on the
first choice rather than the oldest bubble, walks up into history row by row, and
re-enters the choices coming down. W and S are focus keys only while the trap is up
and are taken off the gameplay action layer for exactly that long. Pressing up on the
oldest row scrolls the transcript instead of losing focus.

## Sequences

Trigger volumes start sequences on walk-in, and a one-shot volume fires once and
stays consumed. An exclusive sequence freezes player intent and takes the camera.
Skipping fast-forwards ops but **halts at a `waitUntil` gate** rather than forcing it,
and a held skip cannot carry past the gate by inertia; satisfying the predicate lets
the skip resume. An op that reports itself unskippable is never skipped however long
the key is held.

Five sequence families ship: `campfire-stargazer` (long linear),
`ambush-drill` (parallel, releases control mid-run), `checkpoint-bridge` (branching,
with bribe and refuse arms), `lost-critter-found` and `lost-critter-home` (ambient,
two-part, sharing chronicle state), and `pickup-tour` with a `pickup-tour-kiss`
follow-on.

Two quests: **massacre** (kill five entities tagged `patrol`) and **pickup_tour**
(collect gear tagged `quest:pickup_tour`).

Ten ink files back all of it, including `campfire`, `checkpoint`, `ambush`,
`critter`, `quest-giver`, `pickup-tutor` and `reactions`.

## Weather and VFX

The scheduler seeds the climate's default preset and rolls a dwell on the first
frame; entering a scene with a different climate rerolls exactly once. Rain collides
against a rain-blocking tile classification rather than against solidity, so a solid
layer marked as letting rain through doesn't stop it, and rain dies into a splash.
Overhangs shelter the columns they cover, with openness falling off smoothly with
depth rather than flipping binary — a cave mouth is more open than the tunnel behind
it. Leaves scale with wind and rain with precipitation, never the reverse.

Foliage sway snaps its displacement to whole screen texels at the camera's zoom, so a
pixel-art edge never samples between texels.

A sequence can override the weather; the override dies with the sequence, including
when the cutscene is skipped, and survives a mid-cutscene save without re-arming.

## Known divergences from what the tests claimed

The most useful thing the old suite left behind. Each of these is a place where a
green test asserted a behaviour that doesn't hold in play.

**Cutscene camera hand-back.** `npc-chat-camera.test.ts` asserted that a cutscene
hands the camera back to the player when it ends, that it does so even when skipped
mid-run, and specifically that "a cutscene queued from a companion chat hands the
camera back after the whole chain." The roadmap records the opposite: dialogue doesn't
return camera control, companion NPC especially. A passing test on the exact case.

**Enemies never retaliate to arrows.** `perception-system.ts` requires the damage
_source_ to carry `HealthComponent`, but `arrow-system.ts` passes the arrow entity as
the source and the arrow prefab has no `Health`. The stimulus is dropped silently, so
enemies only ever acquire targets by sight. Nothing in the suite covered it.

**Melee is enemy-only.** The player prefab has `Bow` but no `Melee`, so
`melee-system.ts` only ever runs for enemies and the faction pairing is inert on the
player's side.

**NPCs are unkillable by construction.** No talking NPC carries `Health`, so the
damage path can't touch them. They survive by absence of a component rather than by
any rule, which means adding `Health` to one would immediately make it killable and
permanently deletable, since `death-system.ts` destroys outright and no NPC prefab
has `Respawn`.

**Stutter while walking.** Recorded on the roadmap, uncovered by anything. No test in
the suite ever measured a frame time.
