import { eachLiveRenderer } from "../src/engine/render/renderer-registry";
import { registerHostPlugin } from "../src/engine/runtime/host-extensions";
import { registeredComponents } from "../src/engine/serialization/registry";
import { serializeWorld } from "../src/engine/serialization/serialize";
import type { World } from "../src/engine/world";
import {
	QA_CHANNEL,
	type FrameTimings,
	type QaRequest,
	type QaResponse,
	type RenderCounters,
} from "./qa-protocol";

const ZERO_COUNTERS: RenderCounters = {
	drawCalls: 0,
	quadVertexCount: 0,
	tileVertexCount: 0,
	layerCount: 0,
	scratchTargetsDisposed: 0,
};

/**
 * The page half of the dev-only probe: it observes the running game through the
 * seams the app already exposes and answers requests the CLI sends over Vite's
 * own HMR channel.
 *
 * Reachable only under `vite` serve, because only `vite-qa-bridge.ts` — a
 * `apply: "serve"` plugin — ever resolves this module. A `vite build` never puts
 * it in the graph, so the shipped game cannot contain it.
 */
class QaBridge {
	private sceneId: string | null = null;
	private world: World | null = null;

	private counters: Array<RenderCounters> = [];
	private timings: Array<FrameTimings> = [];
	private wanted = 0;
	private settle: (() => void) | null = null;

	constructor() {
		registerHostPlugin({
			onSceneChanged: (id, world) => {
				this.sceneId = id;
				this.world = world;
			},
		});
		requestAnimationFrame(this.onFrame);
	}

	/**
	 * Sampled after the app's own frame callback, so the counters read describe
	 * the frame just drawn rather than one under construction.
	 */
	private readonly onFrame = (): void => {
		if (this.wanted > 0) {
			this.counters.push(this.readCounters());
			this.timings.push(this.readTimings());
			if (this.counters.length >= this.wanted) {
				this.wanted = 0;
				const settle = this.settle;
				this.settle = null;
				settle?.();
			}
		}
		requestAnimationFrame(this.onFrame);
	};

	private readCounters(): RenderCounters {
		let counters = ZERO_COUNTERS;
		eachLiveRenderer((renderer) => {
			counters = {
				drawCalls: renderer.drawCalls,
				quadVertexCount: renderer.quadVertexCount,
				tileVertexCount: renderer.tileVertexCount,
				layerCount: renderer.layerCount,
				scratchTargetsDisposed: renderer.scratchTargetsDisposed,
			};
		});
		return counters;
	}

	private readTimings(): FrameTimings {
		const profile = this.world?.profile;
		if (!profile) {
			return { updateSpanMs: 0, systems: [] };
		}
		const systems: Array<{ label: string; ms: number }> = [];
		for (const [label, ms] of profile.systemTimings) {
			systems.push({ label, ms });
		}
		return { updateSpanMs: profile.updateSpanMs, systems };
	}

	private collect(frames: number): Promise<void> {
		this.counters = [];
		this.timings = [];
		this.wanted = Math.max(1, frames);
		return new Promise((resolve) => {
			this.settle = resolve;
		});
	}

	/** Answer one request from the CLI. */
	async handle(request: QaRequest): Promise<QaResponse> {
		const { id } = request;
		if (request.kind === "entities") {
			const world = this.world;
			if (!world) {
				return { id, ok: false, error: "no world is running yet" };
			}
			const wanted = request.with;
			const registered = new Set(
				registeredComponents().map(([name]) => name),
			);
			for (const name of wanted) {
				if (!registered.has(name)) {
					return {
						id,
						ok: false,
						error: `unknown component "${name}".\nRegistered: ${[...registered].sort().join(", ")}`,
					};
				}
			}
			const entities = serializeWorld(world.ecs)
				.filter((entity) =>
					wanted.every((name) => name in entity.components),
				)
				.map((entity) => ({
					id: Number(entity.id),
					components: Object.entries(entity.components).map(
						([type, fields]) => ({ type, fields }),
					),
				}));
			return {
				id,
				ok: true,
				kind: "entities",
				scene: this.sceneId,
				entities,
			};
		}
		if (request.kind === "profile") {
			await this.collect(request.frames);
			return { id, ok: true, kind: "profile", frames: this.timings };
		}
		await this.collect(request.frames);
		return { id, ok: true, kind: "render", frames: this.counters };
	}
}

/**
 * Built eagerly so the host extension is registered before the game constructs
 * its {@link import("../src/engine/runtime/host").Host}, but a failure here is
 * reported to the CLI rather than left as a silent timeout — the probe going
 * quiet is the one failure mode that would waste the most time.
 */
let bridge: QaBridge | null = null;
let failure: string | null = null;
try {
	bridge = new QaBridge();
} catch (cause) {
	failure = `the probe failed to attach: ${String(cause)}`;
}

if (import.meta.hot) {
	import.meta.hot.on(QA_CHANNEL, (request: QaRequest) => {
		const hot = import.meta.hot;
		const live = bridge;
		if (!live) {
			hot?.send(QA_CHANNEL, {
				id: request.id,
				ok: false,
				error: failure ?? "the probe is not attached",
			} satisfies QaResponse);
			return;
		}
		void live.handle(request).then(
			(response) => hot?.send(QA_CHANNEL, response),
			(cause: unknown) =>
				hot?.send(QA_CHANNEL, {
					id: request.id,
					ok: false,
					error: String(cause),
				} satisfies QaResponse),
		);
	});
}
