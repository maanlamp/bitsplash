import { loadFontsFromUrl } from "./text/font-source";
import { loadFont, loadImage, type LoadedFont } from "./load";
import {
	composeSheet,
	SpriteAsset,
	type SheetComposer,
} from "./sprite/sprite-asset";
import { SpriteAssetCache } from "./sprite/sprite-asset-cache";

type Asset<T> = Readonly<
	| { status: "loading" }
	| { status: "ready"; data: T }
	| { status: "error"; error: Error }
>;

/**
 * Loads an image for a URL. Injectable so the generation-token logic can be
 * exercised headlessly (the default {@link loadImage} needs a DOM `Image`).
 */
export type ImageLoader = (url: string) => Promise<HTMLImageElement>;

/**
 * Fetches the raw bytes of a `.bsprite` archive for a URL. Injectable so the
 * facade's `.bsprite` load path is exercisable headlessly — the default uses
 * `fetch`, which cannot resolve `app://` URLs in a DOM-free test runner. A test
 * substitutes an in-memory source (e.g. v1 then v2 bytes) to drive hot reload.
 */
export type BspriteBytesLoader = (url: string) => Promise<Uint8Array>;

const fetchBspriteBytes: BspriteBytesLoader = (url) =>
	fetch(url)
		.then((response) => response.arrayBuffer())
		.then((buffer) => new Uint8Array(buffer));

export default class AssetManager {
	assets: Map<string, Asset<unknown>> = new Map();
	private imageLoadEpoch = 0;

	/**
	 * Per-cache-key monotonic generation counter. A load captures the current
	 * generation for its key at load-start and only writes its result back if the
	 * generation still matches on resolve — so a load left in flight by an
	 * {@link evict} cannot resurrect the evicted entry. The facade
	 * ({@link SpriteAssetCache}) keeps the same discipline for `.bsprite` loads.
	 */
	private readonly generations: Map<string, number> = new Map();

	/**
	 * Sprite facade: the single accessor for `.bsprite` and legacy-PNG pixels +
	 * metadata, backed by its own cache. Delegates legacy image/metadata loads
	 * back through this manager so the caches stay shared.
	 */
	readonly sprites: SpriteAssetCache = new SpriteAssetCache(this);

	constructor(
		private readonly loadImageFn: ImageLoader = loadImage,
		/** Byte source for `.bsprite` archives; swapped out in headless tests. */
		private readonly loadBspriteBytesFn: BspriteBytesLoader = fetchBspriteBytes,
		/** Sheet composer for baked frames; the default needs a DOM canvas. */
		private readonly composeSheetFn: SheetComposer = composeSheet,
	) {}

	/**
	 * Fetch, unzip and compose a `.bsprite` archive into a {@link SpriteAsset}
	 * through the injected byte-source and sheet composer. The facade
	 * ({@link SpriteAssetCache}) calls this and layers its own generation-token
	 * discipline on top, so an evicted, still-in-flight load cannot resurrect the
	 * entry. Splitting the two DOM-only steps (byte fetch, canvas compose) into
	 * injectable seams is what lets the whole load path run in a headless test.
	 */
	loadBspriteAsset(url: string): Promise<SpriteAsset> {
		return this.loadBspriteBytesFn(url).then((bytes) =>
			SpriteAsset.loadBsprite(url, bytes, this.composeSheetFn),
		);
	}

	/**
	 * A monotonic counter bumped whenever an image finishes loading (or errors)
	 * and whenever an image is {@link evict}ed. Consumers that derive geometry
	 * from image dimensions — e.g. the editor's pick index — poll this to know an
	 * unresolved image may now be ready (or an existing one has changed) without
	 * the manager holding references to them. Idle frames (nothing loads or
	 * evicts) leave it unchanged, so a poll is a cheap integer compare.
	 */
	get imageEpoch(): number {
		return this.imageLoadEpoch;
	}

	getImage(url: string): HTMLImageElement | void {
		const asset = this.assets.get(url) as
			| Asset<HTMLImageElement>
			| undefined;
		if (!asset) {
			this.beginLoad(url, () => this.loadImageFn(url), true);
			return;
		}
		return asset.status === "ready" ? asset.data : undefined;
	}

	getFont(url: string, size?: number): LoadedFont | void {
		const key = size === undefined ? url : `${url}@${size}`;
		const asset = this.assets.get(key) as
			| Asset<LoadedFont>
			| undefined;
		if (!asset) {
			this.beginLoad(
				key,
				() => loadFont(url, size === undefined ? {} : { size }),
				false,
			);
			return;
		}
		return asset.status === "ready" ? asset.data : undefined;
	}

	getFontFamilies(
		url: string,
		size?: number,
	): ReadonlyArray<LoadedFont> | void {
		const key =
			size === undefined
				? `families@${url}`
				: `families@${url}@${size}`;
		const asset = this.assets.get(key) as
			| Asset<ReadonlyArray<LoadedFont>>
			| undefined;
		if (!asset) {
			this.beginLoad(key, () => loadFontsFromUrl(url, size), false);
			return;
		}
		return asset.status === "ready" ? asset.data : undefined;
	}

	/**
	 * Drop every cache key derived from `url` — the image and the `.bsprite`
	 * facade entry — so a stale mix cannot survive a hot reload, and bump the
	 * key's generation so any load still in flight is dropped when it resolves
	 * rather than repopulating the cache. A previously-errored entry becomes
	 * retryable: the next {@link getImage} sees no entry and starts a fresh load.
	 * Bumps {@link imageEpoch} so pollers (the editor pick index) notice on their
	 * next poll.
	 *
	 * Freeing the old GPU textures is a separate, renderer-side concern — the
	 * editor save path pairs this with {@link import("./render/renderer-registry").invalidateImageEverywhere}
	 * / {@link import("./render/renderer-registry").invalidateTileArrayEverywhere}.
	 *
	 * @example
	 * game.assetManager.evict(savedUrl);
	 */
	evict(url: string): void {
		this.assets.delete(url);
		this.bumpGeneration(url);
		this.sprites.evict(url);
		this.imageLoadEpoch += 1;
	}

	private beginLoad<T>(
		key: string,
		loader: () => Promise<T>,
		bumpEpoch: boolean,
	): void {
		const token = this.bumpGeneration(key);
		this.assets.set(key, { status: "loading" });
		void loader()
			.then((data) =>
				this.settle(key, token, { status: "ready", data }, bumpEpoch),
			)
			.catch((error: unknown) =>
				this.settle(
					key,
					token,
					{
						status: "error",
						error:
							error instanceof Error
								? error
								: new Error(String(error)),
					},
					bumpEpoch,
				),
			);
	}

	private settle<T>(
		key: string,
		token: number,
		entry: Asset<T>,
		bumpEpoch: boolean,
	): void {
		if (this.generations.get(key) !== token) {
			return;
		}
		this.assets.set(key, entry);
		if (bumpEpoch) {
			this.imageLoadEpoch += 1;
		}
	}

	private bumpGeneration(key: string): number {
		const next = (this.generations.get(key) ?? 0) + 1;
		this.generations.set(key, next);
		return next;
	}
}
