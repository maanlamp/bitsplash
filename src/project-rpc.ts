export type AssetEntry = Readonly<{
	name: string;
	url: string;
	ext: string;
	isPng: boolean;
	isAudio: boolean;
	isFont: boolean;
	isTileset: boolean;
}>;

export type DirEntry = Readonly<{
	name: string;
	path: string;
	isDirectory: boolean;
}>;

export type ProjectRpcSchema = {
	bun: {
		requests: {
			saveLevel: {
				params: { sceneId: string; json: string };
				response: { saved: true };
			};
			uploadAsset: {
				params: {
					filename: string;
					dataBase64: string;
					overwrite: boolean;
				};
				response: { url: string; existed: boolean };
			};
			getAssetsRoot: {
				params: void;
				response: { path: string };
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
