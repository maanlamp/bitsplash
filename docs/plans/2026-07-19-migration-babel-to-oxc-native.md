# Remove Babel: React Compiler + decorators onto oxc-native

- **Type:** migration
- **Date:** 2026-07-19
- **Status:** draft

## Goal

Delete Babel from the dev and build pipeline by moving its two jobs — the React
Compiler and the `2023-11` standard-decorator transform — onto oxc's native Rust
transformer, once that ships in a stable Vite/oxc release. Outcome: cold-boot ≈
warm-boot dev startup, and the bespoke Babel disk cache (`vite-babel-cache.ts`)
removed. **This plan is gated on external delivery (oxc Q3 2026); it is not
actionable today** — it exists so we switch cleanly the moment the dependency
lands, and so no invasive stopgap is built in the meantime.

## Context & problem

The editor opens as an Electron window against the Vite dev server. Dev startup
is transform-CPU-bound on a single-threaded Babel pass carried by
`@rolldown/plugin-babel`, which does exactly two things:

- **React Compiler** on ~469 of ~496 files (`reactCompilerPreset()` via
  `babel-plugin-react-compiler`) — the dominant cost.
- **`2023-11` standard decorators** on 64 files (`@serializable`/`@serialize`,
  via `@babel/plugin-proposal-decorators`).

`vite-babel-cache.ts` content-addresses Babel output on disk so _warm_ boots skip
the pass, but Babel stays on the hot path and _cold_ boots (fresh clone, cache
wipe, or a salt-invalidating dep/toolchain change) pay full price.

Constraints that bound the solution:

- **The React Compiler must run in dev with no dev/build divergence.** Authored
  code relies on its auto-memoization; skipping it in dev is off the table.
- Whatever replaces Babel must run the compiler identically in dev **and** build.
- The `@serializable`/`@serialize` decorators depend on `context.metadata`
  (`Symbol.metadata`, the 2023-11 decorator-metadata proposal) to accumulate
  field options and hand them to the class decorator — they are genuinely
  standard decorators, not legacy/experimental ones (no `experimentalDecorators`
  in `tsconfig.app.json`; `ESNext.Decorators` lib, `es2023` target).

Why this is a _wait_, not a _build-now_ (verified this session against the
installed toolchain):

- **`oxc-transform@0.140.0`** (latest on npm) exposes no `reactCompiler` option;
  `PluginsOptions` is only `styledComponents` + `taggedTemplateEscape`.
- **rolldown-vite's embedded oxc** (what `@vitejs/plugin-react` v6 actually drives
  via `oxc: { jsx: { refresh } }`) has zero `reactCompiler` surface. It exposes
  `jsx.refresh` and a **legacy-only** `decorator` option.
