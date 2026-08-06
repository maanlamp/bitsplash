import { pickActiveCamera2D } from "../camera/camera-2d-render";
import type { Clock, Time } from "../clock";
import type { Milliseconds, Seconds } from "../duration";
import {
	type ActionProvider,
	NULL_ACTIONS,
} from "../input/bindings/action-provider";
import type { DeviceSnapshot } from "../input/device-snapshot";
import type { Mutable } from "../mutable";
import type { Scene } from "../scene/scene";
import type { GlobalServices } from "../services";
import type { UpdateContext } from "../system";
import type { UiRuntime } from "../ui/ui-runtime";
import type { World } from "../world";
import { registeredHostPlugins } from "./host-extensions";
import type { Runtime } from "./runtime";

/**
 * The one frame-time clamp. Startup, a throttled tab and a breakpoint all land
 * here, so no consumer keeps its own copy.
 */
export const MAX_FRAME_MS = 100 as Milliseconds;

const MS_PER_SECOND = 1000;

const ZERO_TIME: Time = {
	elapsed: 0 as Seconds,
	dt: 0 as Seconds,
	scale: 1,
};

const clampFrame = (dt: Milliseconds): Milliseconds =>
	(dt > MAX_FRAME_MS
		? MAX_FRAME_MS
		: dt > 0
			? dt
			: 0) as Milliseconds;

const PROFILE_MARKER = "profile";

/**
 * Whether per-system profiling starts on: on under the dev server, off in a
 * build, and forced on — in the built game too — by the `profile` marker that
 * `src/desktop/game.cjs` appends to the URL it loads when the
 * `BITSPLASH_PROFILE` env var is set. That flag is how a perf run gets
 * per-system numbers, accepting that measuring them perturbs them.
 *
 * `import.meta.env` is read defensively because Vite is what defines it: it is
 * absent under `bun test`, where reaching through it would throw.
 */
const profilingDefault = (): boolean => {
	if (
		typeof location !== "undefined" &&
		location.search.includes(PROFILE_MARKER)
	) {
		return true;
	}
	const meta: { env?: { DEV?: boolean } } = import.meta;
	return meta.env?.DEV === true;
};

/**
 * The scene the host steps, re-read each frame so a scene swap needs no host
 * rebuild.
 */
export type SceneSource = Readonly<{ current(): Scene | null }>;

/**
 * Where the host reads device input. Rolling the device forward is the source's
 * job; the host only samples it, and treats a change of returned snapshot as a
 * change of input source.
 */
export type InputSource = Readonly<{ sample(): DeviceSnapshot }>;

/**
 * The UI the host steps and lays out, plus the surface it lays out against.
 * `runtime()` returning `null` is a host with no UI at all — gameplay then reads
 * the device unmasked.
 */
export type UiSurface = Readonly<{
	runtime(): UiRuntime | null;
	width(): number;
	height(): number;
}>;

/**
 * Behaviour composed onto a host by whoever built it, instead of flags on the
 * host.
 */
export type HostPlugin = Readonly<{
	onSceneChanged?(id: string, world: World): void;
	onRuntimeChanged?(runtime: Runtime): void;
	onStop?(): void;
	/**
	 * Replace the snapshot the host just sampled. Return the input unchanged to
	 * pass it through. Applied in registration order, so a later plugin sees an
	 * earlier one's result.
	 */
	interceptInput?(input: DeviceSnapshot): DeviceSnapshot;
}>;

export type HostOptions = Readonly<{
	sceneSource: SceneSource;
	inputSource: InputSource;
	ui: UiSurface;
	/** Advanced once per frame, by {@link Host.advance}. */
	clock: Clock;
	/** What the per-frame {@link UpdateContext} is built from. */
	services: GlobalServices;
	plugins?: ReadonlyArray<HostPlugin>;
	/** Initial profiling state; defaults to on in dev, off in a build. */
	profiling?: boolean;
}>;

