import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decodePng } from "../../src/editor/sprite/png-codec";
import AssetManager, {
	type BspriteBytesLoader,
} from "../../src/engine/assets";
import type { AudioApi } from "../../src/engine/audio/audio-api";
import { NullAudioManager } from "../../src/engine/audio/null-audio-manager";
import { pickActiveCamera2D } from "../../src/engine/camera/camera-2d-render";
import { Clock } from "../../src/engine/clock";
import { ECS } from "../../src/engine/ecs";
import type { TileSource } from "../../src/engine/render/renderer-2d";
import type {
	SheetComposer,
	SpriteAsset,
} from "../../src/engine/sprite/sprite-asset";
import { SpriteComponent } from "../../src/engine/sprite/sprite-component";
import { SpriteTagPlaybackSystem } from "../../src/engine/sprite/sprite-tag-playback-system";
import type {
	Milliseconds,
	Seconds,
} from "../../src/engine/duration";
import type { ActionProvider } from "../../src/engine/input/bindings/action-provider";
import type { DeviceSnapshot } from "../../src/engine/input/device-snapshot";
import type { CollisionMatrix } from "../../src/engine/physics/collision";
import { loadRapier } from "../../src/engine/physics/rapier-physics";
import type {
	Runtime,
	SceneDefinition,
} from "../../src/engine/runtime/runtime";
import { Runtime as RuntimeClass } from "../../src/engine/runtime/runtime";
import { SaveManager } from "../../src/engine/save/save-manager";
import type { UpdateContext } from "../../src/engine/system";
import { World } from "../../src/engine/world";

const FRAME_MS = (1000 / 60) as Milliseconds;

/**
 * Headless {@link BspriteBytesLoader} for the sequence harness: resolves an
 * authored web path (`/src/game/content/assets/*.bsprite`) to the committed file
 * on disk and returns its bytes. Rejects (async) when the file is absent, so the
 * facade settles the entry to `error` and the tag-playback system simply no-ops
 * rather than crashing — the correct behavior for a scene referencing an asset
 * not present in a given test.
 */
const diskBspriteLoader: BspriteBytesLoader = async (url) => {
	const rel = url.startsWith("/") ? url.slice(1) : url;
	const path = fileURLToPath(
		new URL(`../../${rel}`, import.meta.url),
	);
	return new Uint8Array(readFileSync(path));
};

type RapierModule = typeof import("@dimforge/rapier2d");

const loadRapierHeadless = (): Promise<void> =>
	loadRapier(async () => {
		const mod =
			(await import("@dimforge/rapier2d-compat")) as unknown as {
				init: () => Promise<void>;
			};
		await mod.init();
		return mod as unknown as RapierModule;
	});

export type HarnessConfig = Readonly<{
	initialScene: string;
	seed: (world: World) => void;
	resolveScene: (id: string) => SceneDefinition;
	registerSystems?: (world: World) => void;
	now?: () => number;
	/** Collision matrix for the world, matching the shipped game's layers. */
	collisionMatrix?: CollisionMatrix;
	/** Device snapshot fed to systems each frame (defaults to a throwing stub). */
	input?: DeviceSnapshot;
	/** Action provider fed to systems each frame (defaults to a throwing stub). */
	actions?: ActionProvider;
	/** Audio backend fed to systems each frame. Defaults to the silent one. */
	audio?: AudioApi;
	/**
	 * Asset manager fed to systems each frame. Defaults to a real headless
	 * {@link AssetManager} that loads `.bsprite` archives from disk
	 * ({@link diskBspriteLoader}) via the {@link headlessSheetComposer}, so
	 * `.bsprite`-backed sprites (the migrated actor prefabs) resolve their tags.
	 */
	assetManager?: AssetManager;
}>;

/**
 * A stand-in for a service the harness does not provide, typed `never` because
 * that is what it is: every access throws, so no value of it is usable. A
 * branch that can only ever receive the stub is a type error rather than a
 * runtime one.
 */
const stubService = (label: string): never =>
	new Proxy(
		{},
		{
			get: () => {
				throw new Error(
					`sequence-harness: the "${label}" service is a stub; a system under test reached for it. Extend the harness to provide a real one.`,
				);
			},
		},
	) as never;

export class SequenceFixture {
	private runtimeValue: Runtime;
	private readonly clock = new Clock();
	private frame = 0;
	private readonly assets: AssetManager;
	private readonly audio: AudioApi;

