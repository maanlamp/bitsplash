/**
 * Asset classification. For `.bsprite` files it is manifest-driven (parsed by
 * the main process); for other files it is derived from the filename. `unknown`
 * covers a corrupt/unreadable `.bsprite` archive.
 */
export type AssetKind =
	| "sprite"
	| "tileset"
	| "audio"
	| "font"
	| "prefab"
	| "unknown";

export type AssetEntry = Readonly<{
	name: string;
	url: string;
	ext: string;
	isPng: boolean;
	isAudio: boolean;
	isFont: boolean;
	isTileset: boolean;
	/** Manifest-driven kind; present only for `.bsprite` entries. */
	kind?: AssetKind;
}>;

export type DirEntry = Readonly<{
	name: string;
	path: string;
	isDirectory: boolean;
	/**
	 * Manifest-driven kind; present only for `.bsprite` entries, letting the
	 * asset browser's synchronous dragstart classify without an async round-trip.
	 */
	kind?: AssetKind;
}>;

export type ProjectRpcSchema = {
	bun: {
		requests: {
			saveLevel: {
				params: { sceneId: string; json: string };
				response: { saved: true };
			};
			writeAssetAtomic: {
				params: {
					filename: string;
					data: ArrayBuffer;
					overwrite: boolean;
				};
				response: { url: string; existed: boolean };
			};
			getAssetsRoot: {
				params: void;
				response: { path: string };
			};
			readTextFile: {
				params: { path: string };
				response: { text: string };
			};
			readBinaryFile: {
				params: { path: string };
				response: { data: ArrayBuffer };
			};
			listDir: {
				params: { path: string };
				response: {
					entries: ReadonlyArray<DirEntry>;
					parent: string;
				};
			};
			listAssetsDeep: {
				params: void;
				response: { entries: ReadonlyArray<AssetEntry> };
			};
			rename: {
				params: { path: string; newName: string };
				response:
					| { renamed: true; path: string }
					| { renamed: false; reason: "exists" };
			};
			mkdir: {
				params: { parent: string; name: string };
				response: { path: string };
			};
			del: {
				params: { path: string };
				response: { token: string };
			};
			restore: {
				params: { token: string };
				response: { restored: true };
			};
			openImageDialog: {
				params: void;
				response: { path: string | null };
			};
			openFileDialog: {
				params: { accept: string };
				response: { path: string | null };
			};
		};
		messages: Record<string, never>;
	};
	webview: {
		requests: Record<string, never>;
		messages: Record<string, never>;
	};
};
