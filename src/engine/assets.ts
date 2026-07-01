import { loadFontsFromUrl } from "./text/font-source";
import { loadFont, loadImage, type LoadedFont } from "./load";
import { readPngMetadata } from "./png-metadata";

type Asset<T> = Readonly<
	| { status: "loading" }
	| { status: "ready"; data: T }
	| { status: "error"; error: Error }
>;

export default class AssetManager {
	assets: Map<string, Asset<unknown>> = new Map();

	getImage(url: string): HTMLImageElement | void {
		if (!this.assets.has(url)) {
			this.assets.set(url, { status: "loading" });
			void loadImage(url)
				.then((data) => {
					this.assets.set(url, { status: "ready", data });
				})
				.catch((error) => {
					this.assets.set(url, { status: "error", error });
				});
		} else {
			const asset = this.assets.get(url) as
				| Asset<HTMLImageElement>
				| undefined;
			if (asset?.status !== "ready") {
				return;
			}
			return asset.data;
		}
	}

	getImageMetadata(
		url: string,
	): Record<string, unknown> | null | void {
		const key = `meta@${url}`;
		if (!this.assets.has(key)) {
			this.assets.set(key, { status: "loading" });
			void fetch(url)
				.then((response) => response.arrayBuffer())
				.then((buffer) => {
					this.assets.set(key, {
						status: "ready",
						data: readPngMetadata(buffer),
					});
				})
				.catch((error) => {
					this.assets.set(key, { status: "error", error });
				});
		} else {
			const asset = this.assets.get(key) as
				| Asset<Record<string, unknown> | null>
				| undefined;
			if (asset?.status !== "ready") {
				return;
			}
			return asset.data;
		}
	}

	getFont(url: string, size?: number): LoadedFont | void {
		const key = size === undefined ? url : `${url}@${size}`;
		if (!this.assets.has(key)) {
			this.assets.set(key, { status: "loading" });
			void loadFont(url, size === undefined ? {} : { size })
				.then((data) => {
					this.assets.set(key, { status: "ready", data });
				})
				.catch((error) => {
					this.assets.set(key, { status: "error", error });
				});
		} else {
			const asset = this.assets.get(key) as
				| Asset<LoadedFont>
				| undefined;
			if (asset?.status !== "ready") {
				return;
			}
			return asset.data;
		}
	}

	getFontFamilies(
		url: string,
		size?: number,
	): ReadonlyArray<LoadedFont> | void {
		const key =
			size === undefined
				? `families@${url}`
				: `families@${url}@${size}`;
		if (!this.assets.has(key)) {
			this.assets.set(key, { status: "loading" });
			void loadFontsFromUrl(url, size)
				.then((data) => {
					this.assets.set(key, { status: "ready", data });
				})
				.catch((error) => {
					this.assets.set(key, { status: "error", error });
				});
		} else {
			const asset = this.assets.get(key) as
				| Asset<ReadonlyArray<LoadedFont>>
				| undefined;
			if (asset?.status !== "ready") {
				return;
			}
			return asset.data;
		}
	}
}
