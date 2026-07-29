# Agency & Determinism

A standing design principle, not scoped to any one feature. It governs how
randomness, saving, and player choice work across the whole game.

## Player agency is a first principle

Saving and loading is a fundamental power the player has, and we honour it. If a
player reloads to get a different result, that is **playing the game**, not
cheating. There is no such thing as "save-scumming" in our vocabulary. We never
design mechanics whose purpose is to stop players from playing the way they
like. Anti-agency framing ("prevent the player from…", "punish reloading") is
rejected on sight.

The implication is positive, not restrictive: we do not _need_ to fight the
player, so we are free to build systems that are honest and consistent instead.

## A save is a window into history, not a fork

The world is **deterministic**. A save is a window back into a consistent
timeline, not a fork into a parallel universe where dice are re-thrown. Reload to a
moment, take the same action, and the same thing happens; advance the world
legitimately, and outcomes vary. This is chosen for _feel_, so the world stays
coherent and trustworthy, not to police anyone.

Concretely, for anything random and consequential (loot drops, shop restocks,
and future systems):

- The outcome is a **pure function** of stable, saved inputs, never of hidden
  mutable generator state.
- Reload restores those inputs exactly, so the outcome reproduces.
- Legitimate progression advances a saved counter, so repetition (farming)
  produces variety.

## The primitive: pure hash over a persisted counter

We do **not** use a stateful PRNG for consequential rolls. A stateful generator
would force us to snapshot and restore its internal state, which is fragile and
easy to desync across save/load. Instead:

```
outcome = hash(worldSeed, stableKey, counter[stableKey])
```

- `worldSeed` — per-save, set at new-game.
- `stableKey` — a stable identity (e.g. a victim entity id; a shop id).
- `counter[stableKey]` — a small integer advanced per event, and the _only_
  state we persist.

Because the hash is stateless, "reload = same, advance = different" is true **by
construction**: there is nothing to restore except the counter map, which the
normal save path already round-trips.

### Why entity ids work as stable keys

Respawns in this engine deterministically **reuse** the original entity id (the
death→respawn path threads the dying entity's id back through `spawnPrefab`), and
save/load + scene freeze/thaw preserve live-entity ids. So a per-victim-id counter
is stable across respawn, save, and revisit, which is exactly the anchor the
primitive needs. Fresh ids are minted only on first-ever scene build, which is
correctly "a never-before-seen thing starts at counter 0".

## Streams don't desync

Independent concerns (loot, combat, cosmetic effects) use **separate salts** in
the hash key so that adding or reordering one system can never shift another's
outcomes. This is the counter-based analogue of split RNG streams.

## Scope of determinism

We guarantee reproducible **rolls** (loot, restock, and similar discrete
outcomes), not necessarily a bit-reproducible _simulation_. The physics backend is
not established as cross-run deterministic, so we do not advertise full-run
determinism. Reproducibility is scoped to the discrete decisions the hash governs.