	private constructor(
		runtime: Runtime,
		private readonly config: HarnessConfig,
		private readonly manager: SaveManager,
		private readonly now: () => number,
	) {
		this.runtimeValue = runtime;
		this.audio = config.audio ?? new NullAudioManager();
		this.assets =
			config.assetManager ??
			new AssetManager(
				undefined,
				diskBspriteLoader,
				headlessSheetComposer,
			);
	}

	static makeRuntime(config: HarnessConfig): Runtime {
		const initial = config.resolveScene(config.initialScene);
		const world = new World(
			initial.config.gravity,
			config.collisionMatrix,
		);
		config.registerSystems?.(world);
		return new RuntimeClass({
			world,
			seed: config.seed,
			resolveScene: config.resolveScene,
		});
	}

	static async create(
		config: HarnessConfig,
	): Promise<SequenceFixture> {
		await loadRapierHeadless();
		const runtime = SequenceFixture.makeRuntime(config);
		runtime.newGame(config.initialScene);
		const now = config.now ?? (() => Date.now());
		return new SequenceFixture(
			runtime,
			config,
			new SaveManager(),
			now,
		);
	}

	get runtime(): Runtime {
		return this.runtimeValue;
	}

	get world(): World {
		return this.runtimeValue.world;
	}

	get ecs() {
		return this.runtimeValue.world.ecs;
	}

	/**
	 * The asset manager systems see, for pre-warming an asynchronous load before
	 * stepping — {@link step} is synchronous, so a system that needs a loaded
	 * asset (a font, to wrap and reveal dialogue text) never gets one otherwise.
	 */
	get assetManager(): AssetManager {
		return this.assets;
	}

	private buildContext(): UpdateContext {
		this.clock.advance(FRAME_MS);
		const time = this.clock.snapshot(FRAME_MS);
		return {
			dt: FRAME_MS,
			time,
			ecs: this.world.ecs,
			world: this.world,
			input: this.config.input ?? stubService("input"),
			actions: this.config.actions ?? stubService("actions"),
			assetManager: this.assets,
			events: this.world.events,
			audio: this.audio,
			camera: pickActiveCamera2D(this.world.ecs),
		};
	}

	step(frames = 1): void {
		for (let i = 0; i < frames; i++) {
			const ctx = this.buildContext();
			this.world.ecs.update(ctx);
			this.world.step((FRAME_MS / 1000) as Seconds);
			this.world.ecs.flushDestroyed();
			this.world.events.clear();
			this.frame += 1;
		}
	}

	async saveAndReload(): Promise<SequenceFixture> {
		const blob = await this.manager.capture(
			this.runtimeValue,
			this.now(),
		);
		const fresh = SequenceFixture.makeRuntime(this.config);
		await this.manager.restore(fresh, blob);
		this.runtimeValue.dispose();
		this.runtimeValue = fresh;
		return this;
	}

	dispose(): void {
		this.runtimeValue.dispose();
	}
}

/** Flush pending microtasks and the macrotask queue so async loads settle. */
export const flushEventLoop = (): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Serve `fetch` from disk for the asset paths Bun's `?url` imports produce, so a
 * `.font.zip` really loads headlessly and dialogue text can be wrapped and
 * revealed by the real {@link AssetManager}. Returns a restore function.
 *
 * @example
 * const restore = useDiskFetch();
 * fixture.assetManager.getFontFamilies(DEFAULT_FONT.fontRef.path, DEFAULT_FONT.size);
 * await settleAssets();
 * restore();
 */
const requestUrl = (input: RequestInfo | URL): string => {
	if (typeof input === "string") {
		return input;
	}
	return input instanceof URL ? input.href : input.url;
};

export const useDiskFetch = (): (() => void) => {
	const original = globalThis.fetch;
	globalThis.fetch = ((
		input: RequestInfo | URL,
		init?: RequestInit,
	): Promise<Response> => {
		const url = requestUrl(input);
		if (!url.includes("://") && existsSync(url)) {
			return Promise.resolve(new Response(readFileSync(url)));
		}
		return original(input as RequestInfo, init);
	}) as typeof fetch;
	return () => {
		globalThis.fetch = original;
	};
};

/** Pump the event loop until in-flight asset loads have settled. */
export const settleAssets = async (rounds = 20): Promise<void> => {
	for (let i = 0; i < rounds; i++) {
		await flushEventLoop();
	}
};

