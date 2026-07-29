# Audio facts (verified) + the design they force — for W7

## What exists today (`src/engine/audio/audio.ts`, 198 lines, the whole audio engine)

`export default class AudioManager`:

- `get sampleRate(): number` `:51`
- `decode(data: ArrayBuffer): Promise<AudioBuffer>` `:55`
- `load(url: string): Promise<AudioBuffer>` `:59` (promise-deduped by url)
- `playBuffer(buffer, opts?: {offset?, duration?, detune?, gain?, onEnded?}): PlaybackHandle` `:71`
- `play(url, opts?)` `:132` — granular AudioWorklet path, **ZERO callers, first play of any
  url is silent by construction**. Do not build on it.
- `PlaybackHandle = Readonly<{stop(), position(), duration}>` `:21` (exported)

**Blockers, all confirmed:**

- `private ctx = new AudioContext()` `:34` — class _field initializer_, so `new AudioManager()`
  throws before the ctor body if `AudioContext` is missing. Importing the module is safe.
- **`AudioContext`/`AudioBuffer`/`GainNode`/`window` are ALL undefined under Bun.**
- `ctx` is private with **no getter** → any bus/filter/panner work must edit `audio.ts`.
- `playBuffer` never sets `loop`/`loopStart`/`loopEnd`. **Nothing in the codebase loops.**
- Graph is `source -> per-shot GainNode -> ctx.destination` (`:85`, `:155`). No master gain,
  no submix bus, no BiquadFilter, no StereoPanner anywhere in src/ (grep = 0 hits). No
  `ctx.suspend()` call anywhere. Gain is a static ctor value — **no AudioParam ramping**.
- Audit `docs/2026-07-11-architecture-audit.md:367` tracks this as `M-P1-7`.

## Test-harness landmines (any audio touch WILL break these)

- `test/support/sequence-harness.ts:88` `stubService("audio")` (used `:184`) is a **throwing
  Proxy** — `ctx.audio` is safe to hold, but ANY property access on it throws.
- `test/game-composition-boot.test.ts:96-98` and `test/run-contamination.test.ts:180`
  hand-roll `{ load: () => new Promise<never>(() => {}) } as unknown as AudioManager`
  (duplicated, not shared). These boot the real `game` composition.
- => An ambient audio system in a shared composition must reach audio **only** when audio is
  genuinely available, and must decide that WITHOUT touching a property on the service.

## Lifecycle landmines

- `World.dispose()` `world.ts:90-96` disposes physics only. `Runtime.dispose()`
  `runtime/runtime.ts:133-134` forwards to it. `RunHost.stop()` `run-host.ts:181-192`
  disposes runtime + input. `AudioManager` is **host-scoped (`Game.audio`, `game.ts:61`) and
  outlives every world.** A looping source keeps sounding after run-stop / scene swap / quit
  unless the starter stops it.
- `Game.setPaused` `game.ts:94` gates `updateScene` only; render/input/raf keep running.
  A paused game **ticks no systems**, so nothing can ramp audio down from `update()`.
- `UpdateContext.audio` exists (`system.ts:23`); **`RenderContext.audio` does NOT** → weather
  audio must be an `UpdateSystem`.
- Both editor worlds get audio (`run-host.ts:209`, `scene-view.ts:332`) and there is **no
  focus gating anywhere today**.

## DECISIONS these force (deviating from WS-E as written; audio-foundations still owed)

1. **Availability gate is structural, not disciplinary:** a module-level
   `const audioAvailable = typeof AudioContext !== "undefined"`. Under Bun this is false, so
   the system no-ops and never touches `ctx.audio` → the throwing Proxy and both hand-rolled
   stubs stay untouched. No try/catch, no null-object rework of `AudioManager`.
