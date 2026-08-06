import type { DeviceSnapshot } from "../src/engine/input/device-snapshot";
import { eachLiveRenderer } from "../src/engine/render/renderer-registry";
import { registerHostPlugin } from "../src/engine/runtime/host-extensions";
import { registeredComponents } from "../src/engine/serialization/registry";
import { serializeWorld } from "../src/engine/serialization/serialize";
import type { World } from "../src/engine/world";
import {
	QA_CHANNEL,
	type FrameIntervals,
	type FrameTimings,
	type InputStep,
	type QaRequest,
	type QaResponse,
	type RenderCounters,
} from "./qa-protocol";

/**
 * Dispatch `codes` as real DOM keyboard events on `window`.
 *
 * `capture: true` listeners on `window` are what the game shell uses for pause,
 * quicksave and quickload, and those never see the engine's input snapshot — so
 * a script reaching them has to go through the DOM for real.
 */
const dispatchDomKeys = (
	codes: ReadonlyArray<string> | undefined,
	type: "keydown" | "keyup",
): void => {
	if (!codes?.length) {
		return;
	}
	for (const code of codes) {
		window.dispatchEvent(
			new KeyboardEvent(type, {
				code,
				key: code,
				bubbles: true,
				cancelable: true,
			}),
		);
	}
};

const percentile = (sorted: readonly number[], p: number): number =>
	sorted[
		Math.min(
			sorted.length - 1,
			Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
		)
	] ?? 0;

const summarizeIntervals = (
	values: readonly number[],
): FrameIntervals => {
	const sorted = [...values].sort((a, b) => a - b);
	const mean =
		values.reduce((a, b) => a + b, 0) / (values.length || 1);
	return {
		frames: values.length,
		meanMs: mean,
		p50Ms: percentile(sorted, 50),
		p95Ms: percentile(sorted, 95),
		p99Ms: percentile(sorted, 99),
		maxMs: sorted[sorted.length - 1] ?? 0,
		fpsMean: mean > 0 ? 1000 / mean : 0,
	};
};

const ZERO_COUNTERS: RenderCounters = {
	drawCalls: 0,
	quadVertexCount: 0,
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

	private script: ReadonlyArray<InputStep> | null = null;
	private scriptStep = 0;
	private scriptFramesLeft = 0;
	private scriptSettle: (() => void) | null = null;

	private intervals: number[] = [];
	private wantedIntervals = 0;
	private lastFrameAt = 0;
	private intervalSettle: (() => void) | null = null;

	constructor() {
		registerHostPlugin({
			onSceneChanged: (id, world) => {
				this.sceneId = id;
				this.world = world;
			},
			interceptInput: (input) => this.overlayScript(input),
		});
		requestAnimationFrame(this.onFrame);
	}

	/**
	 * Hold the current step's keys on the sampled snapshot and advance the script
	 * one frame.
	 *
	 * Called once per host frame, so a step's `frames` counts real frames and the
	 * script keeps time with the game rather than with a timer. Keys are added to
	 * whatever the player is holding, never removed, so the probe cannot mask
	 * real input.
	 */
	private overlayScript(input: DeviceSnapshot): DeviceSnapshot {
		const script = this.script;
		if (!script) {
			return input;
		}
		const step = script[this.scriptStep];
		if (!step) {
			return input;
		}
		// First frame of this step: open any DOM keys it holds.
		if (this.scriptFramesLeft === step.frames) {
			dispatchDomKeys(step.dom, "keydown");
		}

		let next = input;
		if (step.keys?.length) {
			const keys = { ...input.keyboard.keys };
			for (const key of step.keys) {
				keys[key] = true;
			}
			next = { ...next, keyboard: { ...next.keyboard, keys } };
		}
		if (step.pad?.length) {
			const buttons: Record<string, boolean> = {};
			for (const button of step.pad) {
				buttons[button] = true;
			}
			// A synthetic pad, so a gamepad script runs with no hardware attached.
			next = {
				...next,
				gamepads: {
					...next.gamepads,
					qa: {
						buttons,
						axes: {},
						id: "qa-pad",
						mapping: "standard",
					},
				},
			};
		}

		this.scriptFramesLeft--;
		if (this.scriptFramesLeft <= 0) {
			dispatchDomKeys(step.dom, "keyup");
			this.scriptStep++;
			this.scriptFramesLeft = script[this.scriptStep]?.frames ?? 0;
			if (this.scriptStep >= script.length) {
				this.script = null;
				this.scriptStep = 0;
				const settle = this.scriptSettle;
				this.scriptSettle = null;
				settle?.();
			}
		}
		return next;
	}

	/** Run `steps` against the real input path, resolving when the last ends. */
	private play(steps: ReadonlyArray<InputStep>): Promise<void> {
		this.script = steps;
		this.scriptStep = 0;
		this.scriptFramesLeft = Math.max(1, steps[0]?.frames ?? 1);
		return new Promise((resolve) => {
			this.scriptSettle = resolve;
		});
	}

	/**
	 * Wall-clock intervals between presented frames — what a frame-rate target is
	 * about, and what {@link readTimings} cannot see, since that measures only CPU
	 * time inside the update span.
	 */
	private recordIntervals(frames: number): Promise<FrameIntervals> {
		this.intervals = [];
		this.lastFrameAt = 0;
		this.wantedIntervals = Math.max(1, frames);
		return new Promise((resolve) => {
			this.intervalSettle = () =>
				resolve(summarizeIntervals(this.intervals));
		});
	}

	/**
	 * Sampled after the app's own frame callback, so the counters read describe
	 * the frame just drawn rather than one under construction.
	 */
	private readonly onFrame = (now: number): void => {
		if (this.wantedIntervals > 0) {
			if (this.lastFrameAt > 0) {
				this.intervals.push(now - this.lastFrameAt);
			}
			this.lastFrameAt = now;
			if (this.intervals.length >= this.wantedIntervals) {
				this.wantedIntervals = 0;
				const settle = this.intervalSettle;
				this.intervalSettle = null;
				settle?.();
			}
		}
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
		if (request.kind === "input") {
			if (request.steps.length === 0) {
				return {
					id,
					ok: false,
					error: "input wants at least one step",
				};
			}
			await this.play(request.steps);
			return { id, ok: true, kind: "input", scene: this.sceneId };
		}
		if (request.kind === "frametime") {
			const intervals = await this.recordIntervals(request.frames);
			return { id, ok: true, kind: "frametime", intervals };
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
