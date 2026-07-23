import type { ProjectRpcSchema } from "../project-rpc";

type Requests = ProjectRpcSchema["bun"]["requests"];

type Call<K extends keyof Requests> =
	Requests[K]["params"] extends void
		? () => Promise<Requests[K]["response"]>
		: (
				params: Requests[K]["params"],
			) => Promise<Requests[K]["response"]>;

type DesktopBridge = {
	[K in keyof Requests]: Call<K>;
};

const getBridge = (): DesktopBridge => {
	const bridge = (globalThis as { bitsplashDesktop?: DesktopBridge })
		.bitsplashDesktop;
	if (!bridge) {
		throw new Error("project-io requires the Electron desktop shell");
	}
	return bridge;
};

export const isDesktop = (): boolean =>
	!!(globalThis as { bitsplashDesktop?: DesktopBridge })
		.bitsplashDesktop;

export const fsProtocolUrl = (absolutePath: string): string =>
	`bitsplash-fs://local/${encodeURIComponent(absolutePath)}`;

export const saveLevel = async (
	sceneId: string,
	json: string,
): Promise<void> => {
	await getBridge().saveLevel({ sceneId, json });
};

/**
 * Persist a blob to the project's assets directory through the desktop shell's
 * atomic writer: the main process writes a unique temp file in the destination
 * directory, `fsync`s it, then renames it over the final path (retrying the
 * transient lock errors Windows raises), so a reader never observes a partial
 * file. Returns `existed: true` without writing when `overwrite` is false and
 * the target already exists.
 */
export const uploadAsset = async (
	filename: string,
	data: Blob,
	overwrite: boolean,
): Promise<{ url: string; existed: boolean }> => {
	return getBridge().writeAssetAtomic({
		filename,
		data: await data.arrayBuffer(),
		overwrite,
	});
};

export const getAssetsRoot = async (): Promise<string> =>
	(await getBridge().getAssetsRoot()).path;

/**
 * Read a file's UTF-8 text through the desktop bridge (main-process `fs`), the
 * same IPC path the editor uses for its other project I/O. Use this — not a
 * cross-origin `fetch` to `bitsplash-fs://` — to load authored JSON (prefabs,
 * scene data): under COEP `credentialless`, the fs protocol's CORP-without-CORS
 * response blocks a `cors`-mode fetch, so a `fetch` of that scheme fails.
 */
export const readTextFile = async (path: string): Promise<string> =>
	(await getBridge().readTextFile({ path })).text;

/**
 * Read a file's raw bytes through the desktop bridge (main-process `fs`), the
 * binary counterpart to {@link readTextFile}. Use this for asset bytes
 * (`.bsprite` archives, imports) rather than a cross-origin `fetch` to
 * `bitsplash-fs://`, which COEP `credentialless` blocks in `cors` mode.
 */
export const readBinaryFile = async (
	path: string,
): Promise<ArrayBuffer> =>
	(await getBridge().readBinaryFile({ path })).data;

const ASSET_URL_PREFIX = "/src/game/content/assets/";

/**
 * Read an asset's raw bytes from its web URL (`/src/game/content/assets/…`, as
 * returned by {@link uploadAsset}). Resolves the URL to an absolute filesystem
 * path under the assets root and reads it through {@link readBinaryFile} — the
 * bridge path, not a cross-origin `fetch` (which COEP `credentialless` blocks for
 * the `bitsplash-fs://` scheme). Used to load `.bsprite` archive bytes.
 */
export const readAssetBytes = async (
	url: string,
): Promise<ArrayBuffer> => {
	const clean = (url.split("?")[0] ?? url).split("#")[0]!;
	const rel = clean.startsWith(ASSET_URL_PREFIX)
		? clean.slice(ASSET_URL_PREFIX.length)
		: (clean.split("/").pop() ?? clean);
	const root = await getAssetsRoot();
	return readBinaryFile(`${root.replace(/\\/g, "/")}/${rel}`);
};

export const listDir = (path: string) =>
	getBridge().listDir({ path });

export const listAssetsDeep = async () =>
	(await getBridge().listAssetsDeep()).entries;

export const renameEntry = (path: string, newName: string) =>
	getBridge().rename({ path, newName });

export const makeDir = (parent: string, name: string) =>
	getBridge().mkdir({ parent, name });

export const deleteEntry = async (path: string): Promise<string> =>
	(await getBridge().del({ path })).token;

export const restoreEntry = async (token: string): Promise<void> => {
	await getBridge().restore({ token });
};

export const openImageDialog = async (): Promise<string | null> =>
	(await getBridge().openImageDialog()).path;

export const openFileDialog = async (
	accept: string,
): Promise<string | null> =>
	(await getBridge().openFileDialog({ accept })).path;

export const resolveToWebPath = async (
	absolutePath: string,
): Promise<string> => {
	const norm = (value: string) => value.replace(/\\/g, "/");
	const root = norm(await getAssetsRoot());
	const path = norm(absolutePath);
	if (path.startsWith(`${root}/`)) {
		return `/src/game/content/assets/${path.slice(root.length + 1)}`;
	}
	const name = path.split("/").pop() ?? "asset";
	const bytes = await readBinaryFile(absolutePath);
	const { url } = await uploadAsset(name, new Blob([bytes]), false);
	return url;
};
