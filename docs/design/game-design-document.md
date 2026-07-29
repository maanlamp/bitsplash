# Fantasy Platformer: Game Design Document

The top-level design document. It states what the game is and indexes the focused
design documents that own each area in depth.

**Fantasy Platformer is a working title.** It is the name players currently see on
the start screen and in the window title, and it is provisional everywhere it
appears.

This document describes intent. It locks nothing: tests lock behavior, prose does
not, and prose drifting from code is expected. Never generate this file from the
code, never treat a mismatch as a bug to fix. When something here becomes settled
enough to lock, that is a decision to write a test, made deliberately and
separately.

Deliberately short. Focused chapters carry the depth:

| Chapter                                                      | Owns                                           |
| ------------------------------------------------------------ | ---------------------------------------------- |
| [`agency-and-determinism.md`](./agency-and-determinism.md)   | Randomness, saving, reload semantics           |
| [`progression-and-economy.md`](./progression-and-economy.md) | How the player grows, currency, inventory      |
| [`loot-and-combat.md`](./loot-and-combat.md)                 | Item anatomy, rarity, damage types, mitigation |
| [`implemented-today.md`](./implemented-today.md)             | What actually runs in the demo scene right now |

The writing spec holding characters, world, premise, and act structure is kept
outside version control and is not distributed with the repository.

## High concept

A narrative platformer built on fluent, physics-enriched movement, carrying a
story with real consequence and emotional weight.

The story is authored whole. It does not fracture into separate stories per
player: what varies is the route through it. Which parts you meet, in what order,
and from whose account, is decided by how you play rather than by what you pick
from a menu. Two players finish the same story having experienced different games.

## Genre and form

A **narrative platformer**. 2D, side-on, tile-based world with a physics core.
Real-time physics-based combat. Single-player. Desktop, shipped as a standalone
Electron application.

Two commitments are settled and everything else is built on them:

- **Tile-based world:** levels are tile grids, authored in the editor. Collision,
  the decoration pass, and the weather systems all read tile surfaces, so the grid
  is not just an authoring convenience.
- **A physics core:** movement, combat impact, and projectiles are physically
  simulated rather than scripted. Physics objects (boxes, barrels) are a
  platforming verb rather than scenery. Moving them opens routes that are
  otherwise inaccessible.

## Pillars

Five statements, each meant to settle an argument when a design choice is
contested.

**Movement stays fluent.** Physics enriches traversal and never fights it. A
mechanic that makes moving feel worse loses, regardless of what else it buys.

**The player chooses by playing.** Agency is expressed through action and
interpretation, never through a menu of labelled outcomes. Choices have no correct
answer, and the player can defend any of them to another person without feeling
foolish.

**Consequences are delayed, personal, and proportionate.** They arrive later than
the choice, they are felt through characters the player knows rather than through
statistics, and they are never punitive. The game is not trying to punish anyone;
it is trying to make choices feel real.

**No system punishes the player for playing.** No durability, no ammunition
accounting, no anti-reload design, no arbitrary caps. Where a constraint exists it
is there because it is fun, not because it disciplines.

**Algorithmic first, authored for character.** Where a system can generate
something organic and living, it should. That keeps the world in motion and keeps
scarce authoring time on the things only authoring can do. Authored content sits on
top, where character is the whole point: music, voice, the story beats themselves.
Generate the bed, author the highlights.

## Core loop

**The loop is the game. The story is what the loop is for.**

A story is boring if it isn't attached to a game that's fun on its own terms, so
the fun has to live in the verbs: kill, loot, kill again, jump, double jump, dash,
push, grapple, land a trickshot. Those compound into improvised solutions, and
that compounding is the product. The loop is closed and never stops.

Story is poured over it. It supplies the reason to be somewhere, the flavour of
being there, and the ultimate end the player is moving toward. It is never what
makes the minute-to-minute fun, and it never carries the loop on its own.

The practical consequence: a story beat is a reward for play, not a gate on it.

## Movement

Base verbs: walking, sprinting, sneaking, jumping, edge-climbing.

Equipment upgrades extend traversal rather than multiplying numbers: mid-air
jumps, wall sliding and wall jumping, higher max speed. A grappling hook limited
to physics objects and predefined attachment points is under consideration.

Physics objects are central: blocked routes open by moving them.

## Combat

Real-time and physics-based. Impact carries force; projectiles are affected by
gravity.

Weapon classes: melee (swords, ideally many types) and ranged (bows, ideally many
types). A magic system is parked.

Normal enemies use simple, legible AI that is not meant to be tough. Bosses carry
complex movesets, unique abilities, and deliberately unfair AI. Unique enemies
carry interesting drop tables.

Depth comes from the damage-type and material-mitigation matrix; difficulty comes
from AI quality and resistances rather than a stat arms race. See
[`loot-and-combat.md`](./loot-and-combat.md) and
[`progression-and-economy.md`](./progression-and-economy.md).

## Difficulty

There is no difficulty setting and no scaling. Difficulty is authored into the
world.