/**
 * A headless {@link SheetComposer} substituting the engine's default DOM
 * composer (`document.createElement("canvas")` + `createImageBitmap`, neither of
 * which exists in Bun's test runner).
 *
 * It decodes every baked frame PNG with the pure {@link decodePng} — proving the
 * real writer's bakes are valid, decodable PNGs on the actual load path without a
 * DOM — then returns a stand-in sheet {@link TileSource} sized exactly as the
 * real canvas composer would (`width * frames` wide). The returned object carries
 * no readable pixels: GPU texture upload and on-screen sampling remain
 * DOM/WebGL-only and are deliberately NOT asserted headlessly. Baked-pixel
 * correctness is proven separately by decoding the archive directly (the
 * hot-reload test's artifact round-trip).
 */
export const headlessSheetComposer: SheetComposer = async (
	entries,
	manifest,
) => {
	for (let i = 0; i < manifest.frames.length; i++) {
		const png = entries[`bakes/${i}.png`];
		if (png) {
			decodePng(png);
		}
	}
	return {
		width: Math.max(1, manifest.width * manifest.frames.length),
		height: Math.max(1, manifest.height),
	} as unknown as TileSource;
};

export type SpriteHotReloadConfig = Readonly<{
	/** The `.bsprite` URL the scene's sprite references. */
	url: string;
	/** Byte source — returns the archive bytes currently "on disk" for a URL. */
	loadBytes: BspriteBytesLoader;
	/** Tag the sprite plays; defaults to none (`current === ""`). */
	tag?: string;
}>;

/**
 * Headless harness for the `.bsprite` hot-reload self-heal (plan step 18): a real
 * {@link ECS} running the real {@link SpriteTagPlaybackSystem} against a real
 * {@link AssetManager} whose two DOM-only load steps are replaced by injected
 * seams — {@link SpriteHotReloadConfig.loadBytes} for the archive bytes and
 * {@link headlessSheetComposer} for the sheet. A single {@link SpriteComponent}
 * entity references the URL, exactly as an authored scene would.
 *
 * The save→evict→re-serve loop is exercised by swapping what `loadBytes` returns
 * and calling {@link evict}; the facade then re-loads and serves the new manifest
 * (dimensions, frame count, content rects) and the playback consumer sees the new
 * frame count. What stays out of reach headlessly (the composed sheet's WebGL
 * upload and on-screen pixels) is documented on {@link headlessSheetComposer}.
 *
 * @example
 * const bytes = { current: v1 };
 * const fx = new SpriteHotReloadFixture({ url, loadBytes: async () => bytes.current, tag: "idle" });
 * const a1 = await fx.load(); // 16×16
 * bytes.current = v2; fx.evict();
 * const a2 = await fx.load(); // 24×24, self-healed
 */
export class SpriteHotReloadFixture {
	readonly assets: AssetManager;
	readonly ecs = new ECS();
	readonly sprite: SpriteComponent;
	private readonly system = new SpriteTagPlaybackSystem();

	constructor(private readonly config: SpriteHotReloadConfig) {
		this.assets = new AssetManager(
			undefined,
			config.loadBytes,
			headlessSheetComposer,
		);
		this.sprite = new SpriteComponent(config.url);
		this.sprite.current = config.tag ?? "";
		this.ecs.createEntity([this.sprite]);
		this.ecs.addUpdateSystem(this.system);
	}

	/** Poll the facade, kicking off the load on the first call. */
	peek(): SpriteAsset | undefined {
		return this.assets.sprites.get(this.config.url);
	}

	/** Pump the event loop until the facade has the asset loaded; return it. */
	async load(): Promise<SpriteAsset> {
		for (let i = 0; i < 50; i++) {
			const asset = this.peek();
			if (asset) {
				return asset;
			}
			await flushEventLoop();
		}
		throw new Error(
			`sprite-harness: "${this.config.url}" did not load within budget`,
		);
	}

	/** Run the tag-playback system for `frames` steps of `dtMs` each. */
	step(dtMs: number, frames = 1): void {
		for (let i = 0; i < frames; i++) {
			this.ecs.update({
				dt: dtMs,
				ecs: this.ecs,
				assetManager: this.assets,
			} as unknown as UpdateContext);
		}
	}

	/** Drop the URL's cache entries — the editor save path's hot-reload trigger. */
	evict(): void {
		this.assets.evict(this.config.url);
	}
}
