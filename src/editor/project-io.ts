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

/**
 * Launch the real game in a separate desktop window (plan D9). No-op outside
 * the Electron shell, where no second window exists.
 */
export const launchGameWindow = async (): Promise<void> => {
	const bridge = (
		globalThis as {
			bitsplashDesktop?: { openGameWindow?: () => Promise<unknown> };
		}
	).bitsplashDesktop;
	await bridge?.openGameWindow?.();
};

const blobToBase64 = async (blob: Blob): Promise<string> => {
	const bytes = new Uint8Array(await blob.arrayBuffer());
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
};

export const fsProtocolUrl = (absolutePath: string): string =>
	`bitsplash-fs://local/${encodeURIComponent(absolutePath)}`;

export const saveLevel = async (
	sceneId: string,
	json: string,
): Promise<void> => {
	await getBridge().saveLevel({ sceneId, json });
};

export const uploadAsset = async (
	filename: string,
	data: Blob,
	overwrite: boolean,
): Promise<{ url: string; existed: boolean }> => {
	return getBridge().uploadAsset({
		filename,
		dataBase64: await blobToBase64(data),
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
	const blob = await fetch(fsProtocolUrl(absolutePath)).then(
		(response) => response.blob(),
	);
	const { url } = await uploadAsset(name, blob, false);
	return url;
};