What makes a stretch of the game hard is which enemies are placed there and
therefore which AI you face, which platforming puzzles stand in the way, and which
abilities you have unlocked and therefore where you can reach. Nothing multiplies a
number to simulate challenge; number inflation feels like something is happening
while changing nothing about how the game plays.

Because reachability is ability-gated, difficulty is a property of **place**
rather than of progress. A fork off a first-act road can hold a jump that only
becomes clearable much later, and it can be harder than anything on the main path.
This is what keeps authoring non-linear: the world does not have to ramp in the
order the player happens to walk it.

Configurable difficulty was considered and rejected on cost. It only works if
every system can express itself in levels, and any system left flat exposes the
setting as cosmetic. Opt-in assists (slow-motion, extra air-dashes, damage
multipliers) were considered and rejected as a difficulty mechanism, since authored
placement already does that job. Those verbs remain candidates as authored
abilities.

## Narrative

Setting, characters, the inciting atrocity, and the four-act structure live in the
writing spec, which is kept out of version control. Two things belong here instead,
because they are design rather than writing:

- **Choices record perception.** How the player frames an event, chosen from a few
  readings of what they just witnessed, feeds a tracked worldview that shapes which
  dialogue options exist later. They are not menu picks with visible consequences
  attached.
- **The ending is emotional, not mechanical.** The final battle's difficulty,
  composition, and available allies shift with the player's choices, but it is
  always winnable. What changes is who died, who stands beside you, and whether
  you can live with it. There is no game-over.

## Art direction

Pixel art. Tiles are 32px (`engine/tilemap/tile.ts`) and the player stands about
one tile tall. Sampling is `NEAREST` everywhere and there is no anti-aliasing
anywhere in the renderer, ever. That is a base constraint, not a preference.

Two spaces, defined once so later discussions can't drift:

- **Pixel space** is the bare canvas at 1:1, no zoom.
- **Art space** is that same painted grid with the screen scale factor applied.

**Manipulation happens in pixel space and is projected into art space by integer
upscale.** A transform runs against the source canvas through a pixel-art-aware
kernel, and the result scales up by whole multiples, so output lands exactly on the
art grid.

Grid-exact is the default. A free transform, where texels land wherever the maths
puts them, is the exception and needs a reason: it is only correct where staying on
the grid actively harms readability. Organic, low-contrast, moving subjects tolerate
it. Hard edges and thin lines do not.

Re-authoring art per transform is a non-goal. If code can manipulate a sprite,
code manipulates it. No hand-drawn per-angle frames.

The mechanism already exists in one place. `quantizeToTexel(value, zoom)`
(`engine/render/quantize.ts:13`) rounds a world value to a whole screen texel, and
two callers use it: camera placement (`camera-2d-render.ts:47`) and foliage sway,
which snaps its shear displacement so "a pixel-art edge never samples between
texels" (`foliage-sway-component.ts:127`). Sway is grid-aware; its interior rows
still step unevenly across the affine shear, which is fine for an organic subject.

Outstanding against this direction is bow rotation, which passes a continuous
`renderAngle` straight through as a rotated quad with no quantization at all
(`game/combat/bow-render-system.ts:25`). `rotsprite` is the kernel that would fix
it, but it lives in `editor/sprite/`, which the engine may never import, so it needs
relocating into the engine.

Frame budget is not the constraint on any of this; frame time currently sits around
0.2ms. Palettes are deliberately unconstrained.

## Audio direction

The same split as the rest of the art: algorithmic where it makes the world feel
alive, authored where character is the point.

**Ambience is synthesized.** Rain and wind are filtered noise beds generated into
looping buffers at runtime rather than authored files, which is both the right
answer acoustically and the one that doesn't spend authoring hours on a background
texture (`docs/notes/notes-audio.md`). Dynamic weather is the ideal case for this.

**Music and effects are authored,** because character is the whole point and no
algorithm supplies it. The score should leave room for dynamic layering, so
environmental change and game state add or drop layers rather than crossfading
between fixed tracks.

The only authored audio today is six `voice_bank_*.wav` vocal takes. Everything
else waits on the audio-foundations work listed on the roadmap (buses with
duck/suspend, looping handles, per-source filter and pan, world-scoped lifecycle),
and weather ships silent until that lands.

Audio is the one area an agent cannot verify. `notes-audio.md` records "I cannot
audition a `.wav` I author," so any claim about how something _sounds_ is
human-verified by necessity.

## Interface

The player-facing rules that are settled live in `AGENTS.md` because they are
enforced on code: no sliders in player-facing settings, numeric values entered as
raw numbers with explicit units and a live preview where the value is an opaque
coefficient, validation only against the invalid domain rather than arbitrary
clamps, and visible progress on any hold-to-confirm action.

Item inspection is exhaustively legible; combat feedback is felt rather than
spelled out. Both are detailed in [`loot-and-combat.md`](./loot-and-combat.md).

## Undesigned systems that the story already assumes

The early game assumes a reputation system and skills. Neither has a design.
Reputation is also entangled with an open question the roadmap raises, whether
quest-giving NPCs can be killed, so that needs settling first.