2. **One process-wide ambience graph, not per-world voices.** A module singleton keyed off the
   `AudioManager` instance owns the nodes. Each frame the updating `WeatherAudioSystem` pushes
   parameters into it; **last writer per frame wins**. If nobody pushes for ~150 ms the graph
   ramps itself to silence. This kills three problems at once with no new engine machinery:
   the world-teardown leak (a stale world simply stops pushing), pause (no systems tick →
   ramps to silence, which is WS-E step 19's requirement obtained for free), and multiple
   editor views fighting over one output.
3. **Rain is synthesized, not authored.** There is no rain asset (the only audio content is
   six `voice_bank_*.wav` vocal takes) and I cannot audition a `.wav` I author. Rain and wind
   are both filtered noise beds generated into looping buffers at runtime — which is also what
   Farnell's recipe in the plan actually calls for. No new content files, no `gen-assets.ts`
   prefix rule, no `AssetRef`.
4. **`audio.ts` changes are strictly additive**: a new ambience/loop capability alongside
   `playBuffer`, which is not modified. No rework of the existing graph, no buses — that stays
   owed to the audio-foundations plan.

## Other primitives that turn out to be missing

- **`src/engine/hash.ts` is 16 lines, one export**: `hashCell(x, y, salt): uint32` `:6`, whose
  docstring says _"Keyed by position only — stable across frames, never time-based."_
  There is **no 1-D hash, no value noise, no fbm, no smoothstep**. `gust.ts` needs them →
  add `hash1` + 1-D value noise as new engine-root helpers; do not weaken `hashCell`'s contract.
  `[0,1)` idiom is `/ 0x1_0000_0000` (`decorations.ts:90`).
- **No seeded PRNG exists anywhere** (no mulberry32/xorshift/pcg; `Rng = () => number` seams
  in `editor/sprite/scatter.ts:4` and `game/combat/resolve-hit.ts:24` are editor/game-layer
  and injectable-only). **No PRNG state is serialized today** — weather would be the first.
  Prefer a pure `(state) -> [value, nextState]` uint32 step so the serialized field is one
  number and the stepper is provably correct by reading.

## Time-base inconsistency to be deliberate about

`Time = {elapsed: Seconds; dt: Seconds; scale: number}` (`clock.ts:3`); `Clock.scale`
multiplies both (`:14,20`). `TimerSystem` decrements by `time.dt` (**seconds**) while
`Tween.tick`/`FadeTimeline.tick` take **Milliseconds** and divide by 1000 internally.
New weather/ambient code uses **seconds** off `time.dt`.

## Existing animation code W1 must sit beside (do not touch)

`src/engine/animation/` already holds `tween.ts` (`Tween`, `@serializable("Tween")`, 5 fields
all serialized incl. `elapsed`; `tick(dt: Milliseconds)`), `easing.ts` (`Easing` value type +
exactly 6 named easings; `ease(name)` **silently falls back to linear** on unknown — contrary
to the crash-loudly norm; `Easing.name` is `string`, unchecked), `fade-timeline.ts`
(`FadeTimeline`, 3-phase in/hold/out, `elapsed` NOT serialized, `alpha()` hardcodes linear).
Editor surface: `easing-select.tsx` registered at `register-renderers.tsx:44-45` — adding to
the easing table auto-adds to that dropdown.
`EffectHandle` = `Readonly<{done(): boolean; complete(): void}>` (`effect-handle.ts:1`).
`TimerComponent` `@serializable("Timer")`, `TimerSystem` at `compositions.ts:136`.
`startFade(ecs, to, duration, easing = "linear"): EffectHandle` `screen-fade-system.ts:19`.
Name note: `Timeline` is already taken twice in the **editor** layer
(`editor/timeline/timeline.tsx`, `editor/sprite/timeline.tsx`) — different layer, acceptable.

## Registering an engine system that needs a game-layer asset URL

Precedent = constructor injection from `compositions.ts`: `import knickKnacksUrl from
"./content/assets/knick-knacks-grass.png"` (`compositions.ts:46-47`) passed into the engine
class at `:153-165`. (Not needed if audio is synthesized — decision 3.)