- The oxc Rust React Compiler is **merged but unpublished** (PR #22942) and the
  only community bridge, `oxc-plugin-react-compiler`, is **archived**.
- Standard-decorator lowering in oxc is still open (#9170).

A Babel worker-pool stopgap was spiked this session and rejected (see
Alternatives). So there is no worthwhile lever between now and the oxc delivery.

## Decision

**Wait for the oxc Q3 2026 work, then rip Babel out in one move.** The oxc Q3 plan
(#23976) targets _both_ blockers — shipping the React Compiler in Vite (with a fix
that drops the Oxc↔Babel AST conversion for "up to a 2x performance improvement
with only about a 1 MB binary size increase") and standard decorators (#9170,
listed as a Vite 7→8 migration blocker). When both land in a stable Vite/oxc
release, we:

1. enable oxc-native React Compiler through the supported Vite/`@vitejs/plugin-react`
   surface (used in dev **and** build — no divergence);
2. move decorator lowering onto oxc's native transform;
3. delete `@rolldown/plugin-babel`, `babel-plugin-react-compiler`, `@babel/*`, and
   `vite-babel-cache.ts` entirely.

Until then: change nothing invasive. Rely on the existing disk cache for warm
boots. This is tracked as a roadmap watch-item with the switch triggers.

## Alternatives considered

- **Babel worker pool (parallelize the existing pass).** Spiked this session on
  the real source tree, isolated from dev-server confounds. Ceiling was **1.38×**
  at 2 workers and it went **negative** past that (9 workers = 0.75×) — a
  main-thread serialization bottleneck (every source + result string is
  structured-clone-copied across the thread boundary). The ~1.4× ceiling only
  applies to the ~4s Babel slice of a ~10s cold boot, only on cold-cache boots,
  and would erode further under real main-thread contention. The live-path
  version also carries permanent-until-deleted DX/correctness surface (degraded
  syntax-error overlays, sourcemap fidelity, worker lifecycle, env routing,
  cross-platform). Rejected.
- **Adopt the community `oxc-plugin-react-compiler` now.** Would enable oxc-native
  React Compiler today, but the package is archived/unmaintained and would put an
  experimental crate on the critical path of _production build output_ (subtle
  miscompiled memoization = real runtime bugs, no upstream support). Rejected as
  too risky for shipped output.
- **Migrate decorators to legacy + oxc's `decorator.legacy`.** oxc _can_ lower
  legacy decorators today, but our decorators are standard and lean on
  `Symbol.metadata`; legacy has no `context.metadata`, so this is a semantic
  rewrite of the field-accumulation mechanism plus a `useDefineForClassFields`
  flip that changes class-field init semantics across all 64 component files. And
  it still leaves the React Compiler on Babel — no Babel removal. Rejected.
- **Custom oxc-parser + magic-string decorator transform.** Feasible for our three
  decorators, but on its own it cannot remove Babel (the React Compiler keeps
  `@rolldown/plugin-babel` resident), and a prior spike showed only ~1s benefit.
  Only worth it bundled with a compiler solution — which the oxc-native path
  provides more cleanly. Rejected as a standalone.
- **Skip the compiler in dev (build-only).** Violates the no-dev/build-divergence
  constraint. Off the table.
- **Structural first-paint trim (defer registrations, lazy panels).** Already spiked, partially implemented – lazy panels are in, first-paint trim attempts yielded barely any speedup as that wasn't the bottleneck. The core issue is that react-compiler must run for almost all editor files, and is too slow to reach acceptable cold startup times.

## Approach / steps

**Trigger (do not start until all hold):**

1. A **stable** `@vitejs/plugin-react` (or Vite `oxc` config) release exposes the
   oxc-native React Compiler, documented as dev+build capable.
2. oxc ships **`2023-11` standard-decorator** lowering (#9170 resolved) reachable
   from that same Vite/oxc surface — **or** we accept keeping only the decorator
   Babel pass on 64 files while removing the compiler pass (a partial win; decide
   at trigger time).
3. Both are on a version line we can adopt without regressing the other plugins
   (`vite-plugin-mkcert`, native wasm, `inkCodegen`, `suppress-scene-hmr`).

**Migration steps (once triggered):**

4. Bump Vite / `@vitejs/plugin-react` / oxc to the release that carries native
   React Compiler. Re-establish the dev-boot baseline on the new versions **with
   Babel still in place** (isolate the version-bump delta from the compiler-swap
   delta).
5. Enable oxc-native React Compiler through the supported config surface, applied
   to **both** `command === "serve"` and `command === "build"` in
   `vite.config.ts`. Preserve the current exclusion (`engine/ui` files are
   compiler-excluded today) and confirm the compiler's client-only scoping.
6. Move decorator lowering to oxc's native transform (via the Vite/oxc `decorator`
   surface once standard decorators land). If #9170 is still open at trigger time,
   keep only `@babel/plugin-proposal-decorators` for the 64 decorator files and
   drop everything else — revisit when #9170 ships.
7. Delete the now-dead toolchain: remove `@rolldown/plugin-babel`,
   `babel-plugin-react-compiler`, `@babel/core`,
   `@babel/plugin-proposal-decorators`, `@types/babel__core` from `package.json`;
   delete `vite-babel-cache.ts` and its wiring in `vite.config.ts`; drop the
   `command === "serve" ? cachedBabel(...) : babel(...)` branch.
8. **Verify no dev/build divergence:** diff oxc-native compiler output against the
   retired `babel-plugin-react-compiler` output across the ~469 compiled files
   (byte or AST-level) before deleting the Babel path — a mismatch is a
   correctness regression in shipped memoization, not a cosmetic diff. Confirm the
   `2023-11` decorator behavior via the serialization round-trip
   (`serializeWorld` → restore) and `test/game-composition-boot.test.ts`.
9. **Verify Rapier + physics** still init and step, and that
   `crossOriginIsolated` stays true (profiler timer), since this touches the
   transform pipeline the whole graph flows through.
10. Re-measure process-start → interactive cold **and** warm. Success criterion:
    cold ≈ warm (Babel and its cache both gone). Remove the roadmap watch-item and
    this plan's blocking note.

## Research findings that drove this

- **oxc-native React Compiler is merged but not shippable via any stable layer we
  use.** `oxc-transform@0.140.0` (latest) has no `reactCompiler`; rolldown-vite's
  embedded oxc has none; PR #22942 is vendored/unpublished; community
  `oxc-plugin-react-compiler` is archived. (Verified against installed
  `node_modules` type surfaces this session.)
- **oxc Q3 2026 plan (#23976) covers both blockers** — React Compiler in Vite
  (with the drop-Babel-AST fix: ~2× perf, ~1 MB binary vs the earlier 5.1 MB
  regression that paused the Rolldown attempt) and standard decorators (#9170,
  a Vite 7→8 migration blocker).
- **`@vitejs/plugin-react` v6 drives Vite's embedded oxc** for JSX/refresh via
  `{ oxc: { jsx: { refresh } } }` and deliberately routes the React Compiler
  through Babel (`reactCompilerPreset` + `@rolldown/plugin-babel`) — so the swap
  point is that plugin's config surface, not a custom transform.
- **Our decorators are genuinely standard**, depending on `context.metadata`
  (`Symbol.metadata`); oxc lowers only _legacy_ decorators today, so decorator
  removal is gated on #9170, independently of the compiler.
- **Babel worker-pool measured 1.38× ceiling, negative past 2 workers** — a
  main-thread serialization bottleneck; not worth its DX/correctness surface for
  a ~1s cold-boot-only win.
- **Cold boot is ~4s Babel of ~10s total** — the rest is Vite pipeline/serving,
  not Babel CPU. The compiler swap (near-free native pass) is the only lever that
  meaningfully moves cold boot.

## Risks & open questions

- **External timeline is uncertain.** The whole plan is gated on oxc shipping in a
  stable Vite release; Q3 2026 is a stated _goal_, not a commitment. No internal
  action closes this.
- **Conformance parity of the native compiler.** oxc's React Compiler is a Rust
  port; step 8's output diff is the guard, but a parity gap could force staying on
  Babel for the compiler longer. Treat the diff as a hard gate.
- **Decorators may lag the compiler.** #9170 could ship after the compiler,
  yielding an interim state where the compiler is off Babel but decorators are not
  — decide at trigger time whether to ship that partial win or wait for full
  removal (step 6).
- **Binary-size / plugin-compat.** The native compiler adds ~1 MB to the oxc
  binary; confirm it composes with `vite-plugin-mkcert`, native wasm,
  `inkCodegen`, and `suppress-scene-hmr` without regressing HMR or
  `crossOriginIsolated`.
- **No-divergence enforcement.** Correctness hinges on the compiler running
  identically in dev and build; the plan mandates enabling it for both `serve`
  and `build`, but this must be asserted (step 8), not assumed.
