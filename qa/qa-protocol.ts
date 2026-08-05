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
export type QaRequest =
	| Readonly<{
			id: number;
			kind: "entities";
			with: ReadonlyArray<string>;
	  }>
	| Readonly<{ id: number; kind: "profile"; frames: number }>
	| Readonly<{ id: number; kind: "render"; frames: number }>;

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
	tileVertexCount: number;
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
	  }>;