/**
 * The one frame. Every consumer — the shipped game, a preview, a run inside the
 * editor — advances the same body: clock advance, the `ui.step` / `ui.layout`
 * sandwich with gameplay inside the step callback so UI focus masks input,
 * action stepping, `ecs.update`, `flushDestroyed`. The host never renders, and
 * never holds a {@link Runtime}: it re-reads its {@link SceneSource} every
 * frame, so loading a save is a scene swap rather than a host rebuild.
 *
 * Two halts, named apart, so neither can be mistaken for the other:
 * {@link setGameplayPaused} is the player's pause — the world stops simulating
 * while the UI keeps stepping and laying out, so a pause menu responds — and
 * {@link freeze} is the editor's debugger, where nothing advances at all and
 * {@link stepOnce} advances exactly one frame. Rendering is unaffected by
 * either; the owner keeps drawing.
 *
 * @example
 * const host = new Host({ sceneSource, inputSource, ui, clock, services });
 * const time = host.advance(rawDeltaMs);
 * host.step(rawDeltaMs, time);
 * drawEverything(time);
 * host.endFrame();
 */
export class Host {
	private readonly sceneSource: SceneSource;
	private readonly inputSource: InputSource;
	private readonly uiSurface: UiSurface;
	private readonly clock: Clock;
	private readonly services: GlobalServices;
	private readonly plugins: ReadonlyArray<HostPlugin>;

	private scene: Scene | null = null;
	private sampled: DeviceSnapshot | null = null;
	private lastDevice: DeviceSnapshot | null = null;
	private context: Mutable<UpdateContext> | null = null;
	private frameDt = 0 as Milliseconds;
	private frameTime: Time = ZERO_TIME;
	private gameplayPausedValue = false;
	private frozenValue = false;
	private profilingValue: boolean;
	private stopped = false;

	private readonly runGameplay = (masked: DeviceSnapshot): void => {
		this.gameplay(masked);
	};

	constructor(options: HostOptions) {
		this.sceneSource = options.sceneSource;
		this.inputSource = options.inputSource;
		this.uiSurface = options.ui;
		this.clock = options.clock;
		this.services = options.services;
		this.profilingValue = options.profiling ?? profilingDefault();
		this.plugins = [
			...(options.plugins ?? []),
			...registeredHostPlugins(),
		];
	}

	/**
	 * Clamp `dt`, advance the clock, and return the frame's {@link Time}.
	 *
	 * Separate from {@link step} because the owner needs that `Time` before the
	 * step — it renders with it and hands it back in — while the clamp and the
	 * clock belong to the host. Call once per frame, immediately before
	 * {@link step}. The clock advances whether or not the host is frozen: a
	 * freeze halts the frame, not the owner's wall clock.
	 */
	advance(dt: Milliseconds): Time {
		const delta = clampFrame(dt);
		this.clock.advance(delta);
		return this.clock.snapshot(delta);
	}

	/** Advance one frame. Honours gameplay pause and freeze. */
	step(dt: Milliseconds, time: Time): void {
		if (this.frozenValue) {
			return;
		}
		this.runFrame(clampFrame(dt), time);
	}

	/** Advance exactly one frame while frozen — the editor's single-step. */
	stepOnce(dt: Milliseconds, time: Time): void {
		this.syncScene();
		this.scene?.world.requestSingleStep();
		this.runFrame(clampFrame(dt), time);
	}

	/**
	 * Clear per-frame UI and world events. Called by the owner **after**
	 * rendering, because render systems read those events. The global
	 * {@link GlobalServices} event bus is not the host's to clear — its owner
	 * keeps clearing it.
	 */
	endFrame(): void {
		this.uiSurface.runtime()?.clearEvents();
		this.scene?.world.events.clear();
	}

	/** The world of the scene last stepped, or `null` before the first frame. */
	get world(): World | null {
		return this.scene?.world ?? null;
	}

	/**
	 * The player's pause: the world stops simulating while the UI keeps stepping
	 * and laying out, so a pause menu stays responsive.
	 */
	setGameplayPaused(paused: boolean): void {
		this.gameplayPausedValue = paused;
	}

	get gameplayPaused(): boolean {
		return this.gameplayPausedValue;
	}

