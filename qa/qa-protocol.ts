/**
 * The wire format shared by the page-side probe and the CLI. Lives in `qa/` with
 * both halves so neither can drift from a shape declared elsewhere.
 */

/** Vite HMR channel the probe's request/response pairs travel on. */
export const QA_CHANNEL = "bitsplash:qa";

/** Dev-server path the CLI posts requests to. */
export const QA_ENDPOINT = "/__bitsplash_qa";

/**
 * The probe measures; it does not reproduce.
 *
 * A scripted-input `session` command was built and measured, and its runs
 * diverged — identical scripts produced different batching counters (mean quad
 * vertices 669.4 vs 598.8 over 68 frames) because UI animation state differs at
 * the moment a script starts. Per the plan's checkpoint, reproduction therefore
 * belongs to headless fixtures, which are deterministic by construction, and the
 * probe keeps only what is worth trusting: exact counters and real timings.
 */
/**
 * One step of an input script: hold `keys` and `pad` buttons for `frames`
 * frames. An empty step is a wait.
 *
 * Input is injected into the real `DeviceSnapshot` the host already builds, so a
 * step drives the same path a player does — `input-normalizer` to
 * `event-dispatcher` to focus resolution to `onActivate`. Nothing bypasses the
 * UI, which is the point: a build that passes headless fixtures can still be
 * unplayable, and only the real input path can catch that.
 *
 * Frame counts, not milliseconds, so a step means the same thing whatever the
 * frame rate.
 */
export type InputStep = Readonly<{
	keys?: ReadonlyArray<string>;
	pad?: ReadonlyArray<string>;
	/**
	 * `KeyboardEvent.code` values dispatched as real DOM events on `window`,
	 * keydown on the step's first frame and keyup on its last.
	 *
	 * Not everything a player presses reaches the engine's snapshot: the game
	 * shell binds pause, quicksave and quickload to a `window` keydown listener,
	 * so those are unreachable to {@link keys} and need a genuine DOM event.
	 * Codes are case-sensitive here (`"Escape"`, `"F5"`), unlike {@link keys},
	 * which the keyboard layer upper-cases.
	 */
	dom?: ReadonlyArray<string>;
	frames: number;
}>;

export type QaRequest =
	| Readonly<{
			id: number;
			kind: "entities";
			with: ReadonlyArray<string>;
	  }>
	| Readonly<{ id: number; kind: "profile"; frames: number }>
	| Readonly<{ id: number; kind: "render"; frames: number }>
	| Readonly<{
			id: number;
			kind: "input";
			steps: ReadonlyArray<InputStep>;
	  }>
	| Readonly<{ id: number; kind: "frametime"; frames: number }>;

/**
 * Wall-clock interval between presented frames, which is what a frame-rate
 * target is actually about. Distinct from {@link FrameTimings}, which is
 * CPU time inside the update span and excludes all GPU and compositing work.
 */
export type FrameIntervals = Readonly<{
	frames: number;
	meanMs: number;
	p50Ms: number;
	p95Ms: number;
	p99Ms: number;
	maxMs: number;
	fpsMean: number;
}>;

export type EntityDump = Readonly<{
	id: number;
	components: ReadonlyArray<
		Readonly<{ type: string; fields: Record<string, unknown> }>
	>;
}>;

/** Per-frame renderer batching counters. Exact integers for a given scene. */
export type RenderCounters = Readonly<{
	drawCalls: number;
	quadVertexCount: number;
	layerCount: number;
	scratchTargetsDisposed: number;
}>;

export type FrameTimings = Readonly<{
	updateSpanMs: number;
	systems: ReadonlyArray<Readonly<{ label: string; ms: number }>>;
}>;

export type QaResponse =
	| Readonly<{ id: number; ok: false; error: string }>
	| Readonly<{
			id: number;
			ok: true;
			kind: "entities";
			scene: string | null;
			entities: ReadonlyArray<EntityDump>;
	  }>
	| Readonly<{
			id: number;
			ok: true;
			kind: "profile";
			frames: ReadonlyArray<FrameTimings>;
	  }>
	| Readonly<{
			id: number;
			ok: true;
			kind: "render";
			frames: ReadonlyArray<RenderCounters>;
	  }>
	| Readonly<{
			id: number;
			ok: true;
			kind: "input";
			scene: string | null;
	  }>
	| Readonly<{
			id: number;
			ok: true;
			kind: "frametime";
			intervals: FrameIntervals;
	  }>;