	/**
	 * The editor's debugger: while frozen nothing advances — no gameplay, no UI
	 * step, no UI layout, no action stepping — until unfrozen or
	 * {@link stepOnce}.
	 */
	freeze(frozen: boolean): void {
		this.frozenValue = frozen;
	}

	get frozen(): boolean {
		return this.frozenValue;
	}

	/**
	 * Turn per-system profiling on or off for the stepped world. Per-system
	 * timing is itself observer overhead, so it is a runtime toggle rather than a
	 * fact about which app is running.
	 */
	setProfiling(enabled: boolean): void {
		if (this.profilingValue === enabled) {
			return;
		}
		this.profilingValue = enabled;
		this.scene?.world.setProfiling(enabled);
	}

	get profiling(): boolean {
		return this.profilingValue;
	}

	/**
	 * Fan a runtime swap out to the plugins. Whoever owns the {@link Runtime}
	 * calls this after replacing it — loading a save, quitting to a menu — and a
	 * plugin re-mounts whatever hangs off it. The host itself keeps no reference,
	 * which is what makes a load safe.
	 */
	notifyRuntimeChanged(runtime: Runtime): void {
		for (const plugin of this.plugins) {
			plugin.onRuntimeChanged?.(runtime);
		}
	}

	stop(): void {
		if (this.stopped) {
			return;
		}
		this.stopped = true;
		for (const plugin of this.plugins) {
			plugin.onStop?.();
		}
	}

	private runFrame(dt: Milliseconds, time: Time): void {
		this.frameDt = dt;
		this.frameTime = time;
		this.syncScene();
		let device = this.inputSource.sample();
		// A plugin may overlay input on the sampled snapshot, so a QA script
		// drives the same path a player does rather than reaching past the UI.
		for (const plugin of this.plugins) {
			device = plugin.interceptInput?.(device) ?? device;
		}
		this.sampled = device;
		const ui = this.uiSurface.runtime();
		if (!ui) {
			this.runGameplay(device);
			return;
		}
		const uiScale = this.scene?.config.uiScale ?? 1;
		ui.step(device, uiScale, dt / MS_PER_SECOND, this.runGameplay);
		const camera = this.scene
			? pickActiveCamera2D(this.scene.world.ecs)
			: null;
		ui.layout(
			uiScale,
			this.uiSurface.width(),
			this.uiSurface.height(),
			camera ?? undefined,
		);
	}

	private gameplay(masked: DeviceSnapshot): void {
		if (this.gameplayPausedValue) {
			return;
		}
		const scene = this.scene;
		if (!scene) {
			return;
		}
		const actions = scene.actions ?? NULL_ACTIONS;
		if (this.sampled !== this.lastDevice) {
			actions.resetEdges();
		}
		this.lastDevice = this.sampled;
		actions.step(masked, this.frameDt);
		const world = scene.world;
		world.ecs.update(this.fillContext(world, masked, actions));
		world.ecs.flushDestroyed();
	}

	private fillContext(
		world: World,
		input: DeviceSnapshot,
		actions: ActionProvider,
	): UpdateContext {
		const camera = pickActiveCamera2D(world.ecs);
		const ctx = (this.context ??= {
			dt: this.frameDt,
			time: this.frameTime,
			ecs: world.ecs,
			world,
			input,
			actions,
			assetManager: this.services.assetManager,
			audio: this.services.audio,
			events: world.events,
			camera,
		});
		ctx.dt = this.frameDt;
		ctx.time = this.frameTime;
		ctx.ecs = world.ecs;
		ctx.world = world;
		ctx.input = input;
		ctx.actions = actions;
		ctx.events = world.events;
		ctx.camera = camera;
		return ctx;
	}

	private syncScene(): void {
		const next = this.sceneSource.current();
		if (next === this.scene) {
			return;
		}
		this.scene = next;
		if (!next) {
			return;
		}
		next.world.setProfiling(this.profilingValue);
		for (const plugin of this.plugins) {
			plugin.onSceneChanged?.(next.name, next.world);
		}
	}
}
